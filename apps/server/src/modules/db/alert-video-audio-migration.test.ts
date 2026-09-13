import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { runInTransaction } from "./database.js";
import { alertVideoAudioMigration } from "./migrations/021-alert-video-audio.js";

it("migrates default and variation JSON in numeric layer order, preserving explicit fields and empty arrays", () => {
  using db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE alert_editor_documents (alert_id TEXT PRIMARY KEY, document_json TEXT NOT NULL, updated_at TEXT)");
  const layers = Array.from({ length: 12 }, (_, i) => ({ id: String(i), type: i % 2 ? "audio" : "video", volume: 0.3, ...(i === 2 ? { playEmbeddedAudio: true, audioVolume: 0 } : {}) }));
  const insert = db.prepare("INSERT INTO alert_editor_documents VALUES (?, ?, 'original')");
  insert.run("default", JSON.stringify({ layers, outputs: { browserSource: false, deviceRouteIds: ["private"] } }));
  insert.run("variation", JSON.stringify({ kind: "variation", layers: [] }));
  insert.run("future", JSON.stringify({ schemaVersion: 2, layers }));
  runInTransaction(db, () => db.exec(alertVideoAudioMigration.sql));
  const read = (id: string) => JSON.parse(String(db.prepare("SELECT document_json FROM alert_editor_documents WHERE alert_id = ?").get(id)!.document_json));
  expect(read("default")).toEqual({ schemaVersion: 1, outputs: { browserSource: false, deviceRouteIds: ["private"] }, layers: layers.map((layer, i) => i % 2 ? layer : { playEmbeddedAudio: false, audioVolume: 1, ...layer }) });
  expect(read("variation")).toEqual({ schemaVersion: 1, kind: "variation", layers: [] });
  expect(read("future")).toEqual({ schemaVersion: 2, layers });
  expect(db.prepare("SELECT updated_at FROM alert_editor_documents").all().every(row => row.updated_at === "original")).toBe(true);
});

it("rolls back all document rewrites when the migration transaction fails", () => {
  using db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE alert_editor_documents (document_json TEXT NOT NULL)");
  db.prepare("INSERT INTO alert_editor_documents VALUES (?)").run('{"layers":[]}');
  expect(() => runInTransaction(db, () => { db.exec(alertVideoAudioMigration.sql); throw new Error("failure"); })).toThrow("failure");
  expect(db.prepare("SELECT document_json FROM alert_editor_documents").get()!.document_json).toBe('{"layers":[]}');
});
