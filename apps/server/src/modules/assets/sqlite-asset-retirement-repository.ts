import type { DatabaseSync } from "node:sqlite";

export interface AssetRetirementRepository {
  list(): readonly { readonly storagePath: string; readonly assetId: string }[];
  isCurrent(storagePath: string): boolean;
  forget(storagePath: string): void;
}

/** Retirement intent is inserted by the asset replacement transaction's trigger. */
export class SqliteAssetRetirementRepository implements AssetRetirementRepository {
  constructor(private readonly connection: DatabaseSync) {}

  list(): readonly { readonly storagePath: string; readonly assetId: string }[] {
    return this.connection.prepare("SELECT storage_path, asset_id FROM asset_retirements").all().map(row => {
      if (typeof row.storage_path !== "string" || typeof row.asset_id !== "string") throw new Error("Invalid asset retirement record");
      return { storagePath: row.storage_path, assetId: row.asset_id };
    });
  }

  isCurrent(storagePath: string): boolean {
    return this.connection.prepare("SELECT 1 FROM asset_metadata WHERE storage_path = ? LIMIT 1").get(storagePath) !== undefined;
  }

  forget(storagePath: string): void {
    this.connection.prepare("DELETE FROM asset_retirements WHERE storage_path = ?").run(storagePath);
  }
}
