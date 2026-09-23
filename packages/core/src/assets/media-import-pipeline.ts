import type { AssetRepository } from "./repository.js";
import type { AssetMediaType, AssetRecord } from "./types.js";
import type { AssetValidator } from "./asset-validator.js";

export interface MediaImportInput {
  readonly assetId?: string;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface MediaMetadataProbeInput {
  readonly mediaType: AssetMediaType;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly bytes: Uint8Array;
}

export interface MediaMetadataProbe {
  inspect(input: MediaMetadataProbeInput): Promise<{ readonly durationMs: number | null }>;
}

export interface AssetStorageWrite {
  readonly assetId: string;
  readonly originalFileName: string;
  readonly mediaType: AssetMediaType;
  readonly normalizedExtension: string;
  readonly storageVersion?: string | undefined;
  readonly bytes: Uint8Array;
}

export interface MediaAssetStore {
  write(input: AssetStorageWrite): Promise<{ readonly storagePath: string }>;
}

export interface MediaImportPipeline {
  importMedia(input: MediaImportInput): Promise<AssetRecord>;
}

export interface DefaultMediaImportPipelineOptions {
  readonly validator: AssetValidator;
  readonly repository: AssetRepository;
  readonly store: MediaAssetStore;
  readonly probe: MediaMetadataProbe;
  readonly generateId: () => string;
  readonly calculateChecksum: (bytes: Uint8Array) => string;
}

export class InvalidMediaImportError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "InvalidMediaImportError";
    this.reason = reason;
  }
}

export class DefaultMediaImportPipeline implements MediaImportPipeline {
  readonly #validator: AssetValidator;
  readonly #repository: AssetRepository;
  readonly #store: MediaAssetStore;
  readonly #probe: MediaMetadataProbe;
  readonly #generateId: () => string;
  readonly #calculateChecksum: (bytes: Uint8Array) => string;

  constructor(options: DefaultMediaImportPipelineOptions) {
    this.#validator = options.validator;
    this.#repository = options.repository;
    this.#store = options.store;
    this.#probe = options.probe;
    this.#generateId = options.generateId;
    this.#calculateChecksum = options.calculateChecksum;
  }

  async importMedia(input: MediaImportInput): Promise<AssetRecord> {
    const validation = this.#validator.validate({
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      bytes: input.bytes
    });
    if (!validation.accepted || validation.mediaType === null || validation.normalizedExtension === null) {
      throw new InvalidMediaImportError(validation.reason ?? "Invalid media import");
    }

    const accepted = {
      ...input,
      mediaType: validation.mediaType,
      normalizedExtension: validation.normalizedExtension
    };
    const assetId = input.assetId ?? this.#generateId();
    const checksum = this.#calculateChecksum(accepted.bytes);
    let durationMs: number | null = null;
    if (accepted.mediaType === "audio" || accepted.mediaType === "video") {
      try {
        durationMs = (await this.#probe.inspect({
          mediaType: accepted.mediaType,
          mimeType: accepted.mimeType,
          sizeBytes: accepted.bytes.byteLength,
          bytes: accepted.bytes
        })).durationMs;
      } catch {
        durationMs = null;
      }
    }
    const { storagePath } = await this.#store.write({
      assetId,
      originalFileName: accepted.originalFileName,
      mediaType: accepted.mediaType,
      normalizedExtension: accepted.normalizedExtension,
      ...(input.assetId === undefined ? {} : { storageVersion: checksum }),
      bytes: accepted.bytes
    });

    return this.#repository.save({
      id: assetId,
      originalFileName: accepted.originalFileName,
      mediaType: accepted.mediaType,
      mimeType: accepted.mimeType,
      sizeBytes: accepted.bytes.byteLength,
      checksum,
      storagePath,
      durationMs
    });
  }
}
