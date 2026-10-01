export const assetRetirementsMigration = {
  id: "029-asset-retirements",
  sql: `
    CREATE TABLE asset_retirements (
      storage_path TEXT PRIMARY KEY NOT NULL,
      asset_id TEXT NOT NULL
    ) STRICT;
    CREATE TRIGGER retain_replaced_asset
    AFTER UPDATE OF storage_path ON asset_metadata
    WHEN OLD.storage_path <> NEW.storage_path
    BEGIN
      INSERT OR IGNORE INTO asset_retirements(storage_path, asset_id)
      VALUES (OLD.storage_path, OLD.id);
    END;
    CREATE TRIGGER retain_deleted_asset
    AFTER DELETE ON asset_metadata
    BEGIN
      INSERT OR IGNORE INTO asset_retirements(storage_path, asset_id)
      VALUES (OLD.storage_path, OLD.id);
    END;
  `
} as const;
