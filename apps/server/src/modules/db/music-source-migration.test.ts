import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { runInTransaction } from "./database.js";
import { providerRegistrationsMigration } from "./migrations/005-provider-registrations.js";
import { musicSourceProvidersMigration } from "./migrations/031-music-source-providers.js";

const createdAt = "2026-10-04T00:00:00.000Z";
function insert(db: DatabaseSync, id: string, kind: string, capability: string, active: number, secretRef: string | null = null) {
  db.prepare(`INSERT INTO provider_registrations (id,name,kind,capability,non_secret_config_json,secret_ref_json,active,connection_state,intake_state,validated_at,error_json,available_voices_json,tts_safety_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, kind, capability, "{}", secretRef, active, "connected", capability === "event-source" ? "active" : null, createdAt, null, "[]", null, createdAt, createdAt);
}

describe("Music source registration migration", () => {
  it("preserves selected event and TTS rows and secret references while adding independent Music selection", () => {
    using db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(providerRegistrationsMigration.sql);
    insert(db, "event", "twitch", "event-source", 1, '{"namespace":"twitch"}');
    insert(db, "voice", "speakerbot", "tts", 1);
    runInTransaction(db, () => db.exec(musicSourceProvidersMigration.sql));
    insert(db, "music", "pear-desktop", "music-source", 1, '{"namespace":"music"}');
    expect(() => insert(db, "other", "pear-desktop", "music-source", 1)).toThrow();
    expect(db.prepare("SELECT id,active,secret_ref_json FROM provider_registrations ORDER BY id").all()).toEqual([
      { id: "event", active: 1, secret_ref_json: '{"namespace":"twitch"}' },
      { id: "music", active: 1, secret_ref_json: '{"namespace":"music"}' },
      { id: "voice", active: 1, secret_ref_json: null }
    ]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("rolls a failed migration back without losing original rows or secret references", () => {
    using db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(providerRegistrationsMigration.sql);
    insert(db, "event", "streamerbot", "event-source", 1, '{"namespace":"streamerbot"}');
    expect(() => runInTransaction(db, () => { db.exec(musicSourceProvidersMigration.sql); throw new Error("injected failure"); })).toThrow("injected failure");
    expect(db.prepare("SELECT id,kind,secret_ref_json FROM provider_registrations").all()).toEqual([
      { id: "event", kind: "streamerbot", secret_ref_json: '{"namespace":"streamerbot"}' }
    ]);
    expect(() => insert(db, "music", "pear-desktop", "music-source", 1)).toThrow();
  });
});
