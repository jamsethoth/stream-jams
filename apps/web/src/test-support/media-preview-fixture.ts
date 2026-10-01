import type { MediaPreviewDescriptor } from "@stream-jams/core";
import type { MediaPreviewApi } from "../management/assets/media-preview-api.js";

export function previewDescriptor(assetId = "asset", overrides: Partial<MediaPreviewDescriptor> = {}): MediaPreviewDescriptor {
  const mimeType = /video|clip/.test(assetId) ? "video/mp4" : /audio|sound/.test(assetId) ? "audio/wav" : "image/png";
  return { id: `preview-${assetId}`, url: `/storybook-assets/${mimeType.startsWith("video") ? "tiny-video.mp4" : mimeType.startsWith("audio") ? "tiny-audio.wav" : "tiny-image.png"}`,
    snapshot: { assetId, version: "a".repeat(64), mimeType, sizeBytes: 100, durationMs: mimeType.startsWith("image") ? null : 1000 },
    expiresAt: Date.now() + 300000, ...overrides };
}
/** Typed fixture URLs are checked-in media, never capability credentials. */
export function createTestMediaPreviewApi(create: MediaPreviewApi["createPreview"] = async id => previewDescriptor(id)): MediaPreviewApi {
  const descriptors = new Map<string, MediaPreviewDescriptor>();
  return {
    async createPreview(id) { const value = await create(id); descriptors.set(value.id, value); return value; },
    async renewPreview(id) { const value = descriptors.get(id); if (value === undefined) throw new Error("Preview released"); return { ...value, expiresAt: Date.now() + 300000 }; },
    async releasePreview(id) { descriptors.delete(id); }
  };
}
