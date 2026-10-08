import {
  dataOverlayLimits, dataSourceStatusSchema, projectDataOverlays,
  type DataOverlayState, type DataSourceStatus, type OverlayModuleRuntime,
  type OverlayModuleSnapshot, type OverlayModuleSnapshotRequest
} from "@stream-jams/core";

/** Read-only projections of the committed catalog; refreshing never changes live values. */
export class DataOverlayOutputRuntime implements OverlayModuleRuntime {
  readonly #listeners = new Set<() => void>();
  readonly #statuses: Record<string, DataSourceStatus> = Object.create(null) as Record<string, DataSourceStatus>;
  #generation = 0;
  #expiry: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  constructor(private readonly dependencies: {
    readonly runtimeId: string;
    readonly getState: () => DataOverlayState;
    readonly getEnabled: () => Promise<boolean>;
    readonly outputPaused: () => boolean;
    readonly resolveImage: (assetId: string) => Promise<boolean>;
    readonly now?: () => number;
  }) {}

  get generation(): number { return this.#generation; }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  refresh(): void {
    if (this.#closed) return;
    ++this.#generation;
    for (const listener of this.#listeners) listener();
  }
  setSourceStatus(valueId: string, status: DataSourceStatus | null): void {
    if (status === null) delete this.#statuses[valueId];
    else this.#statuses[valueId] = dataSourceStatusSchema.parse(status);
    this.refresh();
    this.#scheduleExpiry();
  }
  #scheduleExpiry(): void {
    clearTimeout(this.#expiry);
    if (this.#closed) return;
    const now = (this.dependencies.now ?? Date.now)();
    const expiries = Object.values(this.#statuses).flatMap(status => status.state === "stale" && status.staleSinceEpochMs <= now
      ? [status.staleSinceEpochMs + dataOverlayLimits.staleGraceMs + 1] : []).filter(expiry => expiry > now);
    if (expiries.length === 0) return;
    this.#expiry = setTimeout(() => { this.refresh(); this.#scheduleExpiry(); }, Math.min(2_147_483_647, Math.min(...expiries) - now));
    this.#expiry.unref();
  }
  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const generation = this.#generation;
      const enabled = await this.dependencies.getEnabled();
      const state = this.dependencies.getState();
      const output = request.overlayId === "desktop:primary" ? "desktop" : "browser";
      const targetProfileId = request.targetProfileId ?? "landscape";
      const ids = enabled && !this.dependencies.outputPaused() ? [...new Set(state.canvases.filter(canvas => canvas.enabled && canvas.outputs[output] && canvas.targetProfileId === targetProfileId)
        .flatMap(canvas => canvas.elements.flatMap(element => element.visible && element.kind === "image" ? [element.assetId] : [])))] : [];
      const available = new Set((await Promise.all(ids.map(async id => await this.dependencies.resolveImage(id) ? id : null))).filter((id): id is string => id !== null));
      if (this.#closed || generation !== this.#generation || state.revision !== this.dependencies.getState().revision) continue;
      const projection = projectDataOverlays(state, {
        runtimeId: this.dependencies.runtimeId, output,
        targetProfileId, nowEpochMs: (this.dependencies.now ?? Date.now)(),
        moduleEnabled: enabled && !this.#closed, outputPaused: this.dependencies.outputPaused(),
        resolveAssetId: id => available.has(id), sourceStatuses: this.#statuses
      });
      return { moduleId: "data-overlays", enabled, instructions: [], presentation: { kind: "data-overlays", projection: { ...projection, revision: generation } } };
    }
    // Continuous mutation or shutdown fails transparent; its publication will refresh the output.
    return { moduleId: "data-overlays", enabled: false, instructions: [] };
  }
  close(): void { this.#closed = true; ++this.#generation; clearTimeout(this.#expiry); this.#listeners.clear(); }
}

/** One active refresh and one shared pending refresh, regardless of producer burst size. */
export function createDataOutputRefreshQueue(work: () => Promise<void>): { enqueue(): Promise<void>; drain(): Promise<void> } {
  let active: Promise<void> | null = null;
  let pending: { promise: Promise<void>; resolve(): void; reject(error: unknown): void } | null = null;
  const launch = (): Promise<void> => {
    const result = Promise.resolve().then(work);
    void result.catch(
      // error-provenance: allow expected -- work reports diagnostics; enqueue callers retain rejection when needed
      () => {});
    active = result;
    const finish = () => {
      active = null;
      const next = pending; pending = null;
      if (next !== null) void launch().then(next.resolve, next.reject);
    };
    void result.then(finish, finish);
    return result;
  };
  return {
    enqueue() {
      if (active === null) return launch();
      if (pending === null) {
        let resolve!: () => void; let reject!: (error: unknown) => void;
        const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
        void promise.catch(
          // error-provenance: allow expected -- callers retain the rejecting promise; prevent idle pending notification rejection
          () => {});
        pending = { promise, resolve, reject };
      }
      return pending.promise;
    },
    async drain() { while (active !== null || pending !== null) await Promise.allSettled([active, pending?.promise]); }
  };
}
