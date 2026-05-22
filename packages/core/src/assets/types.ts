export type AssetMediaType = "image" | "gif" | "video" | "audio";

export interface AssetRecord {
  readonly id: string;
  readonly originalFileName: string;
  readonly mediaType: AssetMediaType;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly storagePath: string;
}

export interface AssetValidationResult {
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly mediaType: AssetMediaType | null;
}
