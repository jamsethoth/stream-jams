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

  it("creates and persists alert TTS configuration from an editor layer", async () => {
    const harness = createHarness();
    const document = await harness.service.getDocument(rule.id);
    const edited: AlertEditorDocument = {
      ...document,
      layers: [
        ...document.layers,
        {
          id: "layer-speakerbot",
          name: "Text to speech",
          type: "tts",
          visible: true,
          order: document.layers.length,
          animation: document.layers[0]!.animation,
          enabled: true,
          providerId: "speakerbot",
          template: "Welcome {userName}"
        }
      ]
    };

    await harness.service.saveDocument(rule.id, edited);

    expect(harness.rules.saveRule).toHaveBeenCalledWith(expect.objectContaining({
      variants: [expect.objectContaining({
        ttsConfig: {
          enabled: true,
          providerId: "speakerbot",
          voiceId: null,
          template: "Welcome {userName}",
          minimumAmount: null
        }
      })]
    }));
  });

  it("loads defaults and variations as separate hydrated editor documents", async () => {
    const variationRule: AlertRule = {
      ...rule,
      conditions: [{ field: "ingestProvider", operator: "equals", value: "twitch" }],
      cooldownSeconds: 15,
      priority: 10,
      variants: [
        { ...rule.variants[0]!, weight: 2, priority: 1 },
        {
          ...rule.variants[0]!,
          id: "variant-vip",
          name: "VIP follower",
          enabled: false,
          weight: 4,
          priority: 20,
          conditions: [{ field: "metadata.vip", operator: "equals", value: true }],
          textTemplate: "Welcome back, {actor.displayName}!"
        }
      ]
    };
    const harness = createHarnessWithRule(variationRule);

    await expect(harness.service.getDocument(variationRule.id)).resolves.toMatchObject({
      id: variationRule.id,
      parentAlertId: null,
      kind: "default",
      name: variationRule.name,
      conditions: variationRule.conditions,
      variantConditions: [],
      weight: 2,
      priority: 1,
      cooldownSeconds: 15,
      rulePriority: 10
    });
    await expect(harness.service.getDocument("variant-vip")).resolves.toMatchObject({
      id: "variant-vip",
      parentAlertId: variationRule.id,
      kind: "variation",
      name: "VIP follower",
      enabled: false,
      conditions: variationRule.conditions,
      variantConditions: [{ field: "metadata.vip", operator: "equals", value: true }],
      weight: 4,
      priority: 20,
      cooldownSeconds: 15,
      rulePriority: 10,
      layers: [{ type: "text", template: "Welcome back, {actor.displayName}!" }]
    });
  });

  it("hydrates stored documents from current rule and variation controls", async () => {
    const variationRule: AlertRule = {
      ...rule,
      name: "Current rule name",
      cooldownSeconds: 45,
      priority: 12,
      variants: [{ ...rule.variants[0]!, name: "Current default", weight: 3, priority: 7 }]
    };
    const generated = await createHarnessWithRule(variationRule).service.getDocument(variationRule.id);
    const stored = {
      ...generated,
      name: "Stale name",
      weight: 1,
      priority: null,
      cooldownSeconds: 0,
      rulePriority: 0,
      layers: generated.layers.map((layer) => layer.type === "text" ? { ...layer, template: "Stored design" } : layer)
    } satisfies AlertEditorDocument;
    const harness = createHarnessWithRule(variationRule, stored);

    await expect(harness.service.getDocument(variationRule.id)).resolves.toMatchObject({
      name: "Current rule name",
      weight: 3,
      priority: 7,
      cooldownSeconds: 45,
      rulePriority: 12,
      layers: [{ type: "text", template: "Stored design" }]
    });
  });

  it("saves only the selected variation and keeps metadata keyed by its rule", async () => {
    const variationRule: AlertRule = {
      ...rule,
      variants: [
        rule.variants[0]!,
        { ...rule.variants[0]!, id: "variant-vip", name: "VIP", textTemplate: "VIP original" }
      ]
    };
    const harness = createHarnessWithRule(variationRule);
    const document = await harness.service.getDocument("variant-vip");
    const edited: AlertEditorDocument = {
      ...document,
      name: "VIP updated",
      variantConditions: [{ field: "metadata.vip", operator: "equals", value: true }],
      weight: 5,
      priority: 30,
      layers: document.layers.map((layer) => layer.type === "text" ? { ...layer, template: "VIP updated text" } : layer)
    };

    await harness.service.saveDocument("variant-vip", edited);

    expect(harness.rules.saveRule).toHaveBeenCalledWith(expect.objectContaining({
      id: variationRule.id,
      variants: [
        variationRule.variants[0],
        expect.objectContaining({
          id: "variant-vip",
          name: "VIP updated",
          conditions: edited.variantConditions,
          weight: 5,
          priority: 30,
          textTemplate: "VIP updated text"
        })
      ]
    }));
    expect(harness.metadata.saveRule).toHaveBeenCalledWith(expect.objectContaining({ ruleId: variationRule.id }));
  });

  it("uses the parent rule and selected variation identities for variation tests", async () => {
    const variationRule: AlertRule = {
      ...rule,
      variants: [
        rule.variants[0]!,
        { ...rule.variants[0]!, id: "variant-vip", name: "VIP" }
      ]
    };
    const harness = createHarnessWithRule(variationRule);
    const document = await harness.service.getDocument("variant-vip");

    await harness.service.sendTest(document.id, {
      document,
      targetProfileId: "landscape",
      samplePayload: { userName: "James" },
      includeAudio: true,
      includeTts: true
    });

    expect(harness.enqueueTest).toHaveBeenCalledWith(expect.objectContaining({
      alerts: expect.arrayContaining([
        expect.objectContaining({ ruleId: variationRule.id, variantId: "variant-vip" })
      ])
    }));
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
          variantId: rule.id,
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
          variantId: rule.id,
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
    save: vi.fn(async (document: AlertEditorDocument) => document),
    delete: vi.fn(async () => undefined)
  };
  const rules = {
    findRuleById: vi.fn(async () => rule),
    listRules: vi.fn(async () => [rule]),
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

function createHarnessWithRule(ruleFixture: AlertRule, storedDocument: AlertEditorDocument | null = null) {
  const documents: AlertEditorDocumentRepository & { save: ReturnType<typeof vi.fn> } = {
    find: vi.fn(async (editorId: string) => editorId === storedDocument?.id ? storedDocument : null),
    save: vi.fn(async (document: AlertEditorDocument) => document),
    delete: vi.fn(async () => undefined)
  };
  const rules = {
    findRuleById: vi.fn(async (ruleId: string) => ruleId === ruleFixture.id ? ruleFixture : null),
    listRules: vi.fn(async () => [ruleFixture]),
    listCollections: vi.fn(async () => [{ id: "set-default", name: "Default", enabled: false }]),
    saveRule: vi.fn(async (savedRule: AlertRule) => savedRule)
  };
  const metadata = {
    findRule: vi.fn(async () => null),
    saveRule: vi.fn(async (value: AlertRuleManagementMetadata) => value)
  };
  const enqueueTest = vi.fn(async () => undefined);
  const service = new AlertEditorService({
    documents,
    rules,
    metadata,
    hasConnectedOutput: async () => true,
    enqueueTest,
    generateId: () => "generated",
    generateReferenceId: () => "reference"
  });
  return { service, documents, rules, metadata, enqueueTest };
}
