import type { AssetRecord } from "./types.js";

export interface AssetRepository {
  save(record: AssetRecord): Promise<AssetRecord>;
  findById(assetId: string): Promise<AssetRecord | null>;
  list(): Promise<readonly AssetRecord[]>;
  delete(assetId: string): Promise<void>;
}
