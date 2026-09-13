import { desktopVisualBatchSchema, desktopVisualInstructionSchema, overlayInstructionSchema, VisualRecipientLedger, type DesktopOverlayTransport, type DesktopVisualBatch, type OverlayInstruction, type SurfaceRepository, type VisualRecipientKey } from "@stream-jams/core";
import type { DesktopVisualAssetResolver } from "./desktop-visual-asset-resolver.js";
export interface DesktopVisualSinkDependencies {
  transport: DesktopOverlayTransport;
  surfaces: Pick<SurfaceRepository, "list">;
  assets: Pick<DesktopVisualAssetResolver, "resolve">;
  now?: () => number;
}
type Group = { key: VisualRecipientKey; input: Omit<DesktopVisualBatch, "assets"> | null; endsAt: number; timer: ReturnType<typeof setTimeout> | undefined };
type Playback = { id: string; groups: Group[]; finished: boolean; running: boolean; starts: number; stopsSettled: boolean; resolve(): void; reject(error: Error): void; stopping: Promise<void> | null };

export class DesktopVisualSink {
  readonly #now: () => number;
  readonly #ledger = new VisualRecipientLedger();
  readonly #current = new Map<string, Playback>();
  readonly #admitted = new Set<Playback>();
  readonly #queue: Playback[] = [];
  #generation = 0;
  #pumping = false;
  #closed = false;
  #closing: Promise<void> | null = null;
  #configuring = false;
  #displayId: string | null = null;

  constructor(private readonly dependencies: DesktopVisualSinkDependencies) { this.#now = dependencies.now ?? Date.now; }

  async configure(config: Parameters<DesktopOverlayTransport["configure"]>[0]): Promise<void> {
    if (this.#closed || this.#configuring) throw unavailable();
    this.#configuring = true;
    try {
      if (!config.enabled || config.displayId !== this.#displayId) {
        await Promise.all([...this.#current.values()].map(record => this.#cancel(record)));
      }
      this.#displayId = config.displayId;
      await this.dependencies.transport.configure(config);
    } finally { this.#configuring = false; }
  }

  async play(occurrenceId: string, instructions: readonly OverlayInstruction[], startsAtEpochMs: number): Promise<void> {
    if (this.#closed || this.#configuring || this.#current.has(occurrenceId)) throw unavailable();
    const grouped = new Map<number, DesktopVisualBatch["instructions"]>();
    for (const instruction of instructions) {
      if (instruction.moduleId !== "alerts" || instruction.targetProfileId !== "landscape" || (instruction.visual == null && instruction.text == null && instruction.shape == null)) continue;
      const timing = desktopVisualBatchSchema.shape.timing.parse({ startsAtEpochMs, endsAtEpochMs: startsAtEpochMs + instruction.durationMs });
      const visual = desktopVisualInstructionSchema.parse({ ...overlayInstructionSchema.parse(instruction), timing, audio: null, tts: null });
      const group = grouped.get(visual.durationMs) ?? [];
      group.push(visual); grouped.set(visual.durationMs, group);
    }
    if (grouped.size === 0) return;
    const admitted = [...this.#admitted].reduce((count, record) => count + record.groups.length, 0);
    if (admitted + grouped.size > 64 || this.#generation + grouped.size > Number.MAX_SAFE_INTEGER) throw unavailable();
    const groups: Group[] = [];
    for (const [duration, original] of grouped) {
      const key = desktopVisualBatchSchema.shape.key.parse({ surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId, generation: ++this.#generation });
      const duplicates = new Set(original.map(instruction => instruction.id)).size !== original.length;
      const normalized = duplicates ? original.map((instruction, index) => ({ ...instruction, id: `${index}:${instruction.id}` })) : original;
      const endsAt = startsAtEpochMs + duration;
      groups.push({ key, endsAt, input: { key, timing: { startsAtEpochMs, endsAtEpochMs: endsAt }, instructions: normalized }, timer: undefined });
    }
    return new Promise<void>((resolve, reject) => {
      const record: Playback = { id: occurrenceId, groups, finished: false, running: false, starts: 0, stopsSettled: true, resolve, reject, stopping: null };
      this.#current.set(occurrenceId, record); this.#admitted.add(record);
      // Establish every obligation before any synchronous ready/complete reply.
      for (const group of groups) {
        this.#ledger.add(group.key);
        group.timer = setTimeout(() => { void this.#cancel(record); }, Math.max(0, Math.min(5000, group.endsAt - this.#now())));
      }
      this.#queue.push(record);
      if (!this.#pumping) { this.#pumping = true; void this.#drain(); }
    });
  }

  stop(occurrenceId: string): Promise<void> {
    const record = this.#current.get(occurrenceId);
    return record === undefined ? Promise.resolve() : this.#cancel(record);
  }
  close(): Promise<void> {
    if (this.#closing !== null) return this.#closing;
    this.#closed = true;
    const stopped = [...this.#current.values()].map(record => this.#cancel(record));
    this.#queue.length = 0;
    this.#closing = (async () => { await Promise.all(stopped); await this.dependencies.transport.close(); })();
    return this.#closing;
  }

  async #drain(): Promise<void> {
    try {
      while (this.#queue.length > 0 && !this.#closed) {
        const record = this.#queue.shift()!;
        if (record.finished) { this.#retire(record); continue; }
        record.running = true;
        try { await this.#dispatch(record); }
        catch { void this.#cancel(record); }
        finally { record.running = false; this.#retire(record); }
      }
    } finally { this.#pumping = false; }
  }

  async #dispatch(record: Playback): Promise<void> {
    const configs = await this.dependencies.surfaces.list();
    if (record.finished || this.#closed) return;
    const config = configs.find(surface => surface.kind === "desktop");
    if (config === undefined || config.kind !== "desktop") { this.#complete(record); return; }
    if (!config.enabled || config.displayId === null || !config.layers.some(layer => layer.moduleId === "alerts" && layer.visible)) { this.#complete(record); return; }
    for (const group of record.groups) {
      if (record.finished || this.#closed || group.input === null) return;
      if (this.#now() >= group.endsAt) { void this.#cancel(record); return; }
      const input = group.input;
      group.input = null;
      const ready = await this.dependencies.assets.resolve(input).then(async batch => {
        if (record.finished || this.#closed || this.#now() >= group.endsAt) return "unavailable" as const;
        // Only startup/Settings own host configuration. A slow asset read must
        // neither restore an old binding nor migrate interrupted work to a new one.
        const latest = (await this.dependencies.surfaces.list()).find(surface => surface.kind === "desktop");
        if (record.finished || this.#closed || latest?.kind !== "desktop" || !latest.enabled || latest.displayId !== config.displayId) return "unavailable" as const;
        return this.dependencies.transport.prepare(batch);
      });
      if (record.finished || this.#closed) return;
      if (ready !== "ready" || this.#now() >= group.endsAt) { void this.#cancel(record); return; }
      clearTimeout(group.timer);
      group.timer = setTimeout(() => { void this.#cancel(record); }, Math.max(0, group.endsAt + 5000 - this.#now()));
      record.starts++;
      let completed: Promise<void>;
      try { completed = this.dependencies.transport.start(group.key); }
      catch (error) { record.starts--; throw error; }
      // Start each ready group immediately; its completion never blocks preparing
      // the next duration group on the one serialized resolver path.
      void completed.then(() => {
        if (!record.finished && this.#ledger.settle(group.key)) {
          clearTimeout(group.timer); group.timer = undefined;
          if (this.#ledger.pending(record.id) === 0) this.#complete(record);
        }
      }, () => { void this.#cancel(record); }).finally(() => { record.starts--; this.#retire(record); });
    }
  }

  #complete(record: Playback): void {
    if (record.finished) return;
    this.#finish(record); record.resolve();
  }
  #cancel(record: Playback): Promise<void> {
    if (record.stopping !== null) return record.stopping;
    if (record.finished) return Promise.resolve();
    record.stopsSettled = false;
    this.#finish(record);
    const stops = record.groups.map(group => {
      try { return this.dependencies.transport.stop(group.key).catch(() => {}); }
      catch { return Promise.resolve(); }
    });
    record.stopping = Promise.all(stops).then(() => {
      record.stopsSettled = true;
      if (this.#current.get(record.id) === record) this.#current.delete(record.id);
      // The caller may advance its queue only after native stop obligations settle.
      record.reject(unavailable()); this.#retire(record);
    });
    return record.stopping;
  }
  #finish(record: Playback): void {
    record.finished = true;
    if (record.stopsSettled && this.#current.get(record.id) === record) this.#current.delete(record.id);
    for (const group of record.groups) { clearTimeout(group.timer); group.timer = undefined; group.input = null; this.#ledger.settle(group.key); }
    this.#retire(record);
  }
  #retire(record: Playback): void {
    // Canceled uncancellable lookups/prepares retain capacity until they settle.
    if (record.finished && record.stopsSettled && !record.running && record.starts === 0) {
      this.#admitted.delete(record);
      const queued = this.#queue.indexOf(record);
      if (queued >= 0) this.#queue.splice(queued, 1);
    }
  }
}
function unavailable(): Error { return new Error("Desktop visual playback is unavailable or was interrupted"); }
