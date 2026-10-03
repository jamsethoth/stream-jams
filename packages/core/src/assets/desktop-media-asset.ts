import { z } from "zod";
import { defaultAssetValidationPolicy } from "./asset-validator.js";
import { privateMediaReferenceSchema, trustedMediaGrantSchema, type MediaVersionSnapshot, type PrivateMediaReference } from "./media-reference.js";

function validAssetSnapshot(assetId: string, snapshot: MediaVersionSnapshot): boolean {
  const kind = snapshot.mimeType === "image/gif" ? "gif" : snapshot.mimeType.startsWith("image/") ? "image" :
    snapshot.mimeType.startsWith("video/") ? "video" : snapshot.mimeType.startsWith("font/") ? "font" : "audio";
  return assetId === snapshot.assetId && snapshot.sizeBytes <= defaultAssetValidationPolicy[kind].maxSizeBytes;
}

/** Worker/main only: translate to a private renderer reference before IPC. */
export const trustedDesktopMediaAssetSchema = z.object({
  assetId: z.string().min(1).max(256), grant: trustedMediaGrantSchema
}).strict().refine(asset => validAssetSnapshot(asset.assetId, asset.grant.snapshot), "Asset identity and import limits must match its pinned snapshot");
/** Renderer only: rejects server grants, whole media bodies and caller-selected URLs. */
export const privateDesktopMediaAssetSchema = z.object({
  assetId: z.string().min(1).max(256), reference: privateMediaReferenceSchema
}).strict().refine(asset => validAssetSnapshot(asset.assetId, asset.reference.snapshot), "Asset identity and import limits must match its pinned snapshot");

export const trustedAudioMediaAssetSchema = trustedDesktopMediaAssetSchema.refine(asset =>
  /^(audio|video)\//.test(asset.grant.snapshot.mimeType), "Audio requires an audio asset or video soundtrack");
export const privateAudioMediaAssetSchema = privateDesktopMediaAssetSchema.refine(asset =>
  /^(audio|video)\//.test(asset.reference.snapshot.mimeType), "Audio requires an audio asset or video soundtrack");
export const trustedVisualMediaAssetSchema = trustedDesktopMediaAssetSchema.refine(asset =>
  /^(image|video|font)\//.test(asset.grant.snapshot.mimeType), "Visuals require an image or video asset");
export const privateVisualMediaAssetSchema = privateDesktopMediaAssetSchema.refine(asset =>
  /^(image|video|font)\//.test(asset.reference.snapshot.mimeType), "Visuals require an image or video asset");

export type TrustedDesktopMediaAsset = z.infer<typeof trustedDesktopMediaAssetSchema>;
export type PrivateDesktopMediaAsset = z.infer<typeof privateDesktopMediaAssetSchema>;

/** Fixed renderer origins only. The caller cannot supply an HTTP origin or path. */
export function privateAudioMediaUrl(reference: PrivateMediaReference): string {
  return `stream-jams-audio://player/media/${privateMediaReferenceSchema.parse(reference).handle}`;
}
export function privateVisualMediaUrl(reference: PrivateMediaReference): string {
  return `stream-jams-overlay://surface/media/${privateMediaReferenceSchema.parse(reference).handle}`;
}
