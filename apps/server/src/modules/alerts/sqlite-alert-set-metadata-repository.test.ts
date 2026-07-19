import type { AlertCollection, AlertRule } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteAlertRepository } from "./sqlite-alert-repository.js";
import { SqliteAlertSetMetadataRepository } from "./sqlite-alert-set-metadata-repository.js";

describe("SqliteAlertSetMetadataRepository", () => {
  let database: StreamJamsDatabase;
  let alertRepository: SqliteAlertRepository;
  let repository: SqliteAlertSetMetadataRepository;

  beforeEach(async () => {
    database = createInMemoryStreamJamsDatabase();
    alertRepository = new SqliteAlertRepository(database.connection);
    repository = new SqliteAlertSetMetadataRepository(database.connection);
    await alertRepository.saveCollection(collection("set-default", "Default", true));
    await alertRepository.saveCollection(collection("set-winter", "Winter", false));
    await alertRepository.saveRule(rule("alert-follow", "set-default"));
  });

  afterEach(() => database.close());

  it("round-trips set and alert management metadata", async () => {
    await repository.saveSet({
      setId: "set-default",
      starter: true,
      starterReviewState: "pending",
      landscapeEnabled: true,
      landscapeReviewState: "ready",
      verticalEnabled: false,
      verticalReviewState: "needs-review"
    });
    await repository.saveRule({
      ruleId: "alert-follow",
      providerKind: "twitch",
      reviewState: "needs-review",
      targetProfileIds: ["landscape", "vertical"]
    });

    expect(await repository.findSet("set-default")).toMatchObject({ starter: true, starterReviewState: "pending" });
    expect(await repository.findRule("alert-follow")).toMatchObject({
      providerKind: "twitch",
      targetProfileIds: ["landscape", "vertical"]
    });
  });

  it("atomically replaces the one active alert set", async () => {
    await expect(repository.activateSet("set-winter")).resolves.toBe("set-default");
    expect(await alertRepository.listCollections()).toEqual([
      collection("set-default", "Default", false),
      collection("set-winter", "Winter", true)
    ]);
    expect(() =>
      database.connection.prepare("UPDATE alert_collections SET enabled = 1 WHERE id = 'set-default'").run()
    ).toThrow();
  });
});

function collection(id: string, name: string, enabled: boolean): AlertCollection {
  return { id, name, enabled };
}

function rule(id: string, setId: string): AlertRule {
  return {
    id,
    name: "Follow",
    eventType: "follow",
    enabled: false,
    collectionIds: [setId],
    conditions: [],
    variants: [
      {
        id: `${id}-default`,
        name: "Default",
        enabled: false,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: "Thanks {actor.displayName}!",
        ttsConfig: null,
        durationMs: 5_000,
        layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
      }
    ],
    cooldownSeconds: 0,
    priority: 0
  };
}
