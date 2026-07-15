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
  type AlertEditorDocumentRepository
} from "./alert-editor-service.js";
import type { AlertRuleManagementMetadata } from "./alert-set-management-service.js";

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
});

function createHarness(activeSet = false) {
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
    generateId: () => `generated-${++nextId}`,
    generateReferenceId: () => "ref-test-1",
    now: () => new Date("2026-07-15T12:00:00.000Z")
  });
  return { service, documents, rules, metadata, hasConnectedOutput, enqueueTest };
}
