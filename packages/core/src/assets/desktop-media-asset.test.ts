import { expect, it } from "vitest";
import {
  privateAudioMediaAssetSchema, privateAudioMediaUrl, privateDesktopMediaAssetSchema, privateVisualMediaAssetSchema,
  privateVisualMediaUrl, trustedAudioMediaAssetSchema, trustedDesktopMediaAssetSchema, trustedVisualMediaAssetSchema
} from "./desktop-media-asset.js";

const snapshot = { assetId: "video", version: "a".repeat(64), mimeType: "video/mp4" as const, sizeBytes: 100 * 1024 * 1024, durationMs: 60_000 };
const grant = { snapshot, handle: `med_${"a".repeat(43)}`, expiresAt: Date.now() + 60_000 };
const reference = { protocolVersion: 1 as const, snapshot, handle: `private_${"b".repeat(43)}` };
it("accepts an original 100 MiB video for visual and audio reference transport", () => {
  for (const schema of [trustedAudioMediaAssetSchema, trustedVisualMediaAssetSchema]) expect(schema.safeParse({ assetId: "video", grant }).success).toBe(true);
  for (const schema of [privateAudioMediaAssetSchema, privateVisualMediaAssetSchema]) expect(schema.safeParse({ assetId: "video", reference }).success).toBe(true);
});
it("keeps trusted grants out of the strict renderer contract", () => {
  expect(privateDesktopMediaAssetSchema.safeParse({ assetId: "video", grant }).success).toBe(false);
  expect(trustedDesktopMediaAssetSchema.safeParse({ assetId: "video", reference }).success).toBe(false);
  for (const extra of [{ grant }, { bytes: new Uint8Array(1) }, { url: "http://127.0.0.1/media" }, { path: "C:/media" }]) {
    expect(privateDesktopMediaAssetSchema.safeParse({ assetId: "video", reference, ...extra }).success).toBe(false);
  }
});
it("retains identity, MIME eligibility and import ceilings without a batch byte cap", () => {
  expect(trustedDesktopMediaAssetSchema.safeParse({ assetId: "other", grant }).success).toBe(false);
  expect(privateDesktopMediaAssetSchema.safeParse({ assetId: "other", reference }).success).toBe(false);
  expect(privateVisualMediaAssetSchema.safeParse({ assetId: "video", reference: { ...reference, snapshot: { ...snapshot, sizeBytes: snapshot.sizeBytes + 1 } } }).success).toBe(false);
  const image = { ...snapshot, mimeType: "image/png", sizeBytes: 10 * 1024 * 1024 };
  const audio = { ...snapshot, mimeType: "audio/wav", sizeBytes: 25 * 1024 * 1024 };
  expect(privateAudioMediaAssetSchema.safeParse({ assetId: "video", reference: { ...reference, snapshot: image } }).success).toBe(false);
  expect(trustedVisualMediaAssetSchema.safeParse({ assetId: "video", grant: { ...grant, snapshot: audio } }).success).toBe(false);
  expect(privateDesktopMediaAssetSchema.safeParse({ assetId: "video", reference: { ...reference, snapshot: { ...image, sizeBytes: image.sizeBytes + 1 } } }).success).toBe(false);
});
it("builds only fixed private origin URLs from validated private handles", () => {
  expect(privateAudioMediaUrl(reference)).toBe(`stream-jams-audio://player/media/${reference.handle}`);
  expect(privateVisualMediaUrl(reference)).toBe(`stream-jams-overlay://surface/media/${reference.handle}`);
  expect(() => privateAudioMediaUrl({ ...reference, handle: grant.handle })).toThrow();
  expect(() => privateVisualMediaUrl({ ...reference, protocolVersion: 0 } as unknown as typeof reference)).toThrow();
});
