import { desktopVisualRendererRequestSchema, maxDesktopVisualTransferBytes, type DesktopVisualAsset, type DesktopVisualBatch, type DesktopVisualRendererReply, type DesktopVisualRendererRequest, type PlaybackTiming, type SurfaceConfiguration, type VisualRecipientKey } from "@stream-jams/core";
type Configuration = Extract<SurfaceConfiguration, { kind: "desktop" }>;
export interface DesktopOverlaySnapshot {
  config: Configuration;
  occurrences: readonly { key: VisualRecipientKey; timing: PlaybackTiming; instructions: DesktopVisualBatch["instructions"]; assetUrls: ReadonlyMap<string, string> }[];
}
export interface DesktopOverlayControllerDependencies {
  report(reply: DesktopVisualRendererReply): void;
  changed(): void;
  prepareAsset(asset: DesktopVisualAsset): Promise<{ url: string; dispose(): void }>;
  now?: () => number;
}
type Envelope = Pick<DesktopVisualRendererRequest, "generation" | "requestId">;
type PreparedAsset = Awaited<ReturnType<DesktopOverlayControllerDependencies["prepareAsset"]>>;
type Occurrence = {
  view: DesktopOverlaySnapshot["occurrences"][number];
  state: "preparing" | "ready" | "scheduled" | "active" | "cancelled";
  prepare: Envelope | null;
  start: Envelope | null;
  requestIds: Set<string>;
  queue: DesktopVisualAsset[];
  resources: PreparedAsset[];
  urls: Map<string, string>;
  bytes: number;
  loading: boolean;
  prepareTimer: ReturnType<typeof setTimeout> | undefined;
  startTimer: ReturnType<typeof setTimeout> | undefined;
  endTimer: ReturnType<typeof setTimeout> | undefined;
};

/** Browser-only media lifetime owner. Native transport owns the final watchdog. */
export class DesktopOverlayController {
  #snapshot: DesktopOverlaySnapshot = { config: { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, opacity: 1, layers: [] }, occurrences: [] };
  #generation: number | null = null;
  #disposed = false;
  #records = new Map<string, Occurrence>();
  #recent = new Set<string>();
  #bytes = 0;
  readonly #now: () => number;

  constructor(private readonly dependencies: DesktopOverlayControllerDependencies) { this.#now = dependencies.now ?? Date.now; }
  getSnapshot(): DesktopOverlaySnapshot { return this.#snapshot; }

  receive(candidate: unknown): void {
    if (this.#disposed) return;
    const parsed = desktopVisualRendererRequestSchema.safeParse(candidate);
    if (!parsed.success) return;
    const { generation, requestId, command } = parsed.data;
    if (this.#generation === null) {
      if (command.type !== "configure") return;
      this.#generation = generation;
    }
    if (generation !== this.#generation || this.#recent.has(requestId) || [...this.#records.values()].some(record => record.requestIds.has(requestId))) return;
    this.#recent.add(requestId);
    if (this.#recent.size > 64) this.#recent.delete(this.#recent.values().next().value!);
    const envelope = { generation, requestId };
    switch (command.type) {
      case "configure": {
        if (command.config.kind !== "desktop") return;
        if (!command.config.enabled || command.config.displayId !== this.#snapshot.config.displayId) this.#clear();
        this.#publish(command.config);
        this.#report(envelope, { type: "ok" });
        break;
      }
      case "prepare": this.#prepare(envelope, command.batch); break;
      case "start": this.#start(envelope, command.key); break;
      case "stop": {
        const record = this.#records.get(identity(command.key));
        if (record !== undefined) this.#finish(record, "error");
        this.#report(envelope, { type: "ok" }); break;
      }
      case "retry": this.#clear(); this.#report(envelope, { type: "ok" }); break;
      case "close": this.dispose(); this.#report(envelope, { type: "ok" }); break;
    }
  }

  fail(key: VisualRecipientKey): void {
    const record = this.#records.get(identity(key));
    if (record !== undefined) this.#finish(record, "error");
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clear(); this.#recent.clear();
    // No new admission is possible; late loader callbacks still own their record.
    this.#records.clear(); this.#bytes = 0;
  }

  #prepare(envelope: Envelope, batch: DesktopVisualBatch): void {
    const bytes = batch.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (!this.#snapshot.config.enabled || this.#snapshot.config.displayId === null || batch.key.surfaceId !== this.#snapshot.config.id || this.#now() >= batch.timing.endsAtEpochMs ||
      this.#records.size >= 64 || this.#bytes + bytes > maxDesktopVisualTransferBytes || this.#records.has(identity(batch.key))) {
      this.#report(envelope, { type: "error", key: batch.key }); return;
    }
    const urls = new Map<string, string>();
    const record: Occurrence = {
      view: { key: batch.key, timing: batch.timing, instructions: batch.instructions.map(instruction => ({ ...instruction, timing: batch.timing, targetProfileId: "landscape" })), assetUrls: urls },
      state: "preparing", prepare: envelope, start: null, requestIds: new Set([envelope.requestId]), queue: batch.assets, resources: [], urls, bytes, loading: true,
      prepareTimer: undefined, startTimer: undefined, endTimer: undefined
    };
    this.#records.set(identity(batch.key), record); this.#bytes += bytes;
    record.prepareTimer = setTimeout(() => this.#finish(record, "error"), 5000);
    record.endTimer = setTimeout(() => this.#finish(record, "complete"), Math.max(0, batch.timing.endsAtEpochMs - this.#now()));
    void this.#load(record);
  }

  async #load(record: Occurrence): Promise<void> {
    try {
      while (record.queue.length > 0) {
        const asset = record.queue.shift()!;
        const resource = await this.dependencies.prepareAsset(asset);
        if (record.state === "cancelled" || this.#disposed) { releaseResource(resource); return; }
        record.resources.push(resource); record.urls.set(asset.assetId, resource.url);
      }
      if (record.state === "cancelled" || this.#now() >= record.view.timing.endsAtEpochMs) { this.#finish(record, "error"); return; }
      clearTimeout(record.prepareTimer); record.prepareTimer = undefined;
      record.state = "ready";
      const preparing = record.prepare; record.prepare = null;
      if (preparing !== null) this.#report(preparing, { type: "ready", key: record.view.key });
    } catch { this.#finish(record, "error"); }
    finally {
      record.loading = false;
      if (record.state === "cancelled") this.#release(record);
    }
  }

  #start(envelope: Envelope, key: VisualRecipientKey): void {
    const record = this.#records.get(identity(key));
    if (record === undefined || record.state !== "ready" || this.#now() >= record.view.timing.endsAtEpochMs) {
      this.#report(envelope, { type: "error", key }); return;
    }
    record.start = envelope; record.requestIds.add(envelope.requestId);
    record.state = "scheduled";
    const activate = () => {
      record.startTimer = undefined;
      if (record.state !== "scheduled") return;
      if (this.#now() >= record.view.timing.endsAtEpochMs) { this.#finish(record, "error"); return; }
      record.state = "active"; this.#publish();
    };
    const delay = record.view.timing.startsAtEpochMs - this.#now();
    if (delay > 0) record.startTimer = setTimeout(activate, delay); else activate();
  }

  #finish(record: Occurrence, result: "complete" | "error"): void {
    if (record.state === "cancelled") return;
    const wasActive = record.state === "active";
    record.state = "cancelled";
    clearTimeout(record.prepareTimer); clearTimeout(record.startTimer); clearTimeout(record.endTimer);
    record.prepareTimer = undefined; record.startTimer = undefined; record.endTimer = undefined;
    record.queue.length = 0;
    const preparing = record.prepare; const started = record.start;
    record.prepare = null; record.start = null;
    if (wasActive) this.#publish();
    for (const resource of record.resources) releaseResource(resource);
    // Published maps stay immutable for external-store consumers. Revocation
    // releases media; old snapshots may retain only their inert URL strings.
    record.resources.length = 0;
    // In-flight preloads cannot be aborted by this interface. Keep their admission
    // and byte reservation until settled, including across retry/reconfiguration.
    if (!record.loading) this.#release(record);
    if (preparing !== null) this.#report(preparing, { type: "error", key: record.view.key });
    if (started !== null) this.#report(started, { type: result, key: record.view.key });
  }
  #release(record: Occurrence): void {
    const id = identity(record.view.key);
    if (this.#records.get(id) !== record) return;
    this.#records.delete(id); this.#bytes -= record.bytes;
  }
  #clear(): void { for (const record of this.#records.values()) this.#finish(record, "error"); }
  #publish(config = this.#snapshot.config): void {
    this.#snapshot = { config, occurrences: [...this.#records.values()].filter(record => record.state === "active").map(record => record.view) };
    this.dependencies.changed();
  }
  #report(envelope: Envelope, result: DesktopVisualRendererReply["result"]): void { this.dependencies.report({ ...envelope, result }); }
}
function identity(key: VisualRecipientKey): string { return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation]); }
function releaseResource(resource: PreparedAsset): void { try { resource.dispose(); } catch { /* Continue releasing other media after an isolated cleanup failure. */ } }
