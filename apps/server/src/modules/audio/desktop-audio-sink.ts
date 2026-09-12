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
  type DeviceAudioResult
} from "@stream-jams/core";

export interface DesktopAudioSinkDependencies {
  readonly transport: DesktopAudioTransport;
  readonly assetRepository: Pick<AssetRepository, "findManyByIds">;
  readonly assetStore: {
    readBounded(storagePath: string, maxBytes: number): Promise<Uint8Array>;
  };
  readonly now?: () => number;
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
  readonly #cancelled = new Set<string>();
  readonly #pendingByPlaybackId = new Map<string, number>();
  #closed = false;

  constructor(dependencies: DesktopAudioSinkDependencies) {
    this.#transport = dependencies.transport;
    this.#assetRepository = dependencies.assetRepository;
    this.#assetStore = dependencies.assetStore;
    this.#now = dependencies.now ?? Date.now;
  }

  async play(batch: DeviceAudioBatch): Promise<DeviceAudioResult> {
    const startedAtMs = this.#now();
    const deadlineMs = batch.timing?.endsAtEpochMs ?? startedAtMs + batch.durationMs;
    const startDeadlineMs = Math.min(deadlineMs, (batch.timing?.startsAtEpochMs ?? startedAtMs) + maxPreparationDurationMs);
    this.#pendingByPlaybackId.set(batch.playbackId, (this.#pendingByPlaybackId.get(batch.playbackId) ?? 0) + 1);
    try {
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      const assetIds = [...new Set(batch.layers.map(layer => layer.assetId))];
      const records = await this.#beforeStartDeadline(this.#findAssets(assetIds), startDeadlineMs);
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
            startDeadlineMs
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
        } catch {
          // Missing, changed or unreadable assets are omitted. The player maps
          // the still-present batch layers to affected route failures.
        }
      }
      if (!this.#isCurrent(batch.playbackId)) return { failedRouteIds: [] };
      if (this.#now() >= startDeadlineMs) return failedDestinations(batch);
      return this.#transport.play(audioPlaybackPayloadSchema.parse({ batch, assets, deadlineMs, startDeadlineMs }));
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
    await this.#transport.close();
  }

  #isCurrent(playbackId: string): boolean {
    return !this.#closed && !this.#cancelled.has(playbackId);
  }

  async #findAssets(assetIds: readonly string[]) {
    try {
      return await this.#assetRepository.findManyByIds(assetIds);
    } catch {
      return new Map();
    }
  }

  async #beforeStartDeadline<T>(work: Promise<T>, startDeadlineMs: number): Promise<T | typeof preparationTimedOut> {
    const remainingMs = startDeadlineMs - this.#now();
    if (remainingMs <= 0) {
      void work.catch(() => {});
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
}

function isSupportedMimeType(mimeType: string): mimeType is AudioPlayerAsset["mimeType"] {
  return supportedMimeTypes.has(mimeType as AudioPlayerAsset["mimeType"]);
}

function failedDestinations(batch: DeviceAudioBatch): DeviceAudioResult {
  return { failedRouteIds: [...new Set(batch.destinations.flatMap(destination => destination.routeIds))] };
}
