import { describe, expect, it } from "vitest";
import { createScreenEffectDocument, screenEffectDocumentSchema, timerEventRulesSchema } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase } from "../database.js";
import { upgradeLegacyEffectBindingRows, upgradeLegacyTimerEventRules } from "../../events/legacy-trigger-selectors.js";
import { SqliteAssetRepository } from "../../assets/sqlite-asset-repository.js";
import { SqliteEffectRepository } from "../../screen-effects/sqlite-effect-repository.js";
import { SqliteTimerDefinitionRepository } from "../../timers/sqlite-timer-definition-repository.js";
import { screenEffectsMigration } from "./022-screen-effects.js";

const legacyBindingsTable = /CREATE TABLE screen_effect_bindings \([\s\S]*?\n\);/u.exec(screenEffectsMigration.sql)![0];

const legacyBindings = [
  { id: "binding-reward", position: 0, kind: "twitch-reward", canonical_identity: 'twitch-reward:["broadcaster-1","reward-1"]', document: { id: "binding-reward", kind: "twitch-reward", broadcasterId: "broadcaster-1", rewardId: "reward-1" } },
  { id: "binding-scene", position: 1, kind: "streamerbot-event", canonical_identity: 'streamerbot-event:["provider-old","OBS","SceneChanged"]', document: { id: "binding-scene", kind: "streamerbot-event", providerId: "provider-old", sourceKey: "OBS", eventType: "SceneChanged" } },
  { id: "binding-scene-again", position: 2, kind: "streamerbot-event", canonical_identity: 'streamerbot-event:["provider-new","OBS","SceneChanged"]', document: { id: "binding-scene-again", kind: "streamerbot-event", providerId: "provider-new", sourceKey: "OBS", eventType: "SceneChanged" } }
];

const legacyRules = [
  { enabled: true, ingestProvider: "streamerbot", eventType: "channel_point_redemption", rewardId: "reward-9", tier: null, action: "start", amountMs: 60000, quantityUnit: null, inactiveBehavior: "ignore" },
  { enabled: false, ingestProvider: "any", eventType: "subscription", rewardId: null, tier: "3000", action: "increment", amountMs: 5000, quantityUnit: null, inactiveBehavior: "paused" },
  { enabled: true, ingestProvider: "twitch", eventType: "cheer", rewardId: null, tier: null, action: "increment", amountMs: 30000, quantityUnit: 100, inactiveBehavior: "start" }
];

async function legacyDatabase() {
  const database = createInMemoryStreamJamsDatabase();
  const db = database.connection;
  await new SqliteAssetRepository(db).save({
    id: "asset-tone", originalFileName: "tone.wav", mediaType: "audio", mimeType: "audio/wav", sizeBytes: 4,
    checksum: "sha256:test-tone", storagePath: "assets/asset-tone.wav", durationMs: null
  });
  const draft = createScreenEffectDocument({ id: "effect-legacy", name: "Legacy", defaultVariantId: "variant-legacy" });
  await new SqliteEffectRepository(db).save({
    ...draft,
    variants: [{ ...draft.variants[0]!, sound: { assetId: "asset-tone", volume: 0.5 }, outputs: { browserSource: true, deviceRouteIds: [] } }]
  });
  new SqliteTimerDefinitionRepository(db).save({
    id: "timer-legacy", label: "Legacy", durationMs: 10000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
    outputs: { browserSource: false, deviceRouteIds: [] }, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", eventRules: []
  });
  db.exec(`DROP TABLE screen_effect_bindings; ${legacyBindingsTable}
    CREATE INDEX screen_effect_bindings_effect_order ON screen_effect_bindings(effect_id, position);
    ALTER TABLE alert_rules DROP COLUMN external_identity_json; DELETE FROM schema_migrations WHERE id = '038-external-alert-identity';
    DELETE FROM schema_migrations WHERE id = '037-event-trigger-selectors';`);
  const insert = db.prepare("INSERT INTO screen_effect_bindings (id, effect_id, position, kind, canonical_identity, document_json) VALUES (?, 'effect-legacy', ?, ?, ?, ?)");
  for (const binding of legacyBindings) insert.run(binding.id, binding.position, binding.kind, binding.canonical_identity, JSON.stringify(binding.document));
  db.prepare("UPDATE timer_definitions SET event_rules_json = ? WHERE id = 'timer-legacy'").run(JSON.stringify(legacyRules));
  return database;
}

function bindingRows(database: ReturnType<typeof createInMemoryStreamJamsDatabase>) {
  return database.connection.prepare("SELECT id, effect_id, position, kind, canonical_identity, document_json FROM screen_effect_bindings ORDER BY position").all()
    .map((row) => ({ ...row }) as Record<string, unknown>);
}

describe("037-event-trigger-selectors", () => {
  it("converts bindings to selectors, keeping the first of bindings that become identical", async () => {
    using database = await legacyDatabase();
    const before = bindingRows(database);
    database.runMigrations();
    const after = bindingRows(database);

    expect(after.map((row) => [row.id, row.kind, row.canonical_identity])).toEqual([
      ["binding-reward", "twitch-reward", 'twitch-reward:["broadcaster-1","reward-1"]'],
      ["binding-scene", "external", 'external:["streamerbot","OBS","SceneChanged"]']
    ]);
    const effect = await new SqliteEffectRepository(database.connection).find("effect-legacy");
    expect(screenEffectDocumentSchema.parse(effect).bindings).toEqual([
      { id: "binding-reward", selector: { match: { kind: "twitch-reward", broadcasterId: "broadcaster-1", rewardId: "reward-1" }, sources: "any", conditions: [] } },
      { id: "binding-scene", selector: { match: { kind: "external", providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" }, sources: "any", conditions: [] } }
    ]);
    expect(upgradeLegacyEffectBindingRows(before).map((row) => ({ ...row, document_json: JSON.parse(String(row.document_json)) as unknown })))
      .toEqual(after.map((row) => ({ ...row, document_json: JSON.parse(String(row.document_json)) as unknown })));
  });

  it("converts timer rules to source-restricted canonical selectors with reward and tier conditions", async () => {
    using database = await legacyDatabase();
    database.runMigrations();
    const stored = String(database.connection.prepare("SELECT event_rules_json FROM timer_definitions WHERE id = 'timer-legacy'").get()?.event_rules_json);
    const rules = timerEventRulesSchema.parse(JSON.parse(stored));

    expect(rules.map((rule) => rule.selector)).toEqual([
      { match: { kind: "canonical", type: "channel_point_redemption" }, sources: ["streamerbot"], conditions: [{ field: "channelPointReward", operator: "equals", value: "reward-9" }] },
      { match: { kind: "canonical", type: "subscription" }, sources: "any", conditions: [{ field: "tier", operator: "equals", value: "3000" }] },
      { match: { kind: "canonical", type: "cheer" }, sources: ["twitch"], conditions: [] }
    ]);
    expect(rules.map(({ enabled, action, amountMs, quantityUnit, inactiveBehavior }) => ({ enabled, action, amountMs, quantityUnit, inactiveBehavior })))
      .toEqual(legacyRules.map(({ enabled, action, amountMs, quantityUnit, inactiveBehavior }) => ({ enabled, action, amountMs, quantityUnit, inactiveBehavior })));
    expect(JSON.parse(String(upgradeLegacyTimerEventRules(JSON.stringify(legacyRules))))).toEqual(JSON.parse(stored));
    expect(new SqliteTimerDefinitionRepository(database.connection).findById("timer-legacy")?.eventRules).toEqual(rules);
  });

  it("leaves rows already in selector form unchanged when run again", async () => {
    using database = await legacyDatabase();
    database.runMigrations();
    const bindings = bindingRows(database);
    const rules = database.connection.prepare("SELECT event_rules_json FROM timer_definitions").all();
    database.connection.exec("ALTER TABLE alert_rules DROP COLUMN external_identity_json; DELETE FROM schema_migrations WHERE id IN ('037-event-trigger-selectors', '038-external-alert-identity')");
    database.runMigrations();
    expect(bindingRows(database)).toEqual(bindings);
    expect(database.connection.prepare("SELECT event_rules_json FROM timer_definitions").all()).toEqual(rules);
  });
});
