import { randomUUID } from "node:crypto";
import {
  musicLimits, musicModuleConfigSchema, musicSnapshotSchema, musicStatusSchema, projectMusicWidget,
  type MusicModuleConfig, type MusicSnapshot, type MusicSourceAdapter, type MusicStatus, type MusicWidgetProjection,
  type OverlayTargetProfileId, type PearConfiguration
} from "@stream-jams/core";
import type { PrivateArtworkDescriptor } from "./pear-normalization.js";

export interface MusicRuntimeSource {
  readonly providerId: string;
  readonly configuration: PearConfiguration;
  /** Server-only. The coordinator never publishes or stores the credential. */
  readonly token: string;
}

export interface MusicRuntimePublication {
  readonly revision: number;
  readonly generation: string | null;
  readonly status: MusicStatus;
  getProjection(targetProfileId: OverlayTargetProfileId): MusicWidgetProjection | null;
}

export interface MusicRuntimeCoordinatorOptions {
  readonly getConfig: () => Promise<{ readonly enabled: boolean; readonly config: unknown }>;
  readonly getActiveSource: () => Promise<MusicRuntimeSource | null>;
  readonly createSource: (source: MusicRuntimeSource, generation: string) => MusicSourceAdapter;
  readonly sink?: (publication: MusicRuntimePublication) => Promise<void> | void;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

const disconnected: MusicStatus = { state: "disconnected", stale: false, diagnosticReference: null };

/** Owns only live playback; the repository owns enabled state and appearance configuration. */
export class MusicRuntimeCoordinator {
  readonly #options: MusicRuntimeCoordinatorOptions;
  readonly #now: () => number;
  #config: MusicModuleConfig | null = null;
  #source: MusicSourceAdapter | null = null;
  #controller: AbortController | null = null;
  #generation: string | null = null;
  #snapshot: MusicSnapshot | null = null;
  #lastAcceptedRevision = -1;
  #status: MusicStatus = disconnected;
  #appearanceStartedAtEpochMs: number | null = null;
  #revision = 0;
  #lifecycle = 0;
  #transition: Promise<void> = Promise.resolve();
  #deadline: unknown = null;
  #activePublication: Promise<void> | null = null;
  #pendingPublication: MusicRuntimePublication | null = null;
  #listeners = new Set<(revision: number) => void>();
  #closed = false;
  #suspended = false;

  constructor(options: MusicRuntimeCoordinatorOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  get generation(): string | null { return this.#generation; }
  get revision(): number { return this.#revision; }
  getStatus(): MusicStatus { return { ...this.#status }; }
  getProjection(targetProfileId: OverlayTargetProfileId): MusicWidgetProjection | null {
    if (this.#config === null) return null;
    return projectMusicWidget(this.#snapshot, this.#status, this.#config, targetProfileId, this.#appearanceStartedAtEpochMs, this.#now());
  }
  getArtworkDescriptor(ref: string, owner: Pick<MusicSnapshot, "providerId" | "generation">): PrivateArtworkDescriptor | null {
    if (this.#generation !== owner.generation || this.#snapshot?.providerId !== owner.providerId || this.#snapshot.track?.artworkRef !== ref) return null;
    const source = this.#source as (MusicSourceAdapter & { getArtworkDescriptor?: (ref: string, owner: Pick<MusicSnapshot, "providerId" | "generation">) => PrivateArtworkDescriptor | null }) | null;
    return source?.getArtworkDescriptor?.(ref, owner) ?? null;
  }
  getCurrentArtwork(): { readonly ref: string; readonly owner: Pick<MusicSnapshot, "providerId" | "generation">; readonly descriptor: PrivateArtworkDescriptor } | null {
    if (this.#status.state !== "connected" || this.#status.stale || this.#snapshot?.track?.artworkRef == null) return null;
    const ref = this.#snapshot.track.artworkRef;
    const owner = { providerId: this.#snapshot.providerId, generation: this.#snapshot.generation };
    const descriptor = this.getArtworkDescriptor(ref, owner);
    return descriptor === null ? null : { ref, owner, descriptor };
  }
  subscribe(listener: (revision: number) => void): () => void {
    this.#listeners.add(listener);
    try { listener(this.#revision); }
    // error-provenance: allow expected -- recipient callbacks cannot interrupt source ownership
    catch { /* A recipient can retry from the current revision. */ }
    return () => { this.#listeners.delete(listener); };
  }

  /** Saved appearance changes publish against the live source without re-owning its track. */
  async refreshConfig(): Promise<void> {
    if (this.#closed) return;
    const lifecycle = this.#lifecycle;
    const settings = await this.#options.getConfig();
    if (this.#closed || lifecycle !== this.#lifecycle) return;
    if (!settings.enabled || this.#source === null) { await this.reconcile(); return; }
    this.#config = musicModuleConfigSchema.parse(settings.config);
    this.#publish();
  }

  /** Invalidate synchronously so late callbacks cannot win while an old adapter is stopping. */
  reconcile(): Promise<void> {
    if (this.#closed || this.#suspended) return Promise.resolve();
    const lifecycle = ++this.#lifecycle;
    const oldSource = this.#source;
    this.#controller?.abort();
    this.#source = null; this.#controller = null; this.#generation = null;
    this.#snapshot = null; this.#lastAcceptedRevision = -1; this.#appearanceStartedAtEpochMs = null; this.#status = disconnected;
    this.#cancelDeadline(); this.#publish();
    this.#transition = this.#transition.catch(() => {}).then(async () => {
      await oldSource?.stop();
      if (this.#closed || lifecycle !== this.#lifecycle) return;
      const settings = await this.#options.getConfig();
      if (this.#closed || lifecycle !== this.#lifecycle) return;
      this.#config = musicModuleConfigSchema.parse(settings.config);
      if (!settings.enabled) { this.#publish(); return; }
      const selected = await this.#options.getActiveSource();
      if (this.#closed || lifecycle !== this.#lifecycle) return;
      if (selected === null) { this.#publish(); return; }
      const generation = `music_${randomUUID()}`;
      const controller = new AbortController();
      const source = this.#options.createSource(selected, generation);
      this.#source = source; this.#controller = controller; this.#generation = generation;
      this.#status = { state: "connecting", stale: false, diagnosticReference: null };
      this.#publish();
      void source.start(
        snapshot => this.#acceptSnapshot(snapshot, lifecycle, selected.providerId, generation),
        status => this.#acceptStatus(status, lifecycle, generation),
        controller.signal
      ).catch(() => {
        if (!this.#owns(lifecycle, generation)) return;
        if (this.#status.state === "auth-required") return;
        this.#status = { state: "error", stale: false, diagnosticReference: null };
        this.#snapshot = null; this.#appearanceStartedAtEpochMs = null;
        this.#publish();
      });
    });
    return this.#transition;
  }

  /** Drain the live source before a portable restore replaces its registration. */
  async suspendForMaintenance(): Promise<void> {
    this.#suspended = true;
    ++this.#lifecycle;
    this.#controller?.abort();
    const source = this.#source;
    this.#source = null; this.#controller = null; this.#generation = null;
    this.#snapshot = null; this.#lastAcceptedRevision = -1;
    this.#appearanceStartedAtEpochMs = null; this.#status = disconnected;
    this.#cancelDeadline(); this.#publish();
    await this.#transition.catch(() => {});
    await source?.stop();
  }

  resumeAfterMaintenance(): Promise<void> {
    this.#suspended = false;
    return this.reconcile();
  }

  async stop(): Promise<void> {
    if (this.#closed) { await this.#transition.catch(() => {}); return; }
    this.#closed = true; ++this.#lifecycle;
    this.#controller?.abort();
    const source = this.#source;
    this.#source = null; this.#controller = null; this.#generation = null;
    this.#snapshot = null; this.#lastAcceptedRevision = -1; this.#appearanceStartedAtEpochMs = null; this.#status = disconnected;
    this.#cancelDeadline(); this.#publish();
    await this.#transition.catch(() => {});
    await source?.stop();
    this.#listeners.clear();
  }

  #owns(lifecycle: number, generation: string): boolean {
    return !this.#closed && this.#lifecycle === lifecycle && this.#generation === generation;
  }
  #acceptSnapshot(value: MusicSnapshot, lifecycle: number, providerId: string, generation: string): void {
    if (!this.#owns(lifecycle, generation)) return;
    const parsed = musicSnapshotSchema.safeParse(value);
    if (!parsed.success || parsed.data.providerId !== providerId || parsed.data.generation !== generation || parsed.data.revision <= this.#lastAcceptedRevision) return;
    const previous = this.#snapshot;
    this.#snapshot = parsed.data;
    this.#lastAcceptedRevision = parsed.data.revision;
    const oldTrack = previous?.track;
    const nextTrack = parsed.data.track;
    if (nextTrack === null) this.#appearanceStartedAtEpochMs = null;
    else if (oldTrack === null || oldTrack === undefined || oldTrack.id !== nextTrack.id || previous?.session?.id !== parsed.data.session?.id) this.#appearanceStartedAtEpochMs = this.#now();
    this.#publish();
  }
  #acceptStatus(value: MusicStatus, lifecycle: number, generation: string): void {
    if (!this.#owns(lifecycle, generation)) return;
    const parsed = musicStatusSchema.safeParse(value);
    if (!parsed.success) return;
    if (parsed.data.state !== "connected" || parsed.data.stale) {
      this.#snapshot = null; this.#appearanceStartedAtEpochMs = null;
    }
    this.#status = parsed.data;
    this.#publish();
  }
  #cancelDeadline(): void {
    if (this.#deadline !== null) (this.#options.cancel ?? clearTimeout)(this.#deadline as ReturnType<typeof setTimeout>);
    this.#deadline = null;
  }
  #armDeadline(): void {
    this.#cancelDeadline();
    const snapshot = this.#snapshot;
    if (snapshot === null || snapshot.track === null || this.#status.state !== "connected" || this.#status.stale) return;
    const now = this.#now();
    const staleAt = snapshot.observedAtEpochMs + musicLimits.staleAfterMs + 1;
    if (now >= staleAt) {
      this.#status = { ...this.#status, stale: true };
      this.#snapshot = null; this.#appearanceStartedAtEpochMs = null;
      return;
    }
    const idleAt = this.#appearanceStartedAtEpochMs === null || this.#config === null ? Infinity : Math.min(...Object.values(this.#config.profiles)
      .filter(profile => profile.idleMode !== "none")
      .map(profile => this.#appearanceStartedAtEpochMs! + profile.idleAfterSeconds * 1000)
      .filter(deadline => deadline > now));
    const next = Math.min(idleAt, staleAt);
    this.#deadline = (this.#options.schedule ?? setTimeout)(() => {
      this.#deadline = null;
      this.#publish();
    }, Math.max(1, next - now));
    if (typeof this.#deadline === "object" && this.#deadline !== null && "unref" in this.#deadline) (this.#deadline as { unref(): void }).unref();
  }
  #publish(): void {
    this.#armDeadline();
    const revision = ++this.#revision;
    for (const listener of this.#listeners) {
      try { listener(revision); }
      // error-provenance: allow expected -- recipient callbacks cannot interrupt source ownership
      catch { /* The latest revision remains available to the recipient. */ }
    }
    if (this.#options.sink === undefined) return;
    const status = { ...this.#status };
    const snapshot = this.#snapshot;
    const config = this.#config;
    const epoch = this.#appearanceStartedAtEpochMs;
    const now = this.#now();
    const event: MusicRuntimePublication = {
      revision, generation: this.#generation, status,
      getProjection: target => config === null ? null : projectMusicWidget(snapshot, status, config, target, epoch, now)
    };
    this.#pendingPublication = event;
    this.#drainPublication();
  }
  #drainPublication(): void {
    if (this.#activePublication !== null || this.#pendingPublication === null || this.#options.sink === undefined) return;
    const publication = this.#pendingPublication;
    this.#pendingPublication = null;
    this.#activePublication = Promise.resolve().then(() => this.#options.sink!(publication)).catch(() => {}).then(() => {
      this.#activePublication = null;
      this.#drainPublication();
    });
  }
}
