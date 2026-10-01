import { describe, expect, it } from "vitest";
import { assertDesktopMediaProtocolVersion, mediaPreviewDescriptorSchema, privateMediaReferenceSchema, trustedMediaGrantSchema } from "./media-reference.js";

const snapshot = { assetId: "large-video", version: "a".repeat(64), mimeType: "video/mp4", sizeBytes: 100 * 1024 * 1024, durationMs: 60_000 };
describe("private media contracts", () => {
  it("permits original large videos without transferring bytes", () => {
    expect(trustedMediaGrantSchema.parse({ snapshot, handle: `med_${"a".repeat(43)}`, expiresAt: Date.now() + 10_000 }).snapshot.sizeBytes).toBe(100 * 1024 * 1024);
    expect(privateMediaReferenceSchema.parse({ snapshot, protocolVersion: 1, handle: `private_${"b".repeat(43)}` }).snapshot).toEqual(snapshot);
  });
  it("rejects bytes, filesystem paths, server capabilities and incompatible protocol versions", () => {
    const reference = { snapshot, protocolVersion: 1, handle: `private_${"b".repeat(43)}` };
    for (const extra of [{ bytes: new Uint8Array(1) }, { path: "C:/media.mp4" }, { url: "http://127.0.0.1/media/secret" }]) {
      expect(privateMediaReferenceSchema.safeParse({ ...reference, ...extra }).success).toBe(false);
    }
    expect(privateMediaReferenceSchema.safeParse({ ...reference, handle: `med_${"a".repeat(43)}` }).success).toBe(false);
    expect(privateMediaReferenceSchema.safeParse({ ...reference, protocolVersion: 0 }).success).toBe(false);
    expect(() => assertDesktopMediaProtocolVersion(0)).toThrow("Incompatible desktop media protocol");
  });
  it("rejects unsafe identity, metadata and arbitrary grant URLs", () => {
    const grant = { snapshot, handle: `med_${"a".repeat(43)}`, expiresAt: Date.now() + 10_000 };
    for (const change of [{ sizeBytes: Number.MAX_SAFE_INTEGER + 1 }, { version: "path/to/file" }, { mimeType: "text/html" }, { assetId: " spaced " }]) {
      expect(trustedMediaGrantSchema.safeParse({ ...grant, snapshot: { ...snapshot, ...change } }).success).toBe(false);
    }
    expect(trustedMediaGrantSchema.safeParse({ ...grant, handle: "http://other/media/file" }).success).toBe(false);
  });
  it("accepts only same-origin scoped preview URLs", () => {
    const preview = { id: "ae0d66b4-cafb-47f4-85fa-fc97e043730a", snapshot, expiresAt: Date.now() + 300_000, url: `/media/med_${"a".repeat(43)}` };
    expect(mediaPreviewDescriptorSchema.safeParse(preview).success).toBe(true);
    for (const url of ["http://127.0.0.1" + preview.url, preview.url + "?token=secret", "/assets/file", "//example.com/media"]) {
      expect(mediaPreviewDescriptorSchema.safeParse({ ...preview, url }).success).toBe(false);
    }
  });
});
