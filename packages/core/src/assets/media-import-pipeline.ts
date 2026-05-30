import type { AssetRepository } from "./repository.js";
import type { AssetMediaType, AssetRecord } from "./types.js";
import type { AssetValidator } from "./asset-validator.js";

export interface MediaImportInput {
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface MediaTranscodeInput extends MediaImportInput {
  readonly mediaType: AssetMediaType;
  readonly normalizedExtension: string;
}

export type MediaTranscodeOutput = MediaTranscodeInput;

export interface MediaTranscodingStage {
  transcode(input: MediaTranscodeInput): Promise<MediaTranscodeOutput>;
}

export interface AssetStorageWrite {
  readonly assetId: string;
  readonly originalFileName: string;
  readonly mediaType: AssetMediaType;
  readonly normalizedExtension: string;
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
  readonly transcoder: MediaTranscodingStage;
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

export class NoopMediaTranscodingStage implements MediaTranscodingStage {
  async transcode(input: MediaTranscodeInput): Promise<MediaTranscodeOutput> {
    return input;
  }
}

export class DefaultMediaImportPipeline implements MediaImportPipeline {
  readonly #validator: AssetValidator;
  readonly #repository: AssetRepository;
  readonly #store: MediaAssetStore;
  readonly #transcoder: MediaTranscodingStage;
  readonly #generateId: () => string;
  readonly #calculateChecksum: (bytes: Uint8Array) => string;

  constructor(options: DefaultMediaImportPipelineOptions) {
    this.#validator = options.validator;
    this.#repository = options.repository;
    this.#store = options.store;
    this.#transcoder = options.transcoder;
    this.#generateId = options.generateId;
    this.#calculateChecksum = options.calculateChecksum;
  }

  async importMedia(input: MediaImportInput): Promise<AssetRecord> {
    const validation = this.#validator.validate({
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength
    });
    if (!validation.accepted || validation.mediaType === null || validation.normalizedExtension === null) {
      throw new InvalidMediaImportError(validation.reason ?? "Invalid media import");
    }

    const transcoded = await this.#transcoder.transcode({
      ...input,
      mediaType: validation.mediaType,
      normalizedExtension: validation.normalizedExtension
    });
    const assetId = this.#generateId();
    const checksum = this.#calculateChecksum(transcoded.bytes);
    const { storagePath } = await this.#store.write({
      assetId,
      originalFileName: transcoded.originalFileName,
      mediaType: transcoded.mediaType,
      normalizedExtension: transcoded.normalizedExtension,
      bytes: transcoded.bytes
    });

    return this.#repository.save({
      id: assetId,
      originalFileName: transcoded.originalFileName,
      mediaType: transcoded.mediaType,
      mimeType: transcoded.mimeType,
      sizeBytes: transcoded.bytes.byteLength,
      checksum,
      storagePath
    });
  }
}
