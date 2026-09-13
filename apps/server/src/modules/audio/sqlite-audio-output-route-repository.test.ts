import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alertEditorDocumentSchema } from "@stream-jams/core";
import { expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, openStreamJamsDatabase, runInTransaction } from "../db/database.js";
import { SqliteAlertEditorDocumentRepository } from "../alerts/sqlite-alert-editor-document-repository.js";
import { SqliteAudioOutputRouteRepository } from "./sqlite-audio-output-route-repository.js";

const route = { id: "route-a", name: "Headphones", deviceId: "device-a", deviceLabel: "XLR headphones" };

it("persists rename/bind/unbind across restart and enforces SQLite NOCASE names", () => {
  const root = mkdtempSync(join(tmpdir(), "stream-jams-audio-routes-"));
  try {
    const path = join(root, "test.sqlite");
    {
      using db = openStreamJamsDatabase(path);
      const repository = new SqliteAudioOutputRouteRepository(db.connection);
      repository.save(route);
      repository.save({ ...route, name: "Monitor" });
      expect(() => repository.save({ ...route, id: "b", name: "mONitor" })).toThrow(/name/i);
      expect(() => repository.save({ ...route, deviceLabel: null })).toThrow();
    }
    using db = openStreamJamsDatabase(path);
    const repository = new SqliteAudioOutputRouteRepository(db.connection);
    expect(repository.list()).toEqual([{ ...route, name: "Monitor" }]);
    repository.save({ ...route, name: "Monitor", deviceId: null, deviceLabel: null });
    expect(repository.findById(route.id)).toMatchObject({ deviceId: null, deviceLabel: null });
    repository.delete(route.id);
    expect(repository.findById(route.id)).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("checks references in the same transaction as saves and deletes, whichever wins first", async () => {
  using db = createInMemoryStreamJamsDatabase();
  db.connection.exec("INSERT INTO alert_rules VALUES ('alert-a', 'Follow', 'follow', 0, 0, 0)");
  const routes = new SqliteAudioOutputRouteRepository(db.connection);
  const documents = new SqliteAlertEditorDocumentRepository(db.connection);
  const document = alertEditorDocumentSchema.parse({ schemaVersion: 1,
    id: "alert-a", setId: "set-a", providerKind: "twitch", eventType: "follow", kind: "default",
    parentAlertId: null, name: "Follow", enabled: false, conditions: [], durationMs: 1000,
    outputs: { browserSource: false, deviceRouteIds: [route.id] }, layers: [],
    targetProfiles: ["landscape", "vertical"].map(id => ({ id, enabled: false, reviewState: "needs-review", layerLayouts: [] })),
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  });
  routes.save(route);
  await documents.save(document);
  expect(routes.findReferences(route.id)).toEqual([{ alertId: "alert-a", name: "Follow" }]);
  expect(() => routes.delete(route.id)).toThrow(/referenced/i);
  expect(routes.findById(route.id)).toEqual(route);
  // Device absence is not a reason to erase a saved reference.
  await documents.save({ ...document, name: "Renamed" });
  expect((await documents.find(document.id))?.outputs).toEqual(document.outputs);
  await documents.save({ ...document, outputs: { browserSource: true, deviceRouteIds: [] } });
  routes.delete(route.id);
  await expect(documents.save(document)).rejects.toMatchObject({ code: "AUDIO_ROUTE_NOT_FOUND", statusCode: 409 });
  expect((await documents.find(document.id))?.outputs.deviceRouteIds).toEqual([]);
  expect(() => runInTransaction(db.connection, () => {
    routes.save({ ...route, id: "new" });
    documents.saveSync(document);
  })).toThrow();
  expect(routes.findById("new")).toBeNull();
});
