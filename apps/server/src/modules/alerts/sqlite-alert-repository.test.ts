import { constants, type DatabaseSync } from "node:sqlite";
import { DefaultAlertService, type AlertCollection, type AlertRule } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAlertRepository } from "./sqlite-alert-repository.js";

describe("SqliteAlertRepository", () => {
  it("saves, finds, lists, and deletes alert collections and rules", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAlertRepository(database.connection);
    seedRuleAssets(database.connection);
    const collection = createCollection("collection-1", "Main Alerts");
    const rule = createRule("rule-1", ["collection-1"]);

    await repository.saveCollection(collection);
    await repository.saveRule(rule);

    await expect(repository.findCollectionById("collection-1")).resolves.toEqual(collection);
    await expect(repository.listCollections()).resolves.toEqual([collection]);
    await expect(repository.findRuleById("rule-1")).resolves.toEqual(rule);
    await expect(repository.listRules()).resolves.toEqual([rule]);

    await repository.deleteRule("rule-1");
    await expect(repository.findRuleById("rule-1")).resolves.toBeNull();

    await repository.deleteCollection("collection-1");
    await expect(repository.findCollectionById("collection-1")).resolves.toBeNull();
  });

  it("round-trips variant conditions and priority", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAlertRepository(database.connection);
    seedRuleAssets(database.connection);
    const collection = createCollection("collection-1", "Main Alerts");
    const rule = createRule("rule-1", ["collection-1"]);
    const variant = rule.variants[0];
    if (variant === undefined) {
      throw new Error("Missing variant fixture");
    }
    const ruleWithVariantSelection = {
      ...rule,
      variants: [
        {
          ...variant,
          conditions: [{ field: "amount", operator: "min" as const, value: 500 }],
          priority: 5
        }
      ]
    };

    await repository.saveCollection(collection);
    await repository.saveRule(ruleWithVariantSelection);

    await expect(repository.findRuleById("rule-1")).resolves.toEqual(ruleWithVariantSelection);
  });

  it("preserves default and variation order independently of their IDs", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAlertRepository(database.connection);
    seedRuleAssets(database.connection);
    const collection = createCollection("collection-1", "Main Alerts");
    const rule = createRule("rule-1", [collection.id]);
    const defaultVariant = { ...rule.variants[0]!, id: "variant-z-default", name: "Default" };
    const variation = { ...rule.variants[0]!, id: "variant-a-special", name: "Special" };

    await repository.saveCollection(collection);
    await repository.saveRule({ ...rule, variants: [defaultVariant, variation] });

    await expect(repository.findRuleById(rule.id)).resolves.toMatchObject({
      variants: [
        { id: "variant-z-default", name: "Default" },
        { id: "variant-a-special", name: "Special" }
      ]
    });
  });

  it("removes deleted collections from persisted rule collection ids", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAlertRepository(database.connection);
    seedRuleAssets(database.connection);
    await repository.saveCollection(createCollection("collection-1", "Main Alerts"));
    await repository.saveCollection(createCollection("collection-2", "Bonus Alerts"));
    await repository.saveRule(createRule("rule-1", ["collection-1", "collection-2"]));

    await repository.deleteCollection("collection-1");

    await expect(repository.findRuleById("rule-1")).resolves.toEqual(
      createRule("rule-1", ["collection-2"])
    );
  });

  it("atomically replaces the active collection when another is enabled", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAlertRepository(database.connection);
    seedRuleAssets(database.connection);

    await repository.saveCollection(createCollection("collection-1", "Main Alerts"));
    await repository.saveCollection(createCollection("collection-2", "Bonus Alerts"));

    await expect(repository.listCollections()).resolves.toEqual([
      { id: "collection-1", name: "Main Alerts", enabled: false },
      { id: "collection-2", name: "Bonus Alerts", enabled: true }
    ]);
  });

  it("rolls back rule child writes when variant persistence fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAlertRepository(database.connection);
    seedRuleAssets(database.connection);
    await repository.saveCollection(createCollection("collection-1", "Main Alerts"));
    const originalRule = createRule("rule-1", ["collection-1"]);
    await repository.saveRule(originalRule);
    const originalVariant = originalRule.variants[0];
    if (originalVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    await expect(
      repository.saveRule({
        ...originalRule,
        variants: [
          originalVariant,
          {
            ...originalVariant,
            name: "Duplicate variant id"
          }
        ]
      })
    ).rejects.toThrow();

    await expect(repository.findRuleById("rule-1")).resolves.toEqual(originalRule);
  });

  it("loads active rules in a fixed number of SELECT statements", async () => {
    const oneRuleSelects = await countActiveRuleSelects(1);
    const oneHundredRuleSelects = await countActiveRuleSelects(100);

    expect(oneRuleSelects).toBe(4);
    expect(oneHundredRuleSelects).toBe(oneRuleSelects);
  });
});

async function countActiveRuleSelects(ruleCount: number): Promise<number> {
  using database = createInMemoryStreamJamsDatabase();
  const repository = new SqliteAlertRepository(database.connection);
  seedRuleAssets(database.connection);
  const service = new DefaultAlertService({ repository, generateId: () => "unused" });
  await repository.saveCollection(createCollection("collection-1", "Main Alerts"));
  for (let index = 0; index < ruleCount; index += 1) {
    const rule = createRule(`rule-${index.toString().padStart(3, "0")}`, ["collection-1"]);
    await repository.saveRule({
      ...rule,
      variants: rule.variants.map((variant) => ({ ...variant, id: `variant-${index}` }))
    });
  }

  let selects = 0;
  database.connection.setAuthorizer((actionCode) => {
    if (actionCode === constants.SQLITE_SELECT) selects += 1;
    return constants.SQLITE_OK;
  });
  try {
    await service.listActiveRules({ eventType: "follow" });
  } finally {
    database.connection.setAuthorizer(null);
  }
  return selects;
}

function createCollection(id: string, name: string): AlertCollection {
  return {
    id,
    name,
    enabled: true
  };
}

function seedRuleAssets(connection: DatabaseSync): void {
  const insert = connection.prepare(
    "INSERT INTO asset_metadata (id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  insert.run("asset-image-1", "image.png", "image", "image/png", 1, "sha256:image", "image.png");
  insert.run("asset-audio-1", "audio.mp3", "audio", "audio/mpeg", 1, "sha256:audio", "audio.mp3");
}

function createRule(id: string, collectionIds: readonly string[]): AlertRule {
  return {
    id,
    name: "Follow Alert",
    eventType: "follow",
    enabled: true,
    collectionIds,
    conditions: [
      {
        field: "actor.displayName",
        operator: "includes",
        value: "jam"
      }
    ],
    variants: [
      {
        id: "variant-1",
        name: "Default",
        enabled: true,
        weight: 1,
        visualAssetId: "asset-image-1",
        audioAssetId: "asset-audio-1",
        textTemplate: "Thanks {actor.displayName}!",
        ttsConfig: {
          enabled: true,
          providerId: "speakerbot",
          voiceId: "voice-1",
          template: "Thanks {actor.displayName}!",
          minimumAmount: null
        },
        durationMs: 5000,
        layout: {
          x: 100,
          y: 200,
          width: 640,
          height: 360,
          zIndex: 1
        }
      }
    ],
    cooldownSeconds: 30,
    priority: 10
  };
}
