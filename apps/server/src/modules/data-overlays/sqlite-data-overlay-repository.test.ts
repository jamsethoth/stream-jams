import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStreamJamsDatabase } from "../db/database.js";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteDataOverlayRepository } from "./sqlite-data-overlay-repository.js";
import { DataOverlayService } from "@stream-jams/core";
function fixture() {
  const database = createInMemoryStreamJamsDatabase();
  const repository = new SqliteDataOverlayRepository(database);
  let id = 0;
  const publish = vi.fn();
  const service = new DataOverlayService(repository, { generateId: () => `id-${++id}`, now: () => "2026-10-08T00:00:00.000Z", publish });
  return { database, repository, service, publish };
}
describe("durable data overlay commands", () => {
  it("keeps immutable kinds, names, CAS and serialized safe deltas", () => {
    const { service, repository, database } = fixture();
    const value = service.createValue({ name: " Deaths ", kind: "integer", resetDefault: 0, resetGroupId: null }).values[0]!;
    expect(() => service.createValue({ name: "deaths", kind: "text", resetDefault: "", resetGroupId: null })).toThrow("name");
    service.commandValue(value.id, { action: "add", amount: 1 });
    service.commandValue(value.id, { action: "add", amount: 1 });
    expect(repository.read().values[0]?.content).toBe(2);
    expect(() => service.commandValue(value.id, { action: "set", content: 9, expectedRevision: 0 })).toThrow("revision");
    expect(() => service.updateValue(value.id, { resetDefault: "bad" })).toThrow();
    service.commandValue(value.id, { action: "set", content: Number.MAX_SAFE_INTEGER, expectedRevision: 2 });
    const before = repository.read();
    expect(() => service.commandValue(value.id, { action: "add", amount: 1 })).toThrow();
    expect(repository.read()).toEqual(before);
    database.close();
  });
  it("atomically resets group members and saved baselines with one publication", () => {
    const { service, repository, publish, database } = fixture();
    const group = service.createResetGroup({ name: "Session" }).resetGroups[0]!;
    const value = service.createValue({ name: "Score", kind: "integer", resetDefault: 5, resetGroupId: group.id }).values[0]!;
    service.createGoal({ name: "Goal", valueId: value.id, mode: "saved-baseline", baseline: 1, additionalAmount: 10 });
    service.commandValue(value.id, { action: "add", amount: 20 });
    const revision = repository.read().revision;
    publish.mockClear();
    const result = service.resetGroup(group.id);
    expect(result.revision).toBe(revision + 1);
    expect(result.values[0]?.content).toBe(5);
    expect(result.goals[0]).toMatchObject({ baseline: 5 });
    expect(publish).toHaveBeenCalledOnce();
    expect(new SqliteDataOverlayRepository(database).read()).toEqual(result);
    expect(() => service.deleteValue(value.id)).toThrow("referenced");
    service.deleteGoal(result.goals[0]!.id);
    service.setPins([value.id]);
    expect(() => service.deleteValue(value.id)).toThrow("referenced");
    database.close();
  });
  it("rolls back group reset when a dependent baseline target overflows", () => {
    const { service, repository, publish, database } = fixture();
    const group = service.createResetGroup({ name: "Group" }).resetGroups[0]!;
    const value = service.createValue({ name: "Big", kind: "integer", resetDefault: Number.MAX_SAFE_INTEGER, resetGroupId: group.id }).values[0]!;
    service.createGoal({ name: "Goal", valueId: value.id, mode: "saved-baseline", baseline: 0, additionalAmount: 1 });
    service.commandValue(value.id, { action: "set", content: 0, expectedRevision: 0 });
    const before = repository.read();
    publish.mockClear();
    expect(() => service.resetGroup(group.id)).toThrow();
    expect(repository.read()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
    database.close();
  });
});

it("persists content and saved baselines after closing and reopening a database", () => {
  const dir = mkdtempSync(join(tmpdir(),"data-overlay-test-"));
  try {
    const path = join(dir,"db.sqlite"); const db = openStreamJamsDatabase(path); let id = 0;
    const service = new DataOverlayService(new SqliteDataOverlayRepository(db), { generateId: () => `id-${++id}`, now: () => "2026-10-08T00:00:00.000Z" });
    service.createValue({ name: "Persistent", kind: "integer", resetDefault: 3, resetGroupId: null });
    service.commandValue("id-1", { action: "add", amount: 34 });
    const expected = service.createGoal({ name: "Goal", valueId: "id-1", mode: "saved-baseline", baseline: 37, additionalAmount: 10 });
    db.close(); const reopened = openStreamJamsDatabase(path);
    expect(new SqliteDataOverlayRepository(reopened).read()).toEqual(expected); reopened.close();
  } finally { rmSync(dir,{ recursive: true, force: true }); }
});
it("rolls back actual SQLite write failures and leaves committed state untouched", () => {
  const { service, database, repository, publish } = fixture();
  service.createValue({ name: "Count", kind: "integer", resetDefault: 0, resetGroupId: null });
  const before = repository.read(); publish.mockClear();
  database.connection.exec("CREATE TRIGGER reject_data_write BEFORE INSERT ON data_values BEGIN SELECT RAISE(ABORT,'write failed'); END;");
  expect(() => service.commandValue("id-1",{ action: "add", amount: 1 })).toThrow("write failed");
  expect(repository.read()).toEqual(before); expect(publish).not.toHaveBeenCalled(); database.close();
});
it("returns the committed delta even when notification fails", () => {
  const { database, repository } = fixture();
  const service = new DataOverlayService(repository,{ generateId: () => "id-1", now: () => "2026-10-08T00:00:00.000Z", publish: () => { throw new Error("subscriber failed"); } });
  expect(service.createValue({ name: "Count", kind: "integer", resetDefault: 0, resetGroupId: null }).revision).toBe(1);
  expect(service.commandValue("id-1",{ action: "add", amount: 1 }).values[0]?.content).toBe(1); database.close();
});
it("preserves shared values on canvas deletion and lists binding references", () => {
  const { service, database } = fixture();
  const value = service.createValue({ name: "Count", kind: "integer", resetDefault: 4, resetGroupId: null }).values[0]!;
  const canvas = service.createCanvas({ name: "Canvas", enabled: true, order: 0, targetProfileId: "landscape", outputs: { browser: true, desktop: true }, elements: [{ id: "text", kind: "text", order: 0, x: 0, y: 0, width: 100, height: 50, visible: true, stalePolicy: "retain-last", binding: { kind: "value", valueId: value.id }, literalText: "", format: { thousandsSeparator: false, prefix: "", suffix: "", overflow: "wrap" }, style: { fontSizePx: 16, color: "#ffffffff", fontWeight: 400, align: "left" } }] }).canvases[0]!;
  expect(() => service.deleteValue(value.id)).toThrow("referenced");
  service.setCanvasVisibility(canvas.id,false);
  const state = service.deleteCanvas(canvas.id); expect(state.values[0]?.content).toBe(4); expect(state.canvases).toEqual([]); database.close();
});
