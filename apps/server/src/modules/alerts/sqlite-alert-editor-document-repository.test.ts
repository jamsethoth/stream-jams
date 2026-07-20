import { describe, expect, it } from "vitest";
import type { AlertEditorDocument } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAlertRepository } from "./sqlite-alert-repository.js";
import { SqliteAlertEditorDocumentRepository } from "./sqlite-alert-editor-document-repository.js";

describe("SqliteAlertEditorDocumentRepository", () => {
  it("round-trips a validated document and replaces it by alert identity", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = new SqliteAlertRepository(database.connection);
    await alerts.saveCollection({ id: "set-default", name: "Default", enabled: true });
    await alerts.saveRule({
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
        textTemplate: "{userName}",
        ttsConfig: null,
        durationMs: 5_000,
        layout: { x: 710, y: 420, width: 500, height: 120, zIndex: 1 }
      }],
      cooldownSeconds: 0,
      priority: 0
    });
    const repository = new SqliteAlertEditorDocumentRepository(database.connection, () => new Date("2026-07-15T12:00:00Z"));
    const document = editorDocument();

    await expect(repository.find(document.id)).resolves.toBeNull();
    await expect(repository.save(document)).resolves.toEqual(document);
    await expect(repository.find(document.id)).resolves.toEqual(document);
    await expect(repository.findMany([])).resolves.toEqual(new Map());
    await expect(repository.findMany([document.id, document.id, "missing"])).resolves.toEqual(
      new Map([[document.id, document]])
    );

    const renamed = { ...document, name: "Follower welcome" };
    await repository.save(renamed);
    await expect(repository.find(document.id)).resolves.toEqual(renamed);
  });

  it("stores and deletes a variation document by its variant identity", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = new SqliteAlertRepository(database.connection);
    await alerts.saveCollection({ id: "set-default", name: "Default", enabled: true });
    await alerts.saveRule({
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
        textTemplate: "{userName}",
        ttsConfig: null,
        durationMs: 5_000,
        layout: { x: 710, y: 420, width: 500, height: 120, zIndex: 1 }
      }],
      cooldownSeconds: 0,
      priority: 0
    });
    const repository = new SqliteAlertEditorDocumentRepository(database.connection);
    const document = {
      ...editorDocument(),
      id: "variant-follow",
      kind: "variation" as const,
      parentAlertId: "alert-follow"
    };

    await expect(repository.save(document)).resolves.toEqual(document);
    await expect(repository.find(document.id)).resolves.toEqual(document);
    await expect(repository.delete(document.id)).resolves.toBeUndefined();
    await expect(repository.find(document.id)).resolves.toBeNull();
  });

  it("preserves a variation document when its owning rule is updated", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = new SqliteAlertRepository(database.connection);
    await alerts.saveCollection({ id: "set-default", name: "Default", enabled: true });
    const defaultVariant = alertVariant("variant-follow", "Default");
    const variation = alertVariant("variant-vip", "VIP");
    const rule = {
      id: "alert-follow",
      name: "New follower",
      eventType: "follow" as const,
      enabled: true,
      collectionIds: ["set-default"],
      conditions: [],
      variants: [defaultVariant, variation],
      cooldownSeconds: 0,
      priority: 0
    };
    await alerts.saveRule(rule);
    const repository = new SqliteAlertEditorDocumentRepository(database.connection);
    const document = {
      ...editorDocument(),
      id: variation.id,
      kind: "variation" as const,
      parentAlertId: rule.id,
      name: variation.name
    };
    await repository.save(document);

    await alerts.saveRule({
      ...rule,
      variants: [defaultVariant, { ...variation, enabled: false }]
    });

    await expect(repository.find(variation.id)).resolves.toEqual(document);
  });
});

function alertVariant(id: string, name: string) {
  return {
    id,
    name,
    enabled: true,
    weight: 1,
    visualAssetId: null,
    audioAssetId: null,
    textTemplate: "{userName}",
    ttsConfig: null,
    durationMs: 5_000,
    layout: { x: 710, y: 420, width: 500, height: 120, zIndex: 1 }
  };
}

function editorDocument(): AlertEditorDocument {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5_000,
    layers: [{
      id: "layer-text",
      name: "Follower name",
      type: "text",
      visible: true,
      order: 0,
      template: "{userName}",
      animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
    }],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "layer-text", x: 710, y: 420, width: 500, height: 120, zIndex: 1 }] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [{ layerId: "layer-text", x: 290, y: 800, width: 500, height: 120, zIndex: 1 }] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: { userName: "James" } }]
  };
}
