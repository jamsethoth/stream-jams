import { describe, expect, it, vi } from "vitest";
import type {
  AlertEditorDocument,
  AlertRule,
  AlertEditorTestRequest
} from "@stream-jams/core";
import {
  AlertEditorDeliveryBlockedError,
  AlertEditorLiveImpactConfirmationRequiredError,
  AlertEditorService,
  AlertEditorValidationError,
  type AlertEditorDocumentRepository,
  type AlertEditorServiceOptions
} from "./alert-editor-service.js";
import type { AlertRuleManagementMetadata } from "./alert-set-management-service.js";
import { SqliteAlertRepository } from "./sqlite-alert-repository.js";
import { SqliteAlertEditorDocumentRepository } from "./sqlite-alert-editor-document-repository.js";
import { SqliteAlertSetMetadataRepository } from "./sqlite-alert-set-metadata-repository.js";
import { createInMemoryStreamJamsDatabase, runInTransaction } from "../db/database.js";

const rule: AlertRule = {
  id: "alert-follow",
  name: "New follower",
  eventType: "follow",
  enabled: true,
  collectionIds: ["set-default"],
  conditions: [],
  variants: [
    {
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
    }
  ],
  cooldownSeconds: 0,
  priority: 0
};

describe("AlertEditorService", () => {
  it("creates a deterministic editor document for a legacy alert", async () => {
    const harness = createHarness();

    const document = await harness.service.getDocument(rule.id);

    expect(document).toMatchObject({
      id: rule.id,
      setId: "set-default",
      eventType: "follow",
      providerKind: "twitch",
      layers: [{ type: "text", template: "Thanks, {actor.displayName}!" }]
    });
    expect(document.targetProfiles).toEqual([
      expect.objectContaining({ id: "landscape", enabled: true, reviewState: "ready" }),
      expect.objectContaining({ id: "vertical", enabled: false, reviewState: "needs-review" })
    ]);
    expect(document.samplePayloads.map((sample) => sample.id)).toEqual(["normal", "edge"]);
  });

  it("saves one valid profile and updates the compatible alert rule projection", async () => {
    const harness = createHarness();
    const document = await harness.service.getDocument(rule.id);
    const edited: AlertEditorDocument = {
      ...document,
      name: "Follower welcome",
      durationMs: 6_000,
      layers: document.layers.map((layer) =>
        layer.type === "text" ? { ...layer, template: "Welcome, {userName}!" } : layer
      )
    };

    await expect(harness.service.saveDocument(rule.id, edited)).resolves.toEqual(edited);
    expect(harness.documents.save).toHaveBeenCalledWith(edited);
    expect(harness.rules.saveRule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: rule.id,
        name: "Follower welcome",
        variants: [expect.objectContaining({ textTemplate: "Welcome, {userName}!", durationMs: 6_000 })]
      })
    );
    expect(harness.metadata.saveRule).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: rule.id, targetProfileIds: ["landscape"], reviewState: "ready" })
    );
  });

  it("rejects a document without a valid enabled profile", async () => {
    const harness = createHarness();
    const document = await harness.service.getDocument(rule.id);

    await expect(
      harness.service.saveDocument(rule.id, {
        ...document,
        targetProfiles: document.targetProfiles.map((profile) => ({ ...profile, enabled: false }))
      })
    ).rejects.toBeInstanceOf(AlertEditorValidationError);
    expect(harness.documents.save).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before changing live output in an active set", async () => {
    const harness = createHarness(true);
    const document = await harness.service.getDocument(rule.id);
    const edited: AlertEditorDocument = {
      ...document,
      layers: document.layers.map((layer) =>
        layer.type === "text" ? { ...layer, template: "Live change, {userName}!" } : layer
      )
    };

    await expect(harness.service.saveDocument(rule.id, edited)).rejects.toBeInstanceOf(
      AlertEditorLiveImpactConfirmationRequiredError
    );
    expect(harness.documents.save).not.toHaveBeenCalled();

    await expect(harness.service.saveDocument(rule.id, edited, true)).resolves.toEqual(edited);
  });

  it("queues visible layers through playback and blocks disconnected outputs", async () => {
    const harness = createHarness();
    const document = await harness.service.getDocument(rule.id);
    const request: AlertEditorTestRequest = {
      document,
      targetProfileId: "landscape",
      samplePayload: { userName: "James", actor: { displayName: "James" } },
      includeAudio: false,
      includeTts: false
    };

    await expect(harness.service.sendTest(rule.id, request)).resolves.toEqual({
      status: "queued",
      targetProfileId: "landscape",
      referenceId: "ref-test-1",
      test: true
    });
    expect(harness.enqueueTest).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEvent: expect.objectContaining({ id: "ref-test-1", type: "follow", metadata: expect.objectContaining({ test: true }) }),
        alerts: [
          expect.objectContaining({
            overlayInstruction: expect.objectContaining({
              targetProfileId: "landscape",
              text: expect.objectContaining({ text: "Thanks, James!" })
            })
          })
        ]
      })
    );

    harness.hasConnectedOutput.mockResolvedValue(false);
    await expect(harness.service.sendTest(rule.id, request)).rejects.toBeInstanceOf(AlertEditorDeliveryBlockedError);
    expect(harness.enqueueTest).toHaveBeenCalledTimes(1);
  });

  it("uses the stored media type when testing a Video/GIF layer", async () => {
    const harness = createHarness(false, async (assetId) => assetId === "asset-gif" ? "gif" : null);
    const document = await harness.service.getDocument(rule.id);
    const videoLayer = {
      id: "layer-gif",
      name: "Animated image",
      type: "video" as const,
      visible: true,
      order: document.layers.length,
      animation: document.layers[0]!.animation,
      assetId: "asset-gif"
    };
    const candidate: AlertEditorDocument = {
      ...document,
      layers: [...document.layers, videoLayer],
      targetProfiles: document.targetProfiles.map((profile) => profile.id === "landscape"
        ? {
            ...profile,
            layerLayouts: [
              ...profile.layerLayouts,
              { layerId: videoLayer.id, x: 10, y: 20, width: 320, height: 180, zIndex: 1 }
            ]
          }
        : profile)
    };

    await harness.service.sendTest(rule.id, {
      document: candidate,
      targetProfileId: "landscape",
      samplePayload: { userName: "James" },
      includeAudio: false,
      includeTts: false
    });

    expect(harness.enqueueTest).toHaveBeenCalledWith(expect.objectContaining({
      alerts: expect.arrayContaining([
        expect.objectContaining({
          variantId: videoLayer.id,
          overlayInstruction: expect.objectContaining({
            visual: expect.objectContaining({ assetId: "asset-gif", mediaType: "gif" })
          })
        })
      ])
    }));
  });

  it("includes a configured audio layer when test audio is enabled", async () => {
    const harness = createHarness();
    const document = await harness.service.getDocument(rule.id);
    const audioLayer = {
      id: "layer-audio",
      name: "Celebration sound",
      type: "audio" as const,
      visible: true,
      order: document.layers.length,
      animation: document.layers[0]!.animation,
      assetId: "asset-audio",
      volume: 0.65
    };

    await harness.service.sendTest(rule.id, {
      document: { ...document, layers: [...document.layers, audioLayer] },
      targetProfileId: "landscape",
      samplePayload: { userName: "James" },
      includeAudio: true,
      includeTts: true
    });

    expect(harness.enqueueTest).toHaveBeenCalledWith(expect.objectContaining({
      alerts: expect.arrayContaining([
        expect.objectContaining({
          variantId: audioLayer.id,
          overlayInstruction: expect.objectContaining({
            audio: { assetId: "asset-audio", volume: 0.65 }
          })
        })
      ])
    }));
  });

  it("rolls back rule, metadata, and document writes when the final save fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const rules = new SqliteAlertRepository(database.connection);
    const metadata = new SqliteAlertSetMetadataRepository(database.connection);
    const storedDocuments = new SqliteAlertEditorDocumentRepository(database.connection);
    await rules.saveCollection({ id: "set-default", name: "Default", enabled: false });
    await rules.saveRule(rule);
    const options = {
      documents: storedDocuments,
      rules,
      metadata,
      hasConnectedOutput: async () => true,
      enqueueTest: async () => undefined,
      generateId: () => "generated",
      generateReferenceId: () => "reference",
      async saveAtomically(input: Parameters<NonNullable<AlertEditorServiceOptions["saveAtomically"]>>[0]) {
        return runInTransaction(database.connection, () => {
          rules.saveRuleSync(input.rule);
          metadata.saveRuleSync(input.metadata);
          storedDocuments.saveSync(input.document);
          throw new Error("document save failed");
        });
      }
    };
    const service = new AlertEditorService(options);
    const document = await service.getDocument(rule.id);

    await expect(service.saveDocument(rule.id, { ...document, name: "Partially saved" })).rejects.toThrow(
      "document save failed"
    );

    await expect(rules.findRuleById(rule.id)).resolves.toEqual(rule);
    await expect(metadata.findRule(rule.id)).resolves.toBeNull();
    await expect(storedDocuments.find(rule.id)).resolves.toBeNull();
  });
});

function createHarness(
  activeSet = false,
  findAssetMediaType?: (assetId: string) => Promise<"image" | "gif" | "video" | "audio" | null>
) {
  const documents: AlertEditorDocumentRepository & { save: ReturnType<typeof vi.fn> } = {
    find: vi.fn(async () => null),
    save: vi.fn(async (document: AlertEditorDocument) => document)
  };
  const rules = {
    findRuleById: vi.fn(async () => rule),
    listCollections: vi.fn(async () => [{ id: "set-default", name: "Default", enabled: activeSet }]),
    saveRule: vi.fn(async (savedRule: AlertRule) => savedRule)
  };
  const metadata = {
    findRule: vi.fn(async () => null),
    saveRule: vi.fn(async (value: AlertRuleManagementMetadata) => value)
  };
  const hasConnectedOutput = vi.fn(async () => true);
  const enqueueTest = vi.fn(async () => undefined);
  let nextId = 0;
  const service = new AlertEditorService({
    documents,
    rules,
    metadata,
    hasConnectedOutput,
    enqueueTest,
    ...(findAssetMediaType === undefined ? {} : { findAssetMediaType }),
    generateId: () => `generated-${++nextId}`,
    generateReferenceId: () => "ref-test-1",
    now: () => new Date("2026-07-15T12:00:00.000Z")
  });
  return { service, documents, rules, metadata, hasConnectedOutput, enqueueTest };
}
