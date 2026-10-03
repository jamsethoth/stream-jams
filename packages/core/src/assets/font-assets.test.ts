import { describe, expect, it, vi } from "vitest";
import { DefaultAssetValidator, normalizeAssetMimeType } from "./asset-validator.js";
import { DefaultMediaImportPipeline } from "./media-import-pipeline.js";
import type { AssetRecord } from "./types.js";

function container(format: string): Uint8Array {
  const bytes = new Uint8Array(format === "woff" ? 68 : format === "woff2" ? 54 : 32);
  const view = new DataView(bytes.buffer);
  const signature = format === "ttf" ? [0, 1, 0, 0] : [...(format === "otf" ? "OTTO" : format === "woff" ? "wOFF" : "wOF2")].map(c => c.charCodeAt(0));
  bytes.set(signature);
  if (format === "ttf" || format === "otf") { view.setUint16(4, 1); view.setUint32(20, 28); view.setUint32(24, 4); }
  else {
    bytes.set([0, 1, 0, 0], 4); view.setUint32(8, bytes.length); view.setUint16(12, 1); view.setUint32(16, 32);
    if (format === "woff") { view.setUint32(48, 64); view.setUint32(52, 4); view.setUint32(56, 4); }
    else view.setUint32(20, 4);
  }
  return bytes;
}

describe("font assets", () => {
  it.each(["ttf", "otf", "woff", "woff2"])("validates the %s container and browser MIME fallback", format => {
    const bytes = container(format), validator = new DefaultAssetValidator();
    expect(validator.validate({ originalFileName: `font.${format}`, mimeType: "", bytes, sizeBytes: bytes.length })).toMatchObject({ accepted: true, mediaType: "font" });
    expect(normalizeAssetMimeType("application/octet-stream", `font.${format}`)).toBe(`font/${format}`);
    expect(validator.validate({ originalFileName: `font.${format}`, mimeType: `font/${format}`, bytes, sizeBytes: 10 * 1024 * 1024 + 1 }).accepted).toBe(false);
    expect(validator.validate({ originalFileName: `font.${format}`, mimeType: `font/${format}`, bytes: bytes.subarray(0, 12), sizeBytes: 12 }).accepted).toBe(false);
    bytes[0] = 99;
    expect(validator.validate({ originalFileName: `font.${format}`, mimeType: `font/${format}`, bytes, sizeBytes: bytes.length }).accepted).toBe(false);
  });
  it("rejects out-of-container SFNT tables and mismatched MIME", () => {
    const bytes = container("ttf"), validator = new DefaultAssetValidator();
    new DataView(bytes.buffer).setUint32(20, 1000);
    expect(validator.validate({ originalFileName: "font.ttf", mimeType: "font/ttf", bytes, sizeBytes: bytes.length }).accepted).toBe(false);
    expect(normalizeAssetMimeType("image/png", "font.ttf")).toBe("image/png");
  });
  it("persists normalized font metadata without probing media", async () => {
    const inspect = vi.fn(), records = new Map<string, AssetRecord>();
    const pipeline = new DefaultMediaImportPipeline({ validator: new DefaultAssetValidator(), repository: {
      async save(record) { records.set(record.id, record); return record; }, async list() { return [...records.values()]; }, async findById(id) { return records.get(id) ?? null; }, async findManyByIds(ids) { return new Map(ids.flatMap(id => records.has(id) ? [[id, records.get(id)!]] : [])); }, async delete(id) { records.delete(id); }
    }, store: { async write(input) { return { storagePath: `${input.mediaType}/${input.assetId}${input.normalizedExtension}` }; } }, probe: { inspect }, generateId: () => "font", calculateChecksum: () => "a".repeat(64) });
    const result = await pipeline.importMedia({ originalFileName: "font.ttf", mimeType: "application/x-font-ttf", bytes: container("ttf") });
    expect(result).toMatchObject({ mediaType: "font", mimeType: "font/ttf", durationMs: null, storagePath: "font/font.ttf" });
    expect(inspect).not.toHaveBeenCalled();
  });
});
