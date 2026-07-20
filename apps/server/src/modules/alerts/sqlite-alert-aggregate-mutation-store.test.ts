import type { AlertCollection, AlertRule } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { createAlertEditorDocumentFromRule } from "./alert-editor-service.js";
import { SqliteAlertAggregateMutationStore } from "./sqlite-alert-aggregate-mutation-store.js";
import { SqliteAlertEditorDocumentRepository } from "./sqlite-alert-editor-document-repository.js";
import { SqliteAlertRepository } from "./sqlite-alert-repository.js";
import { SqliteAlertSetMetadataRepository } from "./sqlite-alert-set-metadata-repository.js";

describe("SqliteAlertAggregateMutationStore", () => {
  it("commits a rule, metadata, and editor document as one synchronous mutation", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { alerts, metadata, documents, store } = createStore(database.connection);
    const collection = createCollection();
    const rule = createRule();
    const ruleMetadata = createRuleMetadata();

    store.commit({
      missingCollectionIds: [collection.id],
      missingRuleIds: [rule.id],
      saveCollections: [collection],
      saveRules: [rule],
      saveRuleMetadata: [ruleMetadata],
      saveDocuments: [createAlertEditorDocumentFromRule(rule, 0, ruleMetadata)]
    });

    await expect(alerts.findRuleById(rule.id)).resolves.toEqual(rule);
    await expect(metadata.findRule(rule.id)).resolves.toEqual(ruleMetadata);
    await expect(documents.find(rule.id)).resolves.toMatchObject({ id: rule.id, name: rule.name });
  });

  it("rolls back only the alert mutation when an unrelated diagnostic commits before it", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const { alerts, metadata, documents, store } = createStore(database.connection);
    const collection = createCollection();
    const original = createRule();
    alerts.saveCollectionSync(collection);
    alerts.saveRuleSync(original);

    database.connection.prepare(
      `INSERT INTO event_logs (
         id, event_id, event_type, event_json, received_at, status, correlation_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "event-log-unrelated",
      "event-unrelated",
      "follow",
      "{}",
      "2026-07-20T12:00:00.000Z",
      "processed",
      "correlation-unrelated"
    );

    const changed = { ...original, name: "Must roll back" };
    const duplicateVariantRule = {
      ...original,
      id: "alert-invalid",
      variants: [original.variants[0]!, original.variants[0]!]
    };
    expect(() => store.commit({
      expectedCollections: [collection],
      expectedRules: [original],
      missingRuleIds: [duplicateVariantRule.id],
      saveRules: [changed, duplicateVariantRule]
    })).toThrow("duplicate variant IDs");

    await expect(alerts.findRuleById(original.id)).resolves.toEqual(original);
    await expect(alerts.findRuleById(duplicateVariantRule.id)).resolves.toBeNull();
    await expect(metadata.findRule(original.id)).resolves.toBeNull();
    await expect(documents.find(original.id)).resolves.toBeNull();
    expect(database.connection.prepare("SELECT id FROM event_logs").all()).toEqual([
      { id: "event-log-unrelated" }
    ]);
  });
});

function createStore(connection: ConstructorParameters<typeof SqliteAlertRepository>[0]) {
  const alerts = new SqliteAlertRepository(connection);
  const metadata = new SqliteAlertSetMetadataRepository(connection);
  const documents = new SqliteAlertEditorDocumentRepository(connection);
  return {
    alerts,
    metadata,
    documents,
    store: new SqliteAlertAggregateMutationStore(connection, alerts, metadata, documents)
  };
}

function createCollection(): AlertCollection {
  return { id: "set-default", name: "Default", enabled: true };
}

function createRule(): AlertRule {
  return {
    id: "alert-follow",
    name: "New follower",
    eventType: "follow",
    enabled: true,
    collectionIds: ["set-default"],
    conditions: [],
    variants: [{
      id: "variant-follow",
      name: "Default",
      enabled: true,
      weight: 1,
      visualAssetId: null,
      audioAssetId: null,
      textTemplate: "Thanks, {actor.displayName}!",
      ttsConfig: null,
      durationMs: 5_000,
      layout: { x: 640, y: 760, width: 640, height: 180, zIndex: 10 }
    }],
    cooldownSeconds: 0,
    priority: 0
  };
}

function createRuleMetadata() {
  return {
    ruleId: "alert-follow",
    providerKind: "twitch" as const,
    reviewState: "ready" as const,
    targetProfileIds: ["landscape", "vertical"] as const
  };
}
