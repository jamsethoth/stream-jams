import type { DatabaseSync } from "node:sqlite";
import {
  normalizeModerationSettings,
  type ModerationSettings,
  type ModerationSettingsRepository
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

interface ModerationSettingsRow {
  readonly rendered_max_length: unknown;
  readonly rendered_blocked_terms_json: unknown;
  readonly rendered_strip_urls: unknown;
  readonly tts_max_length: unknown;
  readonly tts_blocked_terms_json: unknown;
  readonly tts_strip_urls: unknown;
}

export class SqliteModerationSettingsRepository implements ModerationSettingsRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  read(): ModerationSettings | null {
    const row = this.#connection
      .prepare(
        `SELECT rendered_max_length, rendered_blocked_terms_json, rendered_strip_urls,
                tts_max_length, tts_blocked_terms_json, tts_strip_urls
         FROM alert_moderation_settings
         WHERE id = 1`
      )
      .get();

    return row === undefined
      ? null
      : normalizeModerationSettings(mapModerationSettingsRow(row as unknown as ModerationSettingsRow));
  }

  replace(settings: ModerationSettings): void {
    const next = normalizeModerationSettings(settings);
    runInTransaction(this.#connection, () => {
      this.#connection
        .prepare(
          `INSERT INTO alert_moderation_settings (
             id, rendered_max_length, rendered_blocked_terms_json, rendered_strip_urls,
             tts_max_length, tts_blocked_terms_json, tts_strip_urls, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             rendered_max_length = excluded.rendered_max_length,
             rendered_blocked_terms_json = excluded.rendered_blocked_terms_json,
             rendered_strip_urls = excluded.rendered_strip_urls,
             tts_max_length = excluded.tts_max_length,
             tts_blocked_terms_json = excluded.tts_blocked_terms_json,
             tts_strip_urls = excluded.tts_strip_urls,
             updated_at = excluded.updated_at`
        )
        .run(
          1,
          next.renderedText.maxLength,
          JSON.stringify(next.renderedText.blockedTerms),
          booleanToInteger(next.renderedText.stripUrls),
          next.ttsText.maxLength,
          JSON.stringify(next.ttsText.blockedTerms),
          booleanToInteger(next.ttsText.stripUrls)
        );
    });
  }
}

function mapModerationSettingsRow(row: ModerationSettingsRow): ModerationSettings {
  return {
    renderedText: {
      maxLength: row.rendered_max_length as number,
      blockedTerms: parseBlockedTerms(row.rendered_blocked_terms_json) as readonly string[],
      stripUrls: integerToBoolean(row.rendered_strip_urls)
    },
    ttsText: {
      maxLength: row.tts_max_length as number,
      blockedTerms: parseBlockedTerms(row.tts_blocked_terms_json) as readonly string[],
      stripUrls: integerToBoolean(row.tts_strip_urls)
    }
  };
}

function parseBlockedTerms(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function booleanToInteger(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function integerToBoolean(value: unknown): boolean {
  if (value === 1) {
    return true;
  }

  if (value === 0) {
    return false;
  }

  return value as boolean;
}
