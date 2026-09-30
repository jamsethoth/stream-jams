import { createHash } from "node:crypto";
import {
  audioPlaybackPayloadSchema,
  maxAudioTransportAssetBytes,
  maxAudioTransportBatchBytes,
  type AssetRepository,
  type AudioPlaybackSink,
  type AudioPlayerAsset,
  type DesktopAudioTransport,
  type DeviceAudioBatch,
  type DeviceAudioResult,
  type Logger
} from "@stream-jams/core";

export interface DesktopAudioSinkDependencies {
  readonly transport: DesktopAudioTransport;
  readonly assetRepository: Pick<AssetRepository, "findManyByIds">;
  readonly assetStore: {
    readBounded(storagePath: string, maxBytes: number): Promise<Uint8Array>;
  };
  readonly now?: () => number;
  readonly logger?: Logger;
  readonly generateReferenceId?: () => string;
}

const supportedMimeTypes = new Set<AudioPlayerAsset["mimeType"]>([
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "video/webm",
  "video/mp4"
]);
const maxPreparationDurationMs = 5_000;
const preparationTimedOut = Symbol("preparationTimedOut");

export class DesktopAudioSink implements AudioPlaybackSink {
  readonly #transport: DesktopAudioTransport;
  readonly #assetRepository: Pick<AssetRepository, "findManyByIds">;
  readonly #assetStore: DesktopAudioSinkDependencies["assetStore"];
  readonly #now: () => number;
  readonly #logger: Logger | undefined;
  readonly #generateReferenceId: (() => string) | undefined;
  readonly #cancelled = new Set<string>();
  readonly #pendingByPlaybackId = new Map<string, number>();
  readonly #waitingStarts = new Map<string, Set<() => void>>();
  #closed = false;

  constructor(dependencies: DesktopAudioSinkDependencies) {
    this.#transport = dependencies.transport;
    this.#assetRepository = dependencies.assetRepository;
    this.#assetStore = dependencies.assetStore;
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
    try {
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      const assetIds = [...new Set(batch.layers.map(layer => layer.assetId))];
      const records = await this.#beforeStartDeadline(
        this.#assetRepository.findManyByIds(assetIds),
        startDeadlineMs,
        (error) => this.#recordFailure("Desktop audio asset lookup failed after its preparation deadline.", "desktop-audio.asset-lookup-late-failed", batch.playbackId, error)
      );
      if (records === preparationTimedOut) return failedDestinations(batch);
      const assets: AudioPlayerAsset[] = [];
      let totalBytes = 0;
      for (const assetId of assetIds) {
        if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
        if (this.#now() >= startDeadlineMs) return failedDestinations(batch);
        const record = records.get(assetId);
        if (record === undefined || !isSupportedMimeType(record.mimeType) ||
            !batch.layers.filter(layer => layer.assetId === assetId).every(layer =>
              layer.sourceKind === "audio"
                ? record.mediaType === "audio" && record.mimeType.startsWith("audio/")
                : layer.sourceKind === "video-soundtrack" && record.mediaType === "video" && record.mimeType.startsWith("video/")) ||
            !Number.isSafeInteger(record.sizeBytes) ||
            record.sizeBytes <= 0 || record.sizeBytes > maxAudioTransportAssetBytes ||
            record.sizeBytes > maxAudioTransportBatchBytes - totalBytes) {
          continue;
        }
        try {
          const bytes = await this.#beforeStartDeadline(
            this.#assetStore.readBounded(
              record.storagePath,
              Math.min(maxAudioTransportAssetBytes, maxAudioTransportBatchBytes - totalBytes)
            ),
            startDeadlineMs,
            (error) => this.#recordFailure("Desktop audio asset read failed after its preparation deadline.", "desktop-audio.asset-read-late-failed", batch.playbackId, error, assetId)
          );
          if (bytes === preparationTimedOut) return failedDestinations(batch);
          if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
          if (this.#now() >= startDeadlineMs) return failedDestinations(batch);
          if (bytes.byteLength !== record.sizeBytes || bytes.byteLength === 0 ||
              bytes.byteLength > maxAudioTransportAssetBytes ||
              bytes.byteLength > maxAudioTransportBatchBytes - totalBytes ||
              `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== record.checksum) {
            continue;
          }
          assets.push({ assetId, mimeType: record.mimeType, bytes: new Uint8Array(bytes) });
          totalBytes += bytes.byteLength;
        } catch (error) {
          await this.#recordFailure("Desktop audio asset could not be prepared.", "desktop-audio.asset-read-failed", batch.playbackId, error, assetId);
          // Missing, changed or unreadable assets are omitted. The player maps
          // the still-present batch layers to affected route failures.
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
    for (const cancel of this.#waitingStarts.get(playbackId) ?? []) cancel();
    try {
      await this.#transport.stop(playbackId);
    } finally {
      if (!this.#pendingByPlaybackId.has(playbackId)) this.#cancelled.delete(playbackId);
    }
  }

  setMuted(muted: boolean): Promise<void> {
    return this.#transport.setMuted(muted);
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const waiting of this.#waitingStarts.values()) for (const cancel of waiting) cancel();
    await this.#transport.close();
  }

  #isCurrent(playbackId: string): boolean {
    return !this.#closed && !this.#cancelled.has(playbackId);
  }

  async #beforeStartDeadline<T>(
    work: Promise<T>,
    startDeadlineMs: number,
    onLateFailure: (error: unknown) => void | Promise<void>
  ): Promise<T | typeof preparationTimedOut> {
    const remainingMs = startDeadlineMs - this.#now();
    if (remainingMs <= 0) {
      void work.catch(onLateFailure);
      return preparationTimedOut;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof preparationTimedOut>((resolve) => {
      timer = setTimeout(() => { resolve(preparationTimedOut); }, remainingMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
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

function isSupportedMimeType(mimeType: string): mimeType is AudioPlayerAsset["mimeType"] {
  return supportedMimeTypes.has(mimeType as AudioPlayerAsset["mimeType"]);
}

function failedDestinations(batch: DeviceAudioBatch): DeviceAudioResult {
  return { failedRouteIds: [...new Set(batch.destinations.flatMap(destination => destination.routeIds))] };
}
