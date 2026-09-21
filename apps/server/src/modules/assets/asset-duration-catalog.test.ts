import type { AssetRecord } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { CachedAssetDurationCatalog } from "./asset-duration-catalog.js";

const record = (id: string, durationMs: number | null): AssetRecord => ({
  id, originalFileName: `${id}.mp4`, mediaType: "video", mimeType: "video/mp4", sizeBytes: 10,
  checksum: `sha256:${id}`, storagePath: `video/${id}.mp4`, durationMs
});

describe("CachedAssetDurationCatalog", () => {
  it("deduplicates cold reads, caches missing IDs, and accepts updates and invalidation", async () => {
    const records = new Map([["one", record("one", 1_000)]]);
    const findManyByIds = vi.fn(async (ids: readonly string[]) => new Map(ids.flatMap((id) => records.has(id) ? [[id, records.get(id)!] as const] : [])));
    const catalog = new CachedAssetDurationCatalog({ findManyByIds });

    await expect(catalog.getMany(["one", "one", "missing"])).resolves.toEqual(new Map([["one", records.get("one")!]]));
    await catalog.getMany(["one", "missing"]);
    expect(findManyByIds).toHaveBeenCalledTimes(1);
    catalog.store(record("one", 2_000));
    expect((await catalog.getMany(["one"])).get("one")?.durationMs).toBe(2_000);
    records.set("one", record("one", 3_000));
    catalog.invalidate("one");
    expect((await catalog.getMany(["one"])).get("one")?.durationMs).toBe(3_000);
    expect(findManyByIds).toHaveBeenCalledTimes(2);
  });

  it("replaces every cached duration after a configuration restore", async () => {
    const records = new Map([
      ["kept", record("kept", 1_000)],
      ["removed", record("removed", 2_000)]
    ]);
    const findManyByIds = vi.fn(async (ids: readonly string[]) => new Map(ids.flatMap((id) => records.has(id) ? [[id, records.get(id)!] as const] : [])));
    const catalog = new CachedAssetDurationCatalog({ findManyByIds });
    await catalog.getMany(["kept", "removed"]);
    records.set("kept", record("kept", 3_000));
    records.delete("removed");

    catalog.replace([record("kept", 3_000)]);

    await expect(catalog.getMany(["kept"])).resolves.toEqual(new Map([["kept", record("kept", 3_000)]]));
    await expect(catalog.getMany(["removed"])).resolves.toEqual(new Map());
    expect(findManyByIds).toHaveBeenCalledTimes(2);
  });
});
