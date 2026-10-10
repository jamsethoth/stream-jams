import type { DatabaseSync } from "node:sqlite";
import { eventBusSettingsSchema, type EventBusSettings } from "@stream-jams/core";

/**
 * Reads and saves the bus settings row, keeping the current replay age in memory so delivery can read it
 * synchronously.
 */
export class EventBusSettingsService {
  readonly #connection: DatabaseSync;
  readonly #now: () => Date;
  #current: EventBusSettings;

  constructor(connection: DatabaseSync, now: () => Date = () => new Date()) {
    this.#connection = connection;
    this.#now = now;
    this.#current = this.#read();
  }

  get(): EventBusSettings {
    return this.#current;
  }

  replayAgeMs(): number {
    return this.#current.replayAgeSeconds * 1_000;
  }

  save(candidate: unknown): EventBusSettings {
    const settings = eventBusSettingsSchema.parse(candidate);
    this.#connection.prepare("UPDATE event_bus_settings SET replay_age_seconds = ?, updated_at = ? WHERE id = 1")
      .run(settings.replayAgeSeconds, this.#now().toISOString());
    this.#current = settings;
    return settings;
  }

  /** Re-reads the row, for example after a configuration restore replaced it. */
  reload(): EventBusSettings {
    this.#current = this.#read();
    return this.#current;
  }

  #read(): EventBusSettings {
    const row = this.#connection.prepare("SELECT replay_age_seconds FROM event_bus_settings WHERE id = 1").get();
    if (row === undefined) throw new Error("Event bus settings are unavailable");
    return eventBusSettingsSchema.parse({ replayAgeSeconds: Number(row.replay_age_seconds) });
  }
}
