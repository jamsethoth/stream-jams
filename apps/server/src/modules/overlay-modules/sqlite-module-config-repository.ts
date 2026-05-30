import type { DatabaseSync } from "node:sqlite";
import type { OverlayModuleConfig, OverlayModuleConfigRepository } from "@stream-jams/core";

interface OverlayModuleConfigRow {
  readonly module_id: unknown;
  readonly enabled: unknown;
  readonly config_json: unknown;
  readonly updated_at: unknown;
}

export class SqliteOverlayModuleConfigRepository implements OverlayModuleConfigRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async getModuleConfig(moduleId: string): Promise<OverlayModuleConfig | null> {
    const row = this.#connection
      .prepare(
        `SELECT module_id, enabled, config_json, updated_at
         FROM overlay_module_config
         WHERE module_id = ?`
      )
      .get(moduleId);

    return row === undefined ? null : mapOverlayModuleConfigRow(row as unknown as OverlayModuleConfigRow);
  }

  async saveModuleConfig(config: OverlayModuleConfig): Promise<void> {
    this.#connection
      .prepare(
        `INSERT INTO overlay_module_config (module_id, enabled, config_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(module_id) DO UPDATE SET
           enabled = excluded.enabled,
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`
      )
      .run(config.moduleId, booleanToInteger(config.enabled), JSON.stringify(config.config), config.updatedAt);
  }
}

function mapOverlayModuleConfigRow(row: OverlayModuleConfigRow): OverlayModuleConfig {
  return {
    moduleId: String(row.module_id),
    enabled: integerToBoolean(row.enabled),
    config: JSON.parse(String(row.config_json)) as unknown,
    updatedAt: String(row.updated_at)
  };
}

function booleanToInteger(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function integerToBoolean(value: unknown): boolean {
  return Number(value) === 1;
}
