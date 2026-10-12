import { describe, expect, it } from "vitest";
import { createPreMigrationDatabase } from "../../test-support/pre-migration-database.js";
import { customDataOverlaysMigration } from "./migrations/048-custom-data-overlays.js";
import { dataOverlayTemplatesMigration } from "./migrations/049-data-overlay-templates.js";
import { SqliteDataOverlayRepository } from "../data-overlays/sqlite-data-overlay-repository.js";
import { applyStreamJamsMigration, currentSchemaVersion, openStreamJamsDatabase } from "./database.js";

function seedPreview(includeTemplates: boolean) {
  const fixture = createPreMigrationDatabase("042-manual-event-bus");
  applyStreamJamsMigration(fixture.connection, customDataOverlaysMigration);
  fixture.connection.prepare("INSERT INTO schema_migrations VALUES ('042-custom-data-overlays', '2026-10-08T00:00:00Z')").run();
  if (includeTemplates) {
    applyStreamJamsMigration(fixture.connection, dataOverlayTemplatesMigration);
    fixture.connection.prepare("INSERT INTO schema_migrations VALUES ('043-data-overlay-templates', '2026-10-09T00:00:00Z')").run();
  }
  const value = { id: "count", name: "Count", kind: "integer", content: 42, resetDefault: 5, resetGroupId: null, revision: 3, createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z" };
  fixture.connection.prepare("INSERT INTO data_values VALUES ('count','count',NULL,?)").run(JSON.stringify(value));
  fixture.connection.prepare("INSERT INTO data_goals VALUES ('goal','goal','count',?)").run(JSON.stringify({ id: "goal", name: "Goal", valueId: "count", mode: "saved-baseline", baseline: 10, additionalAmount: 50 }));
  fixture.connection.exec("INSERT INTO data_pins VALUES ('count',0)");
  return fixture;
}

describe("Data preview history merged with main", () => {
  it.each([false, true])("preserves Data while adding main migrations (templates=%s)", includeTemplates => {
    using fixture = seedPreview(includeTemplates);
    const database = fixture.upgrade();
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()?.count).toBe(currentSchemaVersion);
    const state = new SqliteDataOverlayRepository(database).read();
    expect(state.values[0]).toMatchObject({ content: 42, resetDefault: 5, revision: 3 });
    expect(state.goals[0]).toMatchObject({ mode: "saved-baseline", baseline: 10, additionalAmount: 50 });
    expect(state.pinnedValueIds).toEqual(["count"]);
    expect(database.connection.prepare("SELECT applied_at FROM schema_migrations WHERE id = '048-custom-data-overlays'").get()?.applied_at).toBe("2026-10-08T00:00:00Z");
    if (includeTemplates) expect(database.connection.prepare("SELECT applied_at FROM schema_migrations WHERE id = '049-data-overlay-templates'").get()?.applied_at).toBe("2026-10-09T00:00:00Z");
    expect(() => database.runMigrations()).not.toThrow();
  });
  it("rolls back the history splice and Data when a main migration fails", () => {
    using fixture = seedPreview(true);
    const before = fixture.connection.prepare("SELECT * FROM schema_migrations ORDER BY rowid").all();
    fixture.connection.exec("CREATE TRIGGER fail_splice BEFORE INSERT ON schema_migrations WHEN NEW.id = '047-retire-public-overlays' BEGIN SELECT RAISE(ABORT,'splice rejected'); END");
    const path = String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    expect(() => openStreamJamsDatabase(path)).toThrow("splice rejected");
    expect(fixture.connection.prepare("SELECT * FROM schema_migrations ORDER BY rowid").all()).toEqual(before);
    expect(JSON.parse(String(fixture.connection.prepare("SELECT document FROM data_values WHERE id='count'").get()?.document))).toMatchObject({ content: 42 });
  });
});
