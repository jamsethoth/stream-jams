import type { AssetRecord, AssetRepository } from "@stream-jams/core";

export interface AssetDurationCatalog {
  getMany(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>>;
  store(record: AssetRecord): void;
  invalidate(assetId: string): void;
}

export class CachedAssetDurationCatalog implements AssetDurationCatalog {
  readonly #cache = new Map<string, AssetRecord | null>();

  constructor(private readonly repository: Pick<AssetRepository, "findManyByIds">) {}

  async getMany(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>> {
    const ids = [...new Set(assetIds)];
    const misses = ids.filter((id) => !this.#cache.has(id));
    if (misses.length > 0) {
      const found = await this.repository.findManyByIds(misses);
      for (const id of misses) this.#cache.set(id, found.get(id) ?? null);
    }
    return new Map(ids.flatMap((id) => {
      const record = this.#cache.get(id);
      return record === undefined || record === null ? [] : [[id, record] as const];
    }));
  }

  store(record: AssetRecord): void {
    this.#cache.set(record.id, record);
  }

  invalidate(assetId: string): void {
    this.#cache.delete(assetId);
  }
}
