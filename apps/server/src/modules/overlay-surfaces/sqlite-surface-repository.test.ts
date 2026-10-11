import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alertsOverlayModuleDefinition, timersOverlayModuleDefinition, StaticOverlayModuleRegistry,
  type DesktopModuleSync, type OverlayModulePresentation } from "@stream-jams/core";
import { expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, openStreamJamsDatabase } from "../db/database.js";
import { SqliteSurfaceRepository } from "./sqlite-surface-repository.js";
import { DesktopModuleSnapshotSink } from "./desktop-module-snapshot-sink.js";

const registry = new StaticOverlayModuleRegistry([alertsOverlayModuleDefinition]);

it("delivers a desktop-capable module-only timer presentation through the private snapshot sink", async () => {
  using db = createInMemoryStreamJamsDatabase();
  const independent = new StaticOverlayModuleRegistry([{ ...timersOverlayModuleDefinition,
    renderer: { ...timersOverlayModuleDefinition.renderer, supportedOutputs: ["module"], supportsDesktopComposition: true }
  }]);
  const repository = new SqliteSurfaceRepository(db.connection, independent);
  await repository.save({ id: "desktop:primary", kind: "desktop", enabled: true, displayId: "42",
    displayLabel: "Main", autoFollowDisplayName: false, opacity: 0.4, layers: [{ moduleId: "timers", visible: true }] });
  const presentation: OverlayModulePresentation = { kind: "timer-stack", stack: {
    targetProfileId: "landscape",
    region: { layout: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 }, orientation: "vertical", maxVisible: 1 },
    cards: [{ definitionId: "timer", generation: "generation", label: "Timer", iconAssetId: null, status: "paused",
      remainingMs: 5000, slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 } }], overflowCount: 0
  } };
  const delivered: DesktopModuleSync[] = [];
  const sink = new DesktopModuleSnapshotSink({ surfaces: repository,
    transport: { syncModule: async sync => { delivered.push(sync); } },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [], presentation }) },
    assets: { resolveTimerModule: async () => ({ presentation, assets: [], missingAssetIds: [] }) }
  });
  try {
    await sink.sync();
    expect(delivered).toEqual([{ moduleId: "timers", revision: 1, presentation, assets: [] }]);
  } finally { await sink.close(); }
});

it("desktop_membership_does_not_depend_on_public_unified_support", async () => {
  using db = createInMemoryStreamJamsDatabase();
  db.connection.exec(`INSERT INTO overlay_keys
    (id, overlay_id, module_id, scope, purpose, key_hash, created_at)
    VALUES ('key', 'output', NULL, 'unified', 'live', 'hash', '2026-09-09T00:00:00.000Z')`);
  const independent = new StaticOverlayModuleRegistry([
    { ...alertsOverlayModuleDefinition, id: "desktop-only", renderer: {
      ...alertsOverlayModuleDefinition.renderer, supportedOutputs: ["module"], supportsDesktopComposition: true
    } },
    { ...alertsOverlayModuleDefinition, id: "browser-only", renderer: {
      ...alertsOverlayModuleDefinition.renderer, supportsDesktopComposition: false
    } }
  ]);
  const repository = new SqliteSurfaceRepository(db.connection, independent);
  const surfaces = await repository.list();
  const desktop = surfaces.find(surface => surface.kind === "desktop")!;
  expect(desktop.layers).toEqual([{ moduleId: "desktop-only", visible: false }]);
  expect(surfaces.find(surface => surface.kind === "unified-browser")?.layers)
    .toEqual([{ moduleId: "browser-only", visible: true }]);
  await repository.save({ ...desktop, layers: [{ moduleId: "desktop-only", visible: true }] });
  await expect(repository.save({ ...desktop, layers: [{ moduleId: "browser-only", visible: true }] })).rejects.toThrow();
  expect((await repository.list()).find(surface => surface.kind === "desktop")?.layers)
    .toEqual([{ moduleId: "desktop-only", visible: true }]);
});

it("preserves saved desktop settings when public unified support changes across restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "stream-jams-desktop-capability-"));
  const path = join(root, "test.sqlite");
  const original = new StaticOverlayModuleRegistry([
    alertsOverlayModuleDefinition, { ...alertsOverlayModuleDefinition, id: "second" }
  ]);
  const saved = { id: "desktop:primary" as const, kind: "desktop" as const, enabled: true,
    displayId: "42", displayLabel: "VG27A", autoFollowDisplayName: true, opacity: 0.4,
    layers: [{ moduleId: "second", visible: false }, { moduleId: "alerts", visible: true }] };
  try {
    {
      using db = openStreamJamsDatabase(path);
      await new SqliteSurfaceRepository(db.connection, original).save(saved);
    }
    using db = openStreamJamsDatabase(path);
    const changed = new StaticOverlayModuleRegistry(original.listModules().map(module => ({
      ...module, renderer: { ...module.renderer, supportedOutputs: ["module"], supportsDesktopComposition: true }
    })));
    const repository = new SqliteSurfaceRepository(db.connection, changed);
    expect(await repository.list()).toEqual([saved]);
    expect(await repository.list()).toEqual([saved]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("creates a disabled unbound desktop and persists explicit settings across restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "stream-jams-surfaces-"));
  const path = join(root, "test.sqlite");
  const saved = { id: "desktop:primary" as const, kind: "desktop" as const, enabled: true, displayId: "42", opacity: 0.5,
    displayLabel: "VG27A", autoFollowDisplayName: true,
    layers: [{ moduleId: "alerts", visible: true }] };
  try {
    {
      using db = openStreamJamsDatabase(path);
      const repository = new SqliteSurfaceRepository(db.connection, registry);
      expect(await repository.list()).toEqual([{ ...saved, enabled: false, displayId: null, opacity: 1,
        displayLabel: null, autoFollowDisplayName: false,
        layers: [{ moduleId: "alerts", visible: false }] }]);
      await repository.save(saved);
    }
    using db = openStreamJamsDatabase(path);
    expect(await new SqliteSurfaceRepository(db.connection, registry).list()).toEqual([saved]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("normalizes legacy desktop JSON without losing its selected ID or presentation", async () => {
  using db = createInMemoryStreamJamsDatabase();
  db.connection.prepare("UPDATE overlay_surfaces SET configuration_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify({
      id: "desktop:primary", kind: "desktop", enabled: true, displayId: "legacy-id", opacity: 0.4,
      layers: [{ moduleId: "alerts", visible: true }]
    }), "2026-09-26T00:00:00.000Z", "desktop:primary");

  await expect(new SqliteSurfaceRepository(db.connection, registry).list()).resolves.toEqual([{
    id: "desktop:primary", kind: "desktop", enabled: true, displayId: "legacy-id", displayLabel: null,
    autoFollowDisplayName: false, opacity: 0.4, layers: [{ moduleId: "alerts", visible: true }]
  }]);
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
