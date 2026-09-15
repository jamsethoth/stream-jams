import type { DatabaseSync } from "node:sqlite";
import { runInTransaction } from "../db/database.js";

export interface EffectModuleSettings {
  readonly paused: boolean;
  readonly cooldownSeconds: number;
}

export type PlaybackModuleId = "alerts" | "screen-effects";

interface EffectModuleSettingsRow {
  readonly paused: unknown;
  readonly cooldown_seconds: unknown;
}

export class SqliteEffectModuleSettingsRepository {
  readonly #connection: DatabaseSync;
  readonly #now: () => Date;
  readonly #moduleId: PlaybackModuleId;

  constructor(
    connection: DatabaseSync,
    now: () => Date = () => new Date(),
    moduleId: PlaybackModuleId = "screen-effects"
  ) {
    this.#connection = connection;
    this.#now = now;
    this.#moduleId = moduleId;
  }

  async get(): Promise<EffectModuleSettings> {
    const row = this.#connection.prepare(
      "SELECT paused, cooldown_seconds FROM module_playback_settings WHERE module_id = ?"
    ).get(this.#moduleId) as EffectModuleSettingsRow | undefined;
    if (row === undefined) {
      throw new Error(`${this.#moduleId} module settings are unavailable`);
    }
    return parseSettings({
      paused: row.paused === 1,
      cooldownSeconds: Number(row.cooldown_seconds)
    });
  }

  async save(candidate: EffectModuleSettings): Promise<void> {
    const settings = parseSettings(candidate);
    runInTransaction(this.#connection, () => {
      const result = this.#connection.prepare(`
        UPDATE module_playback_settings
        SET paused = ?, cooldown_seconds = ?, updated_at = ?
        WHERE module_id = ?
      `).run(settings.paused ? 1 : 0, settings.cooldownSeconds, this.#now().toISOString(), this.#moduleId);
      if (result.changes !== 1) {
        throw new Error(`${this.#moduleId} module settings are unavailable`);
      }
    });
  }
}

function parseSettings(candidate: EffectModuleSettings): EffectModuleSettings {
  if (
    typeof candidate.paused !== "boolean"
    || !Number.isInteger(candidate.cooldownSeconds)
    || candidate.cooldownSeconds < 0
    || candidate.cooldownSeconds > 86_400
  ) {
    throw new TypeError("Invalid Screen Effects module settings");
  }
  return { ...candidate };
}
