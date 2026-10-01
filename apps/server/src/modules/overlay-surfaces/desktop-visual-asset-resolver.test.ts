import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { AssetRecord, DesktopVisualBatch, TrustedMediaGrant } from "@stream-jams/core";
import { DesktopVisualAssetResolver } from "./desktop-visual-asset-resolver.js";

const checksum = `sha256:${createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex")}`;
const input = (): Omit<DesktopVisualBatch, "assets"> => ({
  key: { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "one", generation: 1 },
  timing: { startsAtEpochMs: 1000, endsAtEpochMs: 2000 },
  instructions: [{ id: "layer", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", durationMs: 1000, audio: null, tts: null, text: null,
    visual: { assetId: "asset", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } }]
});

function harness(record: Partial<AssetRecord> = {}) {
  const records = new Map<string, AssetRecord>([["asset", { id: "asset", originalFileName: "one.png", mediaType: "image", mimeType: "image/png", sizeBytes: 3, checksum, storagePath: "image/asset", durationMs: null, ...record }]]);
  const media = {
    records: vi.fn((owner: string, ids: readonly string[]) => { void owner; void ids; return records; }),
    hasOwner: vi.fn(() => false),
    shareVersion: vi.fn((_owner: string, _source: string, id: string) => { if (!records.has(id)) throw new Error("missing"); }),
    verifyGroup: vi.fn(async (_owner: string, ids: readonly string[]) => { for (const id of ids) if (records.get(id)?.checksum !== checksum) throw new Error("integrity"); }),
    issueTrustedGrant: vi.fn((_owner: string, assetId: string, _recipient: string, expiresAt: number): TrustedMediaGrant => {
      const value = records.get(assetId)!;
      return { handle: `med_${"a".repeat(43)}`, expiresAt, snapshot: { assetId, version: "a".repeat(64), mimeType: value.mimeType as TrustedMediaGrant["snapshot"]["mimeType"], sizeBytes: value.sizeBytes, durationMs: value.durationMs } };
    })
  };
  return { resolver: new DesktopVisualAssetResolver({ media, now: () => 1000 }), records, media };
}
it("uses only referenced owned records and grants without bodies or paths", async () => {
  const { resolver, media } = harness(); const batch = input(); batch.instructions.push({ ...batch.instructions[0]!, id: "second" });
  const result = await resolver.resolve(batch);
  expect(media.records).toHaveBeenCalledExactlyOnceWith('["alerts","one"]', ["asset"]);
  expect(media.verifyGroup).toHaveBeenCalledExactlyOnceWith('["alerts","one"]', ["asset"], expect.any(AbortSignal));
  expect(result.assets).toHaveLength(1); expect(result.assets[0]?.grant.snapshot.mimeType).toBe("image/png");
  expect(JSON.stringify(result)).not.toContain("image/asset"); expect(JSON.stringify(result)).not.toContain('"bytes"');
});
it.each([{ id: "wrong" }, { mediaType: "audio" as const }, { mimeType: "text/html" }, { mimeType: "video/mp4" }, { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: .5 }, { sizeBytes: 10 * 1024 * 1024 + 1 }, { checksum: "invalid" }])("rejects invalid metadata before verification: %j", async record => {
  const { resolver, media } = harness(record); await expect(resolver.resolve(input())).rejects.toThrow(); expect(media.verifyGroup).not.toHaveBeenCalled();
});
it("rejects checksum failure, missing owned records and verification failure", async () => {
  await expect(harness({ checksum: `sha256:${"0".repeat(64)}` }).resolver.resolve(input())).rejects.toThrow("integrity");
  const missing = harness(); missing.records.clear(); await expect(missing.resolver.resolve(input())).rejects.toThrow(); expect(missing.media.verifyGroup).not.toHaveBeenCalled();
  const failed = harness(); failed.media.verifyGroup.mockRejectedValueOnce(new Error("changed file")); await expect(failed.resolver.resolve(input())).rejects.toThrow("changed file");
});
it("returns text-only content without owner or file access", async () => {
  const { resolver, media } = harness(); const batch = input(); batch.instructions[0]!.visual = null;
  expect(await resolver.resolve(batch)).toEqual({ ...batch, assets: [] }); expect(media.records).not.toHaveBeenCalled(); expect(media.verifyGroup).not.toHaveBeenCalled();
});
it.each(["url", "audio", "identity", "duration", "duplicate", "extra"])("rejects invalid %s input before owner access", async failure => {
  const { resolver, media } = harness(); const batch = input();
  if (failure === "url") Object.assign(batch.instructions[0]!.visual!, { url: "https://example.com/asset" });
  if (failure === "audio") Object.assign(batch.instructions[0]!, { audio: { assetId: "audio", volume: 1 } });
  if (failure === "identity") batch.instructions[0]!.moduleId = "wrong";
  if (failure === "duration") batch.instructions[0]!.durationMs = 3000;
  if (failure === "duplicate") batch.instructions.push(batch.instructions[0]!);
  if (failure === "extra") Object.assign(batch, { assets: [] });
  await expect(resolver.resolve(batch)).rejects.toThrow(); expect(media.records).not.toHaveBeenCalled();
});
it.each([{ mediaType: "gif" as const, mimeType: "image/gif" }, { mediaType: "video" as const, mimeType: "video/mp4" }, { mediaType: "video" as const, mimeType: "video/webm" }])("resolves normalized %j media references", async record => {
  const { resolver } = harness(record); const batch = input(); batch.instructions[0]!.visual!.mediaType = record.mediaType;
  expect((await resolver.resolve(batch)).assets[0]?.grant.snapshot.mimeType).toBe(record.mimeType);
});
it("allows several full import-size videos without aggregate body transfer caps", async () => {
  const { resolver, records, media } = harness({ mediaType: "video", mimeType: "video/webm", sizeBytes: 100 * 1024 * 1024 });
  records.set("second", { ...records.get("asset")!, id: "second" }); const batch = input(); batch.instructions[0]!.visual!.mediaType = "video";
  batch.instructions.push({ ...batch.instructions[0]!, id: "second", visual: { ...batch.instructions[0]!.visual!, assetId: "second" } });
  expect((await resolver.resolve(batch)).assets).toHaveLength(2); expect(media.verifyGroup).toHaveBeenCalledTimes(1);
});
it("renews timer references without repeating integrity work for a transport revision", async () => {
  const { resolver, media } = harness();
  const presentation = { kind: "timer-stack", stack: { targetProfileId: "landscape", region: { layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }, orientation: "vertical", maxVisible: 2 }, cards: [
    { definitionId: "one", generation: "g1", label: "One", iconAssetId: "asset", iconVersion: "a".repeat(64), status: "paused", remainingMs: 5000, slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 } },
    { definitionId: "two", generation: "g2", label: "Two", iconAssetId: "missing", iconVersion: "a".repeat(64), status: "paused", remainingMs: 6000, slot: { x: 0, y: 90, width: 320, height: 90, zIndex: 1 } }
  ], overflowCount: 0 } } as const;
  const result = await resolver.resolveTimerModule(presentation);
  expect(result.assets.map(asset => asset.assetId)).toEqual(["asset"]); expect(result.missingAssetIds).toEqual(["missing"]);
  expect(result.presentation.stack.cards.map(card => card.iconAssetId)).toEqual(["asset", null]); expect(media.verifyGroup).not.toHaveBeenCalled();
  await resolver.resolveTimerModule(presentation); expect(media.issueTrustedGrant).toHaveBeenCalledTimes(2);
});
