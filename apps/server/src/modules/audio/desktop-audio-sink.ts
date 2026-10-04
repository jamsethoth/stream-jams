import {
  audioPlaybackPayloadSchema,
  type AudioPlaybackSink,
  type AudioPlaybackPayload,
  type DesktopAudioTransport,
  type DeviceAudioBatch,
  type DeviceAudioResult,
  type Logger
} from "@stream-jams/core";

import type { LocalMediaService } from "../assets/local-media-service.js";

export interface DesktopAudioSinkDependencies {
  readonly transport: DesktopAudioTransport;
  readonly media: Pick<LocalMediaService, "records" | "verifyGroup" | "issueTrustedGrant">;
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly generateReferenceId?: () => string;
}

const supportedMimeTypes = new Set<string>([
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "video/webm",
  "video/mp4"
]);
const maxPreparationDurationMs = 5_000;

export class DesktopAudioSink implements AudioPlaybackSink {
  readonly #transport: DesktopAudioTransport;
  readonly #media: DesktopAudioSinkDependencies["media"];
  readonly #now: () => number;
  readonly #logger: Logger | undefined;
  readonly #generateReferenceId: (() => string) | undefined;
  readonly #verification = new Map<string, Set<AbortController>>();
  readonly #cancelled = new Set<string>();
  readonly #pendingByPlaybackId = new Map<string, number>();
  readonly #waitingStarts = new Map<string, Set<() => void>>();
  #closed = false;

  constructor(dependencies: DesktopAudioSinkDependencies) {
    this.#transport = dependencies.transport;
    this.#media = dependencies.media;
    this.#now = dependencies.now ?? Date.now;
    this.#logger = dependencies.logger;
    this.#generateReferenceId = dependencies.generateReferenceId;
  }

  async prepare(batch: DeviceAudioBatch): Promise<{ start(startsAtEpochMs: number): Promise<DeviceAudioResult> }> {
    let ready!: (handle: { start(startsAtEpochMs: number): Promise<DeviceAudioResult> }) => void;
    let begin!: (startsAtEpochMs: number) => void;
    const starts = new Promise<number>(resolve => { begin = resolve; });
    const prepared = new Promise<{ start(startsAtEpochMs: number): Promise<DeviceAudioResult> }>(resolve => { ready = resolve; });
    const result = this.#play({ ...batch, timing: undefined }, async payload => {
      if (this.#transport.prepare === undefined) throw new Error("Desktop audio preparation is unavailable.");
      const handle = await this.#transport.prepare(payload);
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      ready({ start: startsAtEpochMs => { begin(startsAtEpochMs); return result; } });
      const cancel = () => begin(this.#now());
      const waiting = this.#waitingStarts.get(batch.playbackId) ?? new Set<() => void>();
      waiting.add(cancel);
      this.#waitingStarts.set(batch.playbackId, waiting);
      let expired = false;
      const timeout = setTimeout(() => { expired = true; cancel(); }, 15000);
      const startsAtEpochMs = await starts;
      clearTimeout(timeout);
      waiting.delete(cancel);
      if (waiting.size === 0) this.#waitingStarts.delete(batch.playbackId);
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      if (expired) { await this.#transport.stop(batch.playbackId); return failedDestinations(batch); }
      return handle.start(startsAtEpochMs);
    });
    void result.then(value => ready({ start: async () => value }), (error: unknown) => ready({ start: async () => { throw error; } }));
    return prepared;
  }

  play(batch: DeviceAudioBatch): Promise<DeviceAudioResult> { return this.#play(batch); }

  async #play(batch: DeviceAudioBatch, prepare?: (payload: import("@stream-jams/core").AudioPlaybackPayload) => Promise<DeviceAudioResult>): Promise<DeviceAudioResult> {
    const startedAtMs = this.#now();
    const deadlineMs = prepare === undefined ? batch.timing?.endsAtEpochMs ?? startedAtMs + batch.durationMs : startedAtMs + 15000;
    const startDeadlineMs = Math.min(deadlineMs, (batch.timing?.startsAtEpochMs ?? startedAtMs) + maxPreparationDurationMs);
    this.#pendingByPlaybackId.set(batch.playbackId, (this.#pendingByPlaybackId.get(batch.playbackId) ?? 0) + 1);
    const controller = new AbortController();
    const verifying = this.#verification.get(batch.playbackId) ?? new Set<AbortController>();
    verifying.add(controller); this.#verification.set(batch.playbackId, verifying);
    try {
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      const assetIds = [...new Set(batch.layers.map(layer => layer.assetId))];
      const records = this.#media.records(batch.playbackId, assetIds);
      const assets: AudioPlaybackPayload["assets"] = [];
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, startDeadlineMs - this.#now()))]);
      for (const assetId of assetIds) {
        if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
        if (this.#now() >= startDeadlineMs) return failedDestinations(batch);
        const record = records.get(assetId);
        if (record === undefined || !supportedMimeTypes.has(record.mimeType) ||
            !batch.layers.filter(layer => layer.assetId === assetId).every(layer =>
              layer.sourceKind === "audio"
                ? record.mediaType === "audio" && record.mimeType.startsWith("audio/")
                : layer.sourceKind === "video-soundtrack" && record.mediaType === "video" && record.mimeType.startsWith("video/"))) continue;
        try {
          await this.#media.verifyGroup(batch.playbackId, [assetId], signal);
          if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
          signal.throwIfAborted();
          assets.push({ assetId, grant: this.#media.issueTrustedGrant(batch.playbackId, assetId,
            `desktop-audio:${JSON.stringify([batch.playbackId, batch.documentId])}`, Math.min(this.#now() + 3600000, Math.max(deadlineMs + 5000, this.#now() + batch.durationMs + 20000))) });
        } catch (error) {
          await this.#recordFailure("Desktop audio asset could not be prepared.", "desktop-audio.asset-read-failed", batch.playbackId, error, assetId);
        }
      }
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      if (this.#now() >= startDeadlineMs) return failedDestinations(batch);
      const result = await (prepare ?? (payload => this.#transport.play(payload)))(audioPlaybackPayloadSchema.parse({ batch, assets, deadlineMs, startDeadlineMs }));
      for (const output of result.outputDiagnostics ?? []) await this.#logger?.info("Selected device audio playback timing.", {
        module: "audio-output", source: "desktop-audio.playback-timing",
        correlationId: batch.playbackId, processingId: null,
        metadata: { playbackId: batch.playbackId, documentId: batch.documentId,
          routeIds: JSON.stringify(output.routeIds), layerId: output.layerId, assetId: output.assetId, ...output.diagnostics }
      });
      if (result.outputDiagnostics === undefined && result.diagnostics !== undefined) await this.#logger?.info("Selected device audio playback timing.", {
        module: "audio-output", source: "desktop-audio.playback-timing",
        correlationId: batch.playbackId, processingId: null,
        metadata: { playbackId: batch.playbackId, documentId: batch.documentId,
          routeCount: batch.destinations.reduce((sum, destination) => sum + destination.routeIds.length, 0),
          ...result.diagnostics }
      });
      for (const failure of result.failures ?? []) {
        await this.#logger?.error("Selected device audio playback failed.", {
          module: "audio-output",
          source: "desktop-audio.playback-failed",
          correlationId: this.#generateReferenceId?.() ?? batch.playbackId,
          processingId: null,
          metadata: { playbackId: batch.playbackId, documentId: batch.documentId, layerId: failure.layerId, assetId: failure.assetId, routeIds: [...failure.routeIds], stage: failure.stage }
        }, failure.exception);
      }
      return result;
    } finally {
      verifying.delete(controller);
      if (verifying.size === 0) this.#verification.delete(batch.playbackId);
      const remaining = (this.#pendingByPlaybackId.get(batch.playbackId) ?? 1) - 1;
      if (remaining === 0) {
        this.#pendingByPlaybackId.delete(batch.playbackId);
        this.#cancelled.delete(batch.playbackId);
      } else {
        this.#pendingByPlaybackId.set(batch.playbackId, remaining);
      }
    }
  }

  async stop(playbackId: string): Promise<void> {
    this.#cancelled.add(playbackId);
    for (const controller of this.#verification.get(playbackId) ?? []) controller.abort();
    for (const cancel of this.#waitingStarts.get(playbackId) ?? []) cancel();
    try {
      await this.#transport.stop(playbackId);
    } finally {
      if (!this.#pendingByPlaybackId.has(playbackId)) this.#cancelled.delete(playbackId);
    }
  }

  async setModuleMutes(state: import("@stream-jams/core").ModuleMuteState): Promise<void> {
    if (this.#transport.setModuleMutes === undefined) throw new Error("Desktop audio module mute is unavailable.");
    await this.#transport.setModuleMutes(state);
  }

  setMuted(muted: boolean): Promise<void> {
    return this.#transport.setMuted(muted);
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const controllers of this.#verification.values()) for (const controller of controllers) controller.abort();
    for (const waiting of this.#waitingStarts.values()) for (const cancel of waiting) cancel();
    await this.#transport.close();
  }

  #isCurrent(playbackId: string): boolean {
    return !this.#closed && !this.#cancelled.has(playbackId);
  }

  async #recordFailure(message: string, source: string, playbackId: string, error: unknown, assetId?: string): Promise<void> {
    const logger = this.#logger;
    if (logger === undefined) return;
    await logger.error(message, {
      module: "audio-output",
      source,
      correlationId: this.#generateReferenceId?.() ?? playbackId,
      processingId: null,
      metadata: { playbackId, ...(assetId === undefined ? {} : { assetId }) }
    }, error);
  }
}

function failedDestinations(batch: DeviceAudioBatch): DeviceAudioResult {
  return { failedRouteIds: [...new Set(batch.destinations.flatMap(destination => destination.routeIds))] };
}
