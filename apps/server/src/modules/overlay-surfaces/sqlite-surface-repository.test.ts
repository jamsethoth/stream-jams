import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alertsOverlayModuleDefinition, StaticOverlayModuleRegistry } from "@stream-jams/core";
import { expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, openStreamJamsDatabase } from "../db/database.js";
import { SqliteSurfaceRepository } from "./sqlite-surface-repository.js";

const registry = new StaticOverlayModuleRegistry([alertsOverlayModuleDefinition]);

it("creates a disabled unbound desktop and persists explicit settings across restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "stream-jams-surfaces-"));
  const path = join(root, "test.sqlite");
  const saved = { id: "desktop:primary" as const, kind: "desktop" as const, enabled: true, displayId: "42", opacity: 0.5,
    layers: [{ moduleId: "alerts", visible: true }] };
  try {
    {
      using db = openStreamJamsDatabase(path);
      const repository = new SqliteSurfaceRepository(db.connection, registry);
      expect(await repository.list()).toEqual([{ ...saved, enabled: false, displayId: null, opacity: 1,
        layers: [{ moduleId: "alerts", visible: false }] }]);
      await repository.save(saved);
    }
    using db = openStreamJamsDatabase(path);
    expect(await new SqliteSurfaceRepository(db.connection, registry).list()).toEqual([saved]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("preserves existing unified paint order and appends later modules hidden", async () => {
  using db = createInMemoryStreamJamsDatabase();
  db.connection.exec(`INSERT INTO overlay_keys
    (id, overlay_id, module_id, scope, purpose, key_hash, created_at, revoked_at)
    VALUES ('key', 'output', NULL, 'unified', 'live', 'hash', '2026-09-09T00:00:00.000Z', NULL)`);
  const two = new StaticOverlayModuleRegistry([alertsOverlayModuleDefinition, { ...alertsOverlayModuleDefinition, id: "second" }]);
  const repository = new SqliteSurfaceRepository(db.connection, two);
  expect((await repository.list()).find(row => row.kind === "unified-browser")?.layers).toEqual([
    { moduleId: "second", visible: true }, { moduleId: "alerts", visible: true }
  ]);
  const three = new StaticOverlayModuleRegistry([...two.listModules(), { ...alertsOverlayModuleDefinition, id: "third" }]);
  expect((await new SqliteSurfaceRepository(db.connection, three).list()).find(row => row.kind === "unified-browser")?.layers).toEqual([
    { moduleId: "second", visible: true }, { moduleId: "alerts", visible: true }, { moduleId: "third", visible: false }
  ]);
});

it("rejects incomplete saves and rolls back discovery when persistence fails", async () => {
  using db = createInMemoryStreamJamsDatabase();
  const repository = new SqliteSurfaceRepository(db.connection, registry);
  const before = await repository.list();
  const desktop = before[0]!;
  await expect(repository.save({ ...desktop, layers: [] })).rejects.toThrow();
  expect(await repository.list()).toEqual(before);
  db.connection.exec("CREATE TRIGGER fail_surface BEFORE UPDATE ON overlay_surfaces BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  await expect(repository.save({ ...desktop, layers: [{ moduleId: "alerts", visible: true }] })).rejects.toThrow("test failure");
  expect(await repository.list()).toEqual(before);
  const expanded = new StaticOverlayModuleRegistry([...registry.listModules(), { ...alertsOverlayModuleDefinition, id: "new" }]);
  db.connection.exec(`INSERT INTO overlay_keys (id, overlay_id, module_id, scope, purpose, key_hash, created_at)
    VALUES ('new-key', 'new-output', NULL, 'unified', 'live', 'new-hash', '2026-09-09T00:00:00.000Z')`);
  const beforeRows = db.connection.prepare("SELECT * FROM overlay_surfaces ORDER BY id").all();
  await expect(new SqliteSurfaceRepository(db.connection, expanded).list()).rejects.toThrow("test failure");
  expect(db.connection.prepare("SELECT * FROM overlay_surfaces ORDER BY id").all()).toEqual(beforeRows);
});
