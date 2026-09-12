import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { AssetRecord, DesktopVisualBatch } from "@stream-jams/core";
import { DesktopVisualAssetResolver } from "./desktop-visual-asset-resolver.js";

const bytes = Buffer.from([1, 2, 3]);
const checksum = createHash("sha256").update(bytes).digest("hex");
it("accepts the canonical sha256-prefixed checksum used by runtime imports", async () => {
  const { resolver } = harness({ checksum: `sha256:${checksum}` });
  expect((await resolver.resolve(input())).assets[0]?.bytes).toEqual(new Uint8Array(bytes));
  await expect(harness({ checksum: `sha256:${"0".repeat(64)}` }).resolver.resolve(input())).rejects.toThrow();
});
const input = (): Omit<DesktopVisualBatch, "assets"> => ({
  key: { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "one", generation: 1 },
  timing: { startsAtEpochMs: 1000, endsAtEpochMs: 2000 },
  instructions: [{ id: "layer", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", durationMs: 1000, audio: null, tts: null, text: null,
    visual: { assetId: "asset", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } }]
});
function harness(record: Partial<AssetRecord> = {}) {
  const records = new Map<string, AssetRecord>([["asset", { id: "asset", originalFileName: "one.png", mediaType: "image", mimeType: "image/png", sizeBytes: 3, checksum, storagePath: "image/asset", ...record }]]);
  const findManyByIds = vi.fn(async () => records as ReadonlyMap<string, AssetRecord>);
  const readBounded = vi.fn<(path: string, max: number) => Promise<Uint8Array>>(async () => bytes);
  const resolver = new DesktopVisualAssetResolver({ assetRepository: { findManyByIds }, assetStore: { readBounded } });
  return { resolver, records, findManyByIds, readBounded };
}
it("resolves only referenced IDs once and compacts pooled bytes without exposing storage paths", async () => {
  const { resolver, records, findManyByIds, readBounded } = harness();
  records.set("unreferenced", { ...records.get("asset")!, id: "unreferenced" });
  const batch = input(); batch.instructions.push({ ...batch.instructions[0]!, id: "second" });
  const result = await resolver.resolve(batch);
  expect(findManyByIds).toHaveBeenCalledExactlyOnceWith(["asset"]);
  expect(readBounded).toHaveBeenCalledExactlyOnceWith("image/asset", 3);
  expect(result.assets).toEqual([{ assetId: "asset", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }]);
  expect(result.assets[0]!.bytes.byteOffset).toBe(0); expect(result.assets[0]!.bytes.buffer.byteLength).toBe(3);
  expect(result.assets[0]!.bytes.buffer).not.toBe(bytes.buffer);
});

it.each([
  { id: "wrong" }, { mediaType: "audio" as const }, { mimeType: "text/html" }, { mimeType: "video/mp4" },
  { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: 0.5 }, { sizeBytes: 10 * 1024 * 1024 + 1 }, { checksum: "invalid" }
])("rejects unsupported or corrupt metadata before reading: %j", async record => {
  const { resolver, readBounded } = harness(record);
  await expect(resolver.resolve(input())).rejects.toThrow(); expect(readBounded).not.toHaveBeenCalled();
});
it.each([{ sizeBytes: 2 }, { checksum: "0".repeat(64) }])("rejects changed content without returning a partial batch: %j", async record => {
  const { resolver } = harness(record); await expect(resolver.resolve(input())).rejects.toThrow();
});
it("rejects missing records and filesystem read failures", async () => {
  const missing = harness(); missing.records.clear();
  await expect(missing.resolver.resolve(input())).rejects.toThrow(); expect(missing.readBounded).not.toHaveBeenCalled();
  const failed = harness(); failed.readBounded.mockRejectedValueOnce(new Error("read failed"));
  await expect(failed.resolver.resolve(input())).rejects.toThrow();
});
it("returns text-only content without repository or filesystem access", async () => {
  const { resolver, findManyByIds, readBounded } = harness(); const batch = input(); batch.instructions[0]!.visual = null;
  expect(await resolver.resolve(batch)).toEqual({ ...batch, assets: [] });
  expect(findManyByIds).not.toHaveBeenCalled(); expect(readBounded).not.toHaveBeenCalled();
});
it.each(["url", "audio", "identity", "duration", "duplicate", "extra"]) ("rejects invalid %s input before repository access", async failure => {
  const { resolver, findManyByIds } = harness(); const batch = input();
  if (failure === "url") Object.assign(batch.instructions[0]!.visual!, { url: "https://example.com/asset" });
  if (failure === "audio") Object.assign(batch.instructions[0]!, { audio: { assetId: "audio", volume: 1 } });
  if (failure === "identity") batch.instructions[0]!.moduleId = "wrong";
  if (failure === "duration") batch.instructions[0]!.durationMs = 3000;
  if (failure === "duplicate") batch.instructions.push(batch.instructions[0]!);
  if (failure === "extra") Object.assign(batch, { assets: [] });
  await expect(resolver.resolve(batch)).rejects.toThrow(); expect(findManyByIds).not.toHaveBeenCalled();
});
it("rejects aggregate metadata over 128MiB before allocating media", async () => {
  const { resolver, records, readBounded } = harness({ mediaType: "video", mimeType: "video/webm", sizeBytes: 65 * 1024 * 1024 });
  records.set("second", { ...records.get("asset")!, id: "second" });
  const batch = input(); batch.instructions[0]!.visual!.mediaType = "video";
  batch.instructions.push({ ...batch.instructions[0]!, id: "second", visual: { ...batch.instructions[0]!.visual!, assetId: "second" } });
  await expect(resolver.resolve(batch)).rejects.toThrow(); expect(readBounded).not.toHaveBeenCalled();
});

it.each([
  { mediaType: "gif" as const, mimeType: "image/gif" },
  { mediaType: "video" as const, mimeType: "video/mp4" },
  { mediaType: "video" as const, mimeType: "video/webm" }
])("resolves supported normalized visual media: %j", async record => {
  const { resolver } = harness(record); const batch = input(); batch.instructions[0]!.visual!.mediaType = record.mediaType;
  expect((await resolver.resolve(batch)).assets[0]!.mimeType).toBe(record.mimeType);
});

it("reads sequentially and stops after a failed asset without reading later files", async () => {
  const { resolver, records, readBounded } = harness();
  records.set("second", { ...records.get("asset")!, id: "second", storagePath: "image/second" });
  const batch = input(); batch.instructions.push({ ...batch.instructions[0]!, id: "second", visual: { ...batch.instructions[0]!.visual!, assetId: "second" } });
  let finish!: (value: Uint8Array) => void;
  readBounded.mockImplementationOnce(() => new Promise<Uint8Array>(resolve => { finish = resolve; }));
  const resolving = resolver.resolve(batch); await Promise.resolve(); await Promise.resolve();
  expect(readBounded).toHaveBeenCalledTimes(1);
  finish(bytes); expect((await resolving).assets).toHaveLength(2); expect(readBounded.mock.calls.map(call => call[0])).toEqual(["image/asset", "image/second"]);
  readBounded.mockClear(); readBounded.mockRejectedValueOnce(new Error("read failed"));
  await expect(resolver.resolve(batch)).rejects.toThrow(); expect(readBounded).toHaveBeenCalledTimes(1);
});
