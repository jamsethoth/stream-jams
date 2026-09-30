import { desktopVisualRendererRequestSchema, maxDesktopVisualTransferBytes, serializeException, type DesktopModuleSync, type DesktopVisualAsset, type DesktopVisualBatch, type DesktopVisualRendererReply, type DesktopVisualRendererRequest, type OverlayModulePresentation, type OverlayPlaybackFailure, type PlaybackTiming, type SurfaceConfiguration, type VisualRecipientKey } from "@stream-jams/core";
type Configuration = Extract<SurfaceConfiguration, { kind: "desktop" }>;
export interface DesktopOverlaySnapshot {
  config: Configuration;
  occurrences: readonly { key: VisualRecipientKey; timing: PlaybackTiming; instructions: DesktopVisualBatch["instructions"]; assetUrls: ReadonlyMap<string, string>; preparing?: boolean }[];
  modules: readonly { moduleId: DesktopModuleSync["moduleId"]; revision: number; presentation: OverlayModulePresentation; assetUrls: ReadonlyMap<string, string> }[];
}
export interface DesktopOverlayControllerDependencies {
  report(reply: DesktopVisualRendererReply): void;
  changed(): void;
  prepareAsset(asset: DesktopVisualAsset): Promise<{ url: string; dispose(): void }>;
  now?: () => number;
}
type Envelope = Pick<DesktopVisualRendererRequest, "generation" | "requestId">;
type TimingDiagnostics = import("@stream-jams/core").PlaybackTimingDiagnostics;
type PreparedAsset = Awaited<ReturnType<DesktopOverlayControllerDependencies["prepareAsset"]>>;
type Occurrence = {
  view: DesktopOverlaySnapshot["occurrences"][number];
  state: "preparing" | "decoding" | "ready" | "scheduled" | "active" | "cancelled";
  pendingReady: Set<string>;
  pendingCompletion: Set<string>;
  diagnostics?: TimingDiagnostics;
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
type ModuleRecord = DesktopOverlaySnapshot["modules"][number] & { resources: PreparedAsset[]; bytes: number };
type ModuleLoad = { envelope: Envelope; revision: number; cancelled: boolean; resources: PreparedAsset[]; bytes: number };

/** Browser-only media lifetime owner. Native transport owns the final watchdog. */
export class DesktopOverlayController {
  #snapshot: DesktopOverlaySnapshot = { config: { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, displayLabel: null, autoFollowDisplayName: false, opacity: 1, layers: [] }, occurrences: [], modules: [] };
  #generation: number | null = null;
  #disposed = false;
  #records = new Map<string, Occurrence>();
  #modules = new Map<string, ModuleRecord>();
  #moduleLoads = new Map<string, ModuleLoad>();
  #moduleRevisions = new Map<string, number>();
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
      case "sync-module": void this.#syncModule(envelope, command); break;
      case "start": this.#start(envelope, command.key, command.timing); break;
      case "stop": {
        const record = this.#records.get(identity(command.key));
        if (record !== undefined) this.#finish(record, "error");
        this.#report(envelope, { type: "ok" }); break;
      }
      case "retry": this.#clear(); this.#report(envelope, { type: "ok" }); break;
      case "close": this.dispose(); this.#report(envelope, { type: "ok" }); break;
    }
  }

  fail(key: VisualRecipientKey, failure?: OverlayPlaybackFailure, diagnostics?: TimingDiagnostics): void {
    const record = this.#records.get(identity(key));
    if (record !== undefined) this.#finish(record, "error", failure === undefined ? undefined : { ...failure, ...(diagnostics === undefined ? {} : { diagnostics }) });
  }
  ready(key: VisualRecipientKey, instructionId: string): void {
    const record = this.#records.get(identity(key));
    if (record?.state !== "decoding") return;
    record.pendingReady.delete(instructionId);
    if (record.pendingReady.size === 0) this.#prepared(record);
  }
  complete(key: VisualRecipientKey, instructionId: string, diagnostics?: TimingDiagnostics): void {
    const record = this.#records.get(identity(key));
    if (record?.state !== "active" || record.view.preparing !== false) return;
    if (!record.pendingCompletion.delete(instructionId)) return;
    if (diagnostics !== undefined) record.diagnostics = mergeDiagnostics(record.diagnostics, diagnostics);
    if (record.pendingCompletion.size === 0) this.#finish(record, "complete");
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
      view: { key: batch.key, timing: batch.timing, instructions: batch.instructions.map(instruction => ({ ...instruction, timing: batch.timing, targetProfileId: "landscape" })), assetUrls: urls, ...(batch.deferredStart === true ? { preparing: true } : {}) },
      pendingReady: new Set(batch.instructions.map(instruction => instruction.id)),
      pendingCompletion: new Set(batch.instructions.map(instruction => instruction.id)),
      state: "preparing", prepare: envelope, start: null, requestIds: new Set([envelope.requestId]), queue: batch.assets, resources: [], urls, bytes, loading: true,
      prepareTimer: undefined, startTimer: undefined, endTimer: undefined
    };
    this.#records.set(identity(batch.key), record); this.#bytes += bytes;
    record.prepareTimer = setTimeout(() => this.#finish(record, "error"), 5000);
    if (batch.deferredStart !== true) record.endTimer = setTimeout(() => this.#finish(record, "complete"), Math.max(0, batch.timing.endsAtEpochMs - this.#now()));
    void this.#load(record);
  }

  async #syncModule(envelope: Envelope, sync: DesktopModuleSync): Promise<void> {
    const latest = this.#moduleRevisions.get(sync.moduleId) ?? -1;
    if (sync.revision <= latest) { this.#report(envelope, { type: "ok" }); return; }
    this.#moduleRevisions.set(sync.moduleId, sync.revision);
    const previousLoad = this.#moduleLoads.get(sync.moduleId);
    if (previousLoad !== undefined) this.#cancelModuleLoad(sync.moduleId, previousLoad);
    if (sync.presentation === null) {
      this.#removeModule(sync.moduleId); this.#publish(); this.#report(envelope, { type: "ok" }); return;
    }
    const bytes = sync.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (!this.#snapshot.config.enabled || this.#snapshot.config.displayId === null || this.#bytes + bytes > maxDesktopVisualTransferBytes) {
      this.#report(envelope, null, failure("Desktop timer snapshot could not be admitted.")); return;
    }
    const load: ModuleLoad = { envelope, revision: sync.revision, cancelled: false, resources: [], bytes };
    this.#moduleLoads.set(sync.moduleId, load); this.#bytes += bytes;
    const urls = new Map<string, string>();
    try {
      for (const asset of sync.assets) {
        const resource = await this.dependencies.prepareAsset(asset);
        if (load.cancelled || this.#disposed || this.#moduleLoads.get(sync.moduleId) !== load) { releaseResource(resource); return; }
        load.resources.push(resource); urls.set(asset.assetId, resource.url);
      }
      if (load.cancelled || this.#disposed || this.#moduleLoads.get(sync.moduleId) !== load) return;
      this.#moduleLoads.delete(sync.moduleId);
      this.#removeModule(sync.moduleId);
      this.#modules.set(sync.moduleId, { moduleId: sync.moduleId, revision: sync.revision, presentation: sync.presentation,
        assetUrls: urls, resources: load.resources, bytes });
      this.#publish(); this.#report(envelope, { type: "ok" });
    } catch (error) {
      if (load.cancelled || this.#disposed || this.#moduleLoads.get(sync.moduleId) !== load) return;
      if (this.#moduleLoads.get(sync.moduleId) === load) this.#moduleLoads.delete(sync.moduleId);
      this.#releaseModuleLoad(load);
      this.#report(envelope, null, failure("Desktop timer icons could not be prepared.", error));
    }
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
      if (record.view.preparing === true && record.pendingReady.size > 0) {
        record.state = "decoding"; this.#publish();
      } else this.#prepared(record);
    }
    catch (error) {
      this.#finish(record, "error", {
        referenceId: `err_${crypto.randomUUID()}`,
        stage: "source-load",
        message: "Desktop overlay media could not be prepared.",
        exception: serializeException(error)
      });
    }
    finally {
      record.loading = false;
      if (record.state === "cancelled") this.#release(record);
    }
  }

  #prepared(record: Occurrence): void {
    clearTimeout(record.prepareTimer); record.prepareTimer = undefined;
    record.state = "ready";
    if (record.view.preparing === true) record.prepareTimer = setTimeout(() => this.#finish(record, "error"), 15000);
    const preparing = record.prepare; record.prepare = null;
    if (preparing !== null) this.#report(preparing, { type: "ready", key: record.view.key });
  }

  #start(envelope: Envelope, key: VisualRecipientKey, timing?: PlaybackTiming): void {
    const record = this.#records.get(identity(key));
    if (record === undefined || record.state !== "ready" || this.#now() >= record.view.timing.endsAtEpochMs) {
      this.#report(envelope, { type: "error", key }); return;
    }
    record.start = envelope; record.requestIds.add(envelope.requestId);
    if (record.view.preparing === true) {
      if (timing === undefined || timing.endsAtEpochMs - timing.startsAtEpochMs !== record.view.timing.endsAtEpochMs - record.view.timing.startsAtEpochMs) {
        this.#finish(record, "error"); return;
      }
      clearTimeout(record.prepareTimer); record.prepareTimer = undefined;
      record.view = { ...record.view, timing, preparing: false };
      record.state = "active";
      // Media owns its full interval from actual onset; this is only a stall watchdog.
      record.endTimer = setTimeout(() => this.#finish(record, "error"), Math.max(0, timing.endsAtEpochMs + 5000 - this.#now()));
      this.#publish(); return;
    }
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

  #finish(record: Occurrence, result: "complete" | "error", failure?: OverlayPlaybackFailure): void {
    if (record.state === "cancelled") return;
    const wasActive = record.state === "active" || record.view.preparing === true;
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
    if (preparing !== null) this.#report(preparing, { type: "error", key: record.view.key }, failure);
    if (started !== null) this.#report(started, result === "complete" ? { type: result, key: record.view.key, ...(record.diagnostics === undefined ? {} : { diagnostics: record.diagnostics }) } : { type: result, key: record.view.key }, failure);
  }
  #release(record: Occurrence): void {
    const id = identity(record.view.key);
    if (this.#records.get(id) !== record) return;
    this.#records.delete(id); this.#bytes -= record.bytes;
  }
  #clear(): void {
    for (const record of this.#records.values()) this.#finish(record, "error");
    for (const [moduleId, load] of this.#moduleLoads) this.#cancelModuleLoad(moduleId, load);
    for (const moduleId of this.#modules.keys()) this.#removeModule(moduleId);
    this.#moduleRevisions.clear();
    this.#publish();
  }
  #cancelModuleLoad(moduleId: string, load: ModuleLoad): void {
    if (this.#moduleLoads.get(moduleId) === load) this.#moduleLoads.delete(moduleId);
    load.cancelled = true; this.#releaseModuleLoad(load);
    this.#report(load.envelope, { type: "ok" });
  }
  #releaseModuleLoad(load: ModuleLoad): void {
    for (const resource of load.resources) releaseResource(resource);
    load.resources.length = 0;
    if (load.bytes > 0) { this.#bytes -= load.bytes; load.bytes = 0; }
  }
  #removeModule(moduleId: string): void {
    const record = this.#modules.get(moduleId); if (record === undefined) return;
    this.#modules.delete(moduleId);
    for (const resource of record.resources) releaseResource(resource);
    this.#bytes -= record.bytes;
  }
  #publish(config = this.#snapshot.config): void {
    this.#snapshot = { config, occurrences: [...this.#records.values()].filter(record => record.state === "active" || (record.view.preparing === true && ["decoding", "ready", "scheduled"].includes(record.state))).map(record => record.view),
      modules: [...this.#modules.values()].map(record => ({ moduleId: record.moduleId, revision: record.revision,
        presentation: record.presentation, assetUrls: record.assetUrls })) };
    this.dependencies.changed();
  }
  #report(envelope: Envelope, result: DesktopVisualRendererReply["result"], failure?: OverlayPlaybackFailure): void {
    this.dependencies.report({ ...envelope, result, ...(failure === undefined ? {} : { failure }) });
  }
}
function mergeDiagnostics(previous: TimingDiagnostics | undefined, next: TimingDiagnostics): TimingDiagnostics {
  if (previous === undefined) return next;
  const maximum = (a: number | undefined, b: number | undefined) => a === undefined ? b : b === undefined ? a : Math.max(a, b);
  const preparationDurationMs = maximum(previous.preparationDurationMs, next.preparationDurationMs);
  const actualStartEpochMs = maximum(previous.actualStartEpochMs, next.actualStartEpochMs);
  return { ...next,
    ...(preparationDurationMs === undefined ? {} : { preparationDurationMs }),
    ...(actualStartEpochMs === undefined ? {} : { actualStartEpochMs }),
    completionReason: previous.completionReason === "natural-end" && next.completionReason === "natural-end" ? "natural-end" : "configured-duration"
  };
}
function identity(key: VisualRecipientKey): string { return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation]); }
function releaseResource(resource: PreparedAsset): void { try { resource.dispose(); }
// error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
catch { /* Continue releasing other media after an isolated cleanup failure. */ } }
function failure(message: string, error?: unknown): OverlayPlaybackFailure {
  return { referenceId: `err_${crypto.randomUUID()}`, stage: "source-load", message,
    exception: serializeException(error ?? new Error(message)) };
}
