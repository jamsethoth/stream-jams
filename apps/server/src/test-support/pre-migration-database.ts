import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openStreamJamsDatabase, runInTransaction, streamJamsMigrations, type StreamJamsDatabase } from "../modules/db/database.js";

/** Build an actual historical database from the authoritative prefix, never undo a newer schema. */
export function createPreMigrationDatabase(beforeId: string) {
  const stop = streamJamsMigrations.findIndex(migration => migration.id === beforeId);
  if (stop < 0) throw new Error("Unknown migration fixture boundary.");
  const directory = mkdtempSync(join(tmpdir(), "stream-jams-old-schema-"));
  const path = join(directory, "old.sqlite");
  const connection = new DatabaseSync(path);
  connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)");
  runInTransaction(connection, () => {
    for (const migration of streamJamsMigrations.slice(0, stop)) {
      connection.exec(migration.sql);
      connection.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(migration.id, "2026-10-10T12:00:00.000Z");
    }
  });
  let upgraded: StreamJamsDatabase | undefined;
  return {
    connection,
    upgrade() { connection.close(); upgraded = openStreamJamsDatabase(path); return upgraded; },
    [Symbol.dispose]() { if (connection.isOpen) connection.close(); upgraded?.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}
