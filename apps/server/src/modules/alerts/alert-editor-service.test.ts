import { describe, expect, it, vi } from "vitest";
import {
  normalizedStreamEventSchema,
  streamEventTypes,
  validateAlertSamplePayload,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  DefaultModerationService,
  AlertEditorDocument,
  AlertRule,
  AlertEditorTestRequest
} from "@stream-jams/core";
import {
  AlertEditorDeliveryBlockedError,
  AlertEditorLiveImpactConfirmationRequiredError,
  AlertEditorNotFoundError,
  AlertEditorService,
  AlertEditorValidationError,
  createAlertEditorDocumentFromRule,
  type AlertEditorDocumentRepository,
  type AlertEditorTestPlayback,
  type AlertEditorServiceOptions
} from "./alert-editor-service.js";
import type { AlertRuleManagementMetadata } from "./alert-set-management-service.js";
import { SqliteAlertRepository } from "./sqlite-alert-repository.js";
import { SqliteAlertEditorDocumentRepository } from "./sqlite-alert-editor-document-repository.js";
import { SqliteAlertSetMetadataRepository } from "./sqlite-alert-set-metadata-repository.js";
import { SqliteAlertAggregateMutationStore } from "./sqlite-alert-aggregate-mutation-store.js";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";

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
  it("rejects construction without the required aggregate save dependency", () => {
    const options = {
      documents: {
        find: async () => null,
        findMany: async () => new Map(),
        save: async (document: AlertEditorDocument) => document,
        delete: async () => undefined
      },
      rules: {
        findRuleById: async () => null,
        listRules: async () => [],
        listCollections: async () => [],
        saveRule: async (savedRule: AlertRule) => savedRule
      },
      metadata: {
        findRule: async () => null,
        saveRule: async (savedMetadata: AlertRuleManagementMetadata) => savedMetadata
      },
      hasConnectedOutput: async () => false,
      enqueueTest: async () => undefined,
      generateId: () => "generated",
      generateReferenceId: () => "reference"
    } as unknown as AlertEditorServiceOptions;

    expect(() => new AlertEditorService(options)).toThrow("requires an atomic aggregate save dependency");
  });

  it("projects stable sibling authoring context from default and variation route IDs", async () => {
    const variationRule: AlertRule = {
      ...rule,
      conditions: [{ field: "actor.displayName", operator: "includes", value: "VIP" }],
      variants: [
        { ...rule.variants[0]!, id: "variant-default", weight: 2, priority: 4 },
        {
          ...rule.variants[0]!,
          id: "variant-disabled",
          name: "Disabled VIP",
          enabled: false,
          conditions: [{ field: "actor.displayName", operator: "equals", value: "James" }],
          weight: 3,
          priority: 9
        },
        {
          ...rule.variants[0]!,
          id: "variant-weighted",
          name: "Weighted VIP",
          conditions: [{ field: "actor.displayName", operator: "includes", value: "Jam" }],
          weight: 7
        }
      ]
    };
    const harness = createHarnessWithRule(variationRule);
    const expected = {
      ruleId: variationRule.id,
      eventType: "follow",
      candidates: [
        {
          editorId: variationRule.id,
          variantId: "variant-default",
          kind: "default",
          name: variationRule.name,
          enabled: true,
          conditions: [],
          weight: 2,
          priority: 4
        },
        {
          editorId: "variant-disabled",
          variantId: "variant-disabled",
          kind: "variation",
          name: "Disabled VIP",
          enabled: false,
          conditions: [{ field: "actor.displayName", operator: "equals", value: "James" }],
          weight: 3,
          priority: 9
        },
        {
          editorId: "variant-weighted",
          variantId: "variant-weighted",
          kind: "variation",
          name: "Weighted VIP",
          enabled: true,
          conditions: [{ field: "actor.displayName", operator: "includes", value: "Jam" }],
          weight: 7,
          priority: null
        }
      ]
    } as const;

    await expect(harness.service.getVariationContext(variationRule.id)).resolves.toEqual(expected);
    await expect(harness.service.getVariationContext("variant-weighted")).resolves.toEqual(expected);
  });

  it("rejects variation context requests for an unknown editor ID", async () => {
    const harness = createHarnessWithRule(rule);

    await expect(harness.service.getVariationContext("missing-alert")).rejects.toEqual(
      new AlertEditorNotFoundError("missing-alert")
    );
  });

  it("creates a deterministic editor document for a legacy alert", async () => {
    const harness = createHarness();

    const document = await harness.service.getDocument(rule.id);

    expect(document).toMatchObject({
      id: rule.id,
      setId: "set-default",
      eventType: "follow",
      providerKind: "twitch",
      layers: [{
        type: "text",
        template: "Thanks, {actor.displayName}!",
        textStyle: compatibilityAlertTextStyle,
        boxStyle: compatibilityAlertTextBoxStyle
      }]
    });
    expect(document.targetProfiles).toEqual([
      expect.objectContaining({ id: "landscape", enabled: true, reviewState: "ready" }),
      expect.objectContaining({ id: "vertical", enabled: false, reviewState: "needs-review" })
    ]);
    expect(document.samplePayloads.map((sample) => sample.id)).toEqual(["normal", "edge"]);
  });

  it("builds valid normal and edge test events for every canonical event type", async () => {
    for (const eventType of streamEventTypes) {
      const eventRule: AlertRule = { ...rule, id: `alert-${eventType}`, eventType };
      const harness = createHarnessWithRule(eventRule);
      const document = await harness.service.getDocument(eventRule.id);

      expect(document.samplePayloads.map((sample) => sample.id)).toEqual(["normal", "edge"]);
      for (const sample of document.samplePayloads) {
        expect(validateAlertSamplePayload(eventType, sample.payload)).toBeNull();
        if (eventType === "gift_subscription") {
          expect(sample.payload).toEqual(expect.objectContaining({
            actor: sample.payload.recipient,
            gifter: sample.payload.gifter
          }));
        }
        await harness.service.sendTest(document.id, {
          document,
          targetProfileId: "landscape",
          samplePayload: eventType === "gift_subscription"
            ? { ...sample.payload, actor: { id: "incorrect-actor", displayName: "Incorrect actor" } }
            : sample.payload,
          includeAudio: false,
          includeTts: false
        });
        const request = harness.enqueueTest.mock.calls.at(-1) as unknown as readonly [{ readonly sourceEvent: unknown }] | undefined;
        const sourceEvent = request?.[0].sourceEvent;
        expect(sourceEvent).toMatchObject({
          id: "reference",
          occurredAt: "2026-07-15T12:00:00.000Z",
          type: eventType
        });
        if (eventType === "gift_subscription") {
          expect(sourceEvent).toEqual(expect.objectContaining({
            actor: sample.payload.recipient,
            recipient: sample.payload.recipient,
            gifter: sample.payload.gifter
          }));
        }
        expect(normalizedStreamEventSchema.safeParse(sourceEvent).success).toBe(true);
      }
    }
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
      variantConditions: [{ field: "ingestProvider", operator: "equals", value: "twitch" }],
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
          priority: undefined,
          textTemplate: "VIP updated text"
        })
      ]
    }));
    expect(harness.metadata.saveRule).toHaveBeenCalledWith(expect.objectContaining({ ruleId: variationRule.id }));
  });

  it("saves one complete sibling priority assignment set and hydrates the selected document priority", async () => {
    const variationRule = createPriorityRule();
    const harness = createAtomicHarness(variationRule);
    const document = await harness.service.getDocument("variant-high");

    await expect(harness.service.saveDocument("variant-high", document, false, [
      { variationId: "variant-high", priority: 6 },
      { variationId: "variant-low", priority: 7 }
    ])).resolves.toMatchObject({ id: "variant-high", priority: 6 });

    expect(harness.saveAtomically).toHaveBeenCalledOnce();
    expect(harness.saveAtomically.mock.calls[0]![0]).toMatchObject({
      document: { id: "variant-high", priority: 6 },
      rule: {
        variants: [
          { id: "variant-default", priority: 5 },
          { id: "variant-high", priority: 6 },
          { id: "variant-low", priority: 7 }
        ]
      }
    });
  });

  it("lets sibling variations join one normalized priority group", async () => {
    const variationRule = createPriorityRule();
    const harness = createAtomicHarness(variationRule);
    const document = await harness.service.getDocument("variant-low");

    await harness.service.saveDocument("variant-low", document, false, [
      { variationId: "variant-high", priority: 6 },
      { variationId: "variant-low", priority: 6 }
    ]);

    expect(harness.saveAtomically.mock.calls[0]![0].rule.variants).toMatchObject([
      { id: "variant-default", priority: 5 },
      { id: "variant-high", priority: 6 },
      { id: "variant-low", priority: 6 }
    ]);
  });

  it("preserves every stored priority when assignments are empty", async () => {
    const variationRule = createPriorityRule();
    const harness = createAtomicHarness(variationRule);
    const document = await harness.service.getDocument("variant-high");

    await expect(harness.service.saveDocument(
      "variant-high",
      { ...document, priority: 99 },
      false,
      []
    )).resolves.toMatchObject({ priority: 7 });

    expect(harness.saveAtomically.mock.calls[0]![0]).toMatchObject({
      document: { priority: 7 },
      rule: {
        variants: [
          { id: "variant-default", priority: 5 },
          { id: "variant-high", priority: 7 },
          { id: "variant-low", priority: 6 }
        ]
      }
    });
  });

  it("requires live-impact confirmation when only sibling priorities change in an active set", async () => {
    const variationRule = createPriorityRule();
    const harness = createAtomicHarness(variationRule, true);
    const document = await harness.service.getDocument(variationRule.id);
    const assignments = [
      { variationId: "variant-high", priority: 6 },
      { variationId: "variant-low", priority: 7 }
    ];

    await expect(harness.service.saveDocument(variationRule.id, document, false, assignments)).rejects.toEqual(
      new AlertEditorLiveImpactConfirmationRequiredError(["landscape"])
    );
    expect(harness.saveAtomically).not.toHaveBeenCalled();

    await expect(harness.service.saveDocument(variationRule.id, document, true, assignments)).resolves.toMatchObject({
      id: variationRule.id,
      priority: 5
    });
    expect(harness.saveAtomically).toHaveBeenCalledOnce();
  });

  it.each([
    ["conditions", (document: AlertEditorDocument): AlertEditorDocument => ({
      ...document,
      conditions: [{ field: "ingestProvider", operator: "equals", value: "twitch" }]
    })],
    ["cooldown", (document: AlertEditorDocument): AlertEditorDocument => ({
      ...document,
      cooldownSeconds: 15
    })],
    ["rule priority", (document: AlertEditorDocument): AlertEditorDocument => ({
      ...document,
      rulePriority: 3
    })]
  ] as const)("requires live-impact confirmation when a disabled variation changes shared %s", async (_label, edit) => {
    const priorityRule = createPriorityRule();
    const variationRule: AlertRule = {
      ...priorityRule,
      variants: priorityRule.variants.map((variant) =>
        variant.id === "variant-low" ? { ...variant, enabled: false } : variant
      )
    };
    const harness = createAtomicHarness(variationRule, true);
    const document = await harness.service.getDocument("variant-low");

    await expect(harness.service.saveDocument("variant-low", edit(document))).rejects.toEqual(
      new AlertEditorLiveImpactConfirmationRequiredError(["landscape"])
    );
    expect(harness.saveAtomically).not.toHaveBeenCalled();
  });

  it("rejects an event type that does not belong to the selected alert before mutation", async () => {
    const variationRule = createPriorityRule();
    const harness = createAtomicHarness(variationRule);
    const document = await harness.service.getDocument("variant-high");

    await expect(harness.service.saveDocument("variant-high", {
      ...document,
      eventType: "raid",
      conditions: [{ field: "raidViewers", operator: "min", value: 25 }]
    })).rejects.toThrow("event type does not match the selected alert");

    expect(harness.saveAtomically).not.toHaveBeenCalled();
    expect(harness.rules.saveRule).not.toHaveBeenCalled();
    expect(harness.metadata.saveRule).not.toHaveBeenCalled();
    expect(harness.documents.save).not.toHaveBeenCalled();
  });

  it.each([
    ["default rule ID", [{ variationId: "alert-priority", priority: 6 }, { variationId: "variant-low", priority: 7 }]],
    ["default variant ID", [{ variationId: "variant-default", priority: 6 }, { variationId: "variant-low", priority: 7 }]],
    ["unknown ID", [{ variationId: "variant-high", priority: 6 }, { variationId: "variant-unknown", priority: 7 }]],
    ["duplicate ID", [{ variationId: "variant-high", priority: 6 }, { variationId: "variant-high", priority: 7 }]],
    ["missing sibling", [{ variationId: "variant-high", priority: 6 }]],
    ["non-integer priority", [{ variationId: "variant-high", priority: 6.5 }, { variationId: "variant-low", priority: 7 }]],
    ["priority equal to default", [{ variationId: "variant-high", priority: 5 }, { variationId: "variant-low", priority: 6 }]],
    ["priority below default", [{ variationId: "variant-high", priority: 4 }, { variationId: "variant-low", priority: 6 }]],
    ["non-contiguous groups", [{ variationId: "variant-high", priority: 6 }, { variationId: "variant-low", priority: 8 }]]
  ] as const)("rejects an invalid sibling assignment set containing a %s before mutation", async (_label, assignments) => {
    const variationRule = createPriorityRule();
    const harness = createAtomicHarness(variationRule);
    const document = await harness.service.getDocument("variant-high");

    await expect(harness.service.saveDocument("variant-high", document, false, assignments)).rejects.toBeInstanceOf(
      AlertEditorValidationError
    );
    expect(harness.saveAtomically).not.toHaveBeenCalled();
    expect(harness.rules.saveRule).not.toHaveBeenCalled();
    expect(harness.metadata.saveRule).not.toHaveBeenCalled();
    expect(harness.documents.save).not.toHaveBeenCalled();
  });

  it("saves valid catalog conditions and preserves or removes unchanged unsupported saved conditions", async () => {
    const conditionRule = createConditionRule();
    const preservedHarness = createAtomicHarness(conditionRule);
    const preserved = await preservedHarness.service.getDocument("variant-special");

    await expect(preservedHarness.service.saveDocument("variant-special", {
      ...preserved,
      conditions: [
        ...preserved.conditions,
        { field: "cheerAmount", operator: "range", value: [100, 500] }
      ],
      variantConditions: [
        ...preserved.variantConditions,
        { field: "ingestProvider", operator: "equals", value: "twitch" }
      ]
    })).resolves.toMatchObject({
      conditions: [
        conditionRule.conditions[0],
        { field: "cheerAmount", operator: "range", value: [100, 500] }
      ],
      variantConditions: [
        conditionRule.variants[1]!.conditions![0],
        { field: "ingestProvider", operator: "equals", value: "twitch" }
      ]
    });
    expect(preservedHarness.saveAtomically.mock.calls[0]![0].rule).toMatchObject({
      conditions: [
        conditionRule.conditions[0],
        { field: "cheerAmount", operator: "range", value: [100, 500] }
      ],
      variants: [
        expect.anything(),
        expect.objectContaining({
          conditions: [
            conditionRule.variants[1]!.conditions![0],
            { field: "ingestProvider", operator: "equals", value: "twitch" }
          ]
        })
      ]
    });

    const removalHarness = createAtomicHarness(conditionRule);
    const removal = await removalHarness.service.getDocument("variant-special");
    await expect(removalHarness.service.saveDocument("variant-special", {
      ...removal,
      conditions: [],
      variantConditions: []
    })).resolves.toMatchObject({ conditions: [], variantConditions: [] });
  });

  it.each([
    ["reversed rule range", "rule", [{ field: "cheerAmount", operator: "range", value: [500, 100] }]],
    ["invalid variation range", "variation", [{ field: "cheerAmount", operator: "range", value: [0, 100] }]],
    ["new unsupported rule condition", "rule", [{ field: "metadata.new", operator: "equals", value: true }]],
    ["modified unsupported rule condition", "rule", [{ field: "metadata.saved", operator: "equals", value: false }]],
    ["duplicated unsupported rule condition", "rule", [
      { field: "metadata.saved", operator: "equals", value: true },
      { field: "metadata.saved", operator: "equals", value: true }
    ]],
    ["new unsupported variation condition", "variation", [{ field: "metadata.new", operator: "equals", value: true }]],
    ["modified unsupported variation condition", "variation", [{ field: "metadata.variant", operator: "equals", value: false }]],
    ["duplicated unsupported variation condition", "variation", [
      { field: "metadata.variant", operator: "equals", value: true },
      { field: "metadata.variant", operator: "equals", value: true }
    ]]
  ] as const)("rejects %s before any persistence mutation", async (_label, scope, conditions) => {
    const conditionRule = createConditionRule();
    const harness = createAtomicHarness(conditionRule);
    const document = await harness.service.getDocument("variant-special");
    const candidate = scope === "rule"
      ? { ...document, conditions }
      : { ...document, variantConditions: conditions };

    await expect(harness.service.saveDocument("variant-special", candidate as unknown as AlertEditorDocument)).rejects.toBeInstanceOf(
      AlertEditorValidationError
    );
    expect(harness.saveAtomically).not.toHaveBeenCalled();
    expect(harness.rules.saveRule).not.toHaveBeenCalled();
    expect(harness.metadata.saveRule).not.toHaveBeenCalled();
    expect(harness.documents.save).not.toHaveBeenCalled();
  });

  it("rejects a known catalog field with an invalid enum value before mutation", async () => {
    const subscriptionRule: AlertRule = { ...createConditionRule(), eventType: "subscription" };
    const harness = createAtomicHarness(subscriptionRule);
    const document = await harness.service.getDocument("variant-special");

    await expect(harness.service.saveDocument("variant-special", {
      ...document,
      conditions: [{ field: "tier", operator: "equals", value: "4000" }]
    })).rejects.toBeInstanceOf(AlertEditorValidationError);
    expect(harness.saveAtomically).not.toHaveBeenCalled();
  });

  it.each(["rule", "variation"] as const)(
    "does not grandfather a formerly supported %s condition after the event type changes",
    async (scope) => {
      const savedRule: AlertRule = {
        ...createConditionRule(),
        eventType: "cheer",
        conditions: [{ field: "cheerAmount", operator: "min", value: 100 }],
        variants: createConditionRule().variants.map((variant, index) => index === 1
          ? { ...variant, conditions: [{ field: "cheerAmount", operator: "min", value: 200 }] }
          : variant)
      };
      const harness = createAtomicHarness(savedRule);
      const document = await harness.service.getDocument("variant-special");
      const candidate = {
        ...document,
        eventType: "follow" as const,
        ...(scope === "rule" ? { variantConditions: [] } : { conditions: [] })
      };

      await expect(harness.service.saveDocument("variant-special", candidate)).rejects.toBeInstanceOf(
        AlertEditorValidationError
      );
      expect(harness.saveAtomically).not.toHaveBeenCalled();
    }
  );

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

  it("rejects a document when every enabled profile still needs review", async () => {
    const generated = await createHarness().service.getDocument(rule.id);
    const stored: AlertEditorDocument = {
      ...generated,
      targetProfiles: generated.targetProfiles.map((profile) => ({
        ...profile,
        enabled: true,
        reviewState: "needs-review"
      }))
    };
    const harness = createHarnessWithRule(rule, stored);

    await expect(
      harness.service.saveDocument(rule.id, { ...stored, name: "Still needs review" })
    ).rejects.toThrow("Finish reviewing at least one enabled target profile before saving.");
    expect(harness.documents.save).not.toHaveBeenCalled();
  });

  it("saves one reviewed profile while another already-enabled profile still needs review", async () => {
    const generated = await createHarness().service.getDocument(rule.id);
    const stored: AlertEditorDocument = {
      ...generated,
      targetProfiles: generated.targetProfiles.map((profile) => ({
        ...profile,
        enabled: true,
        reviewState: "needs-review"
      }))
    };
    const harness = createHarnessWithRule(rule, stored);
    const current = await harness.service.getDocument(rule.id);
    const partiallyReviewed: AlertEditorDocument = {
      ...current,
      targetProfiles: current.targetProfiles.map((profile) => profile.id === "landscape"
        ? { ...profile, reviewState: "ready" }
        : profile)
    };

    await expect(harness.service.saveDocument(rule.id, partiallyReviewed)).resolves.toEqual(partiallyReviewed);
    expect(harness.documents.save).toHaveBeenCalledWith(partiallyReviewed);
    expect(harness.metadata.saveRule).toHaveBeenCalledWith(expect.objectContaining({
      reviewState: "needs-review",
      targetProfileIds: ["landscape", "vertical"]
    }));
  });

  it("still rejects newly enabling a profile that needs review", async () => {
    const harness = createHarness();
    const document = await harness.service.getDocument(rule.id);
    const invalid: AlertEditorDocument = {
      ...document,
      targetProfiles: document.targetProfiles.map((profile) => profile.id === "vertical"
        ? { ...profile, enabled: true }
        : profile)
    };

    await expect(harness.service.saveDocument(rule.id, invalid)).rejects.toThrow(
      "Finish reviewing the vertical profile before enabling it."
    );
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
              text: expect.objectContaining({
                text: "Thanks, James!",
                textStyle: compatibilityAlertTextStyle,
                boxStyle: compatibilityAlertTextBoxStyle
              })
            })
          })
        ]
      })
    );

    harness.hasConnectedOutput.mockResolvedValue(false);
    await expect(harness.service.sendTest(rule.id, request)).rejects.toBeInstanceOf(AlertEditorDeliveryBlockedError);
    expect(harness.enqueueTest).toHaveBeenCalledTimes(1);
  });

  it("sanitizes editor test rendered and TTS layers independently without changing presentation metadata", async () => {
    const moderationService = new DefaultModerationService({
      settings: {
        renderedText: { maxLength: 26, blockedTerms: ["badword"], stripUrls: true },
        ttsText: { maxLength: 15, blockedTerms: ["badword"], stripUrls: true }
      }
    });
    const variationRule: AlertRule = {
      ...rule,
      variants: [
        rule.variants[0]!,
        { ...rule.variants[0]!, id: "variant-moderated", name: "Moderated variation" }
      ]
    };
    const harness = createHarnessWithRule(variationRule, null, moderationService);
    const document = await harness.service.getDocument("variant-moderated");
    const textLayer = document.layers.find((layer) => layer.type === "text")!;
    const candidate: AlertEditorDocument = {
      ...document,
      layers: [
        { ...textLayer, template: "{actor.displayName}" },
        {
          id: "layer-tts",
          name: "Text to speech",
          type: "tts",
          visible: true,
          order: textLayer.order + 1,
          animation: textLayer.animation,
          enabled: true,
          providerId: "speakerbot",
          template: "Speak {actor.displayName}"
        }
      ]
    };
    const raw = "badword https://example.test/secret ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    await harness.service.sendTest(document.id, {
      document: candidate,
      targetProfileId: "landscape",
      samplePayload: { actor: { id: "viewer-1", displayName: raw }, userName: raw },
      includeAudio: false,
      includeTts: true
    });

    const playback = harness.enqueueTest.mock.calls[0]?.[0] as AlertEditorTestPlayback | undefined;
    expect(playback).toBeDefined();
    const alerts = playback!.alerts;
    expect(alerts).toEqual([
      expect.objectContaining({
        ruleId: variationRule.id,
        variantId: "variant-moderated",
        overlayInstruction: expect.objectContaining({
          targetProfileId: "landscape",
          durationMs: candidate.durationMs,
          animation: textLayer.animation,
          text: expect.objectContaining({
            text: "[moderated] [link removed]",
            textStyle: textLayer.textStyle,
            boxStyle: textLayer.boxStyle
          })
        })
      }),
      expect.objectContaining({
        ruleId: variationRule.id,
        variantId: "variant-moderated",
        overlayInstruction: expect.objectContaining({
          targetProfileId: "landscape",
          durationMs: candidate.durationMs,
          tts: expect.objectContaining({ text: "Speak [moderate" })
        })
      })
    ]);
    expect(JSON.stringify(alerts)).not.toContain("badword");
    expect(JSON.stringify(alerts)).not.toContain("example.test");
    expect(JSON.stringify(alerts)).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  });

  it("renders approved event aliases through the same normalized context used by live playback", async () => {
    const communityRule: AlertRule = {
      ...rule,
      id: "alert-community-gift",
      eventType: "community_gift"
    };
    const harness = createHarnessWithRule(communityRule);
    const document = await harness.service.getDocument(communityRule.id);
    const candidate: AlertEditorDocument = {
      ...document,
      layers: document.layers.map((layer) => layer.type === "text"
        ? { ...layer, template: "{gifterName} gifted {giftCount}; {cumulativeGifts} total." }
        : layer)
    };

    await harness.service.sendTest(communityRule.id, {
      document: candidate,
      targetProfileId: "landscape",
      samplePayload: {
        actor: { id: "gifter-1", displayName: "Generous viewer" },
        amount: 5,
        tier: "1000",
        cumulativeTotal: 42
      },
      includeAudio: false,
      includeTts: false
    });

    expect(harness.enqueueTest).toHaveBeenCalledWith(expect.objectContaining({
      alerts: expect.arrayContaining([
        expect.objectContaining({
          overlayInstruction: expect.objectContaining({
            text: expect.objectContaining({ text: "Generous viewer gifted 5; 42 total." })
          })
        })
      ])
    }));
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
    const mutations = new SqliteAlertAggregateMutationStore(
      database.connection,
      rules,
      metadata,
      storedDocuments
    );
    await rules.saveCollection({ id: "set-default", name: "Default", enabled: false });
    await rules.saveRule(rule);
    const options = {
      documents: storedDocuments,
      rules,
      metadata,
      hasConnectedOutput: async () => true,
      enqueueTest: async () => undefined,
      moderationService: new DefaultModerationService(),
      generateId: () => "generated",
      generateReferenceId: () => "reference",
      saveAtomically(input: Parameters<NonNullable<AlertEditorServiceOptions["saveAtomically"]>>[0]) {
        mutations.commit({
          expectedRules: [input.expectedRule],
          saveRules: [input.rule],
          saveRuleMetadata: [input.metadata],
          saveDocuments: [input.document, { ...input.document, id: "missing-parent", parentAlertId: "missing" }]
        });
        return Promise.resolve(input.document);
      }
    };
    const service = new AlertEditorService(options);
    const document = await service.getDocument(rule.id);

    await expect(service.saveDocument(rule.id, { ...document, name: "Partially saved" })).rejects.toThrow(
      "alert editor document owner must be an alert rule or alert variant"
    );

    await expect(rules.findRuleById(rule.id)).resolves.toEqual(rule);
    await expect(metadata.findRule(rule.id)).resolves.toBeNull();
    await expect(storedDocuments.find(rule.id)).resolves.toBeNull();
  });
});

function createHarness(
  activeSet = false,
  findAssetMediaType?: (assetId: string) => Promise<"image" | "gif" | "video" | "audio" | null>,
  moderationService = new DefaultModerationService()
) {
  const documents: AlertEditorDocumentRepository & { save: ReturnType<typeof vi.fn> } = {
    find: vi.fn(async () => null),
    findMany: vi.fn(async () => new Map()),
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
  const enqueueTest = vi.fn(async (_playback: AlertEditorTestPlayback) => undefined);
  let nextId = 0;
  const service = new AlertEditorService({
    documents,
    rules,
    metadata,
    hasConnectedOutput,
    enqueueTest,
    moderationService,
    ...(findAssetMediaType === undefined ? {} : { findAssetMediaType }),
    generateId: () => `generated-${++nextId}`,
    generateReferenceId: () => "ref-test-1",
    async saveAtomically(input) {
      await rules.saveRule(input.rule);
      await metadata.saveRule(input.metadata);
      return documents.save(input.document);
    },
    now: () => new Date("2026-07-15T12:00:00.000Z")
  });
  return { service, documents, rules, metadata, hasConnectedOutput, enqueueTest };
}

function createHarnessWithRule(
  ruleFixture: AlertRule,
  storedDocument: AlertEditorDocument | null = null,
  moderationService = new DefaultModerationService()
) {
  const documents: AlertEditorDocumentRepository & { save: ReturnType<typeof vi.fn> } = {
    find: vi.fn(async (editorId: string) => editorId === storedDocument?.id ? storedDocument : null),
    findMany: vi.fn(async (editorIds: readonly string[]) =>
      storedDocument !== null && editorIds.includes(storedDocument.id)
        ? new Map([[storedDocument.id, storedDocument]])
        : new Map()
    ),
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
  const enqueueTest = vi.fn(async (_playback: AlertEditorTestPlayback) => undefined);
  const service = new AlertEditorService({
    documents,
    rules,
    metadata,
    hasConnectedOutput: async () => true,
    enqueueTest,
    moderationService,
    generateId: () => "generated",
    generateReferenceId: () => "reference",
    async saveAtomically(input) {
      await rules.saveRule(input.rule);
      await metadata.saveRule(input.metadata);
      return documents.save(input.document);
    },
    now: () => new Date("2026-07-15T12:00:00.000Z")
  });
  return { service, documents, rules, metadata, enqueueTest };
}

function createPriorityRule(): AlertRule {
  return {
    ...rule,
    id: "alert-priority",
    variants: [
      { ...rule.variants[0]!, id: "variant-default", priority: 5 },
      { ...rule.variants[0]!, id: "variant-high", name: "High", priority: 7 },
      { ...rule.variants[0]!, id: "variant-low", name: "Low", priority: 6 }
    ]
  };
}

function createConditionRule(): AlertRule {
  return {
    ...rule,
    id: "alert-conditions",
    eventType: "cheer",
    conditions: [{ field: "metadata.saved", operator: "equals", value: true }],
    variants: [
      { ...rule.variants[0]!, id: "variant-default" },
      {
        ...rule.variants[0]!,
        id: "variant-special",
        name: "Special",
        conditions: [{ field: "metadata.variant", operator: "equals", value: true }]
      }
    ]
  };
}

function createAtomicHarness(ruleFixture: AlertRule, activeSet = false) {
  const storedDocuments = new Map(
    ruleFixture.variants.map((_, index) => {
      const document = createAlertEditorDocumentFromRule(ruleFixture, index, null);
      return [document.id, document] as const;
    })
  );
  const documents: AlertEditorDocumentRepository & { save: ReturnType<typeof vi.fn> } = {
    find: vi.fn(async (editorId: string) => storedDocuments.get(editorId) ?? null),
    findMany: vi.fn(async (editorIds: readonly string[]) => new Map(
      editorIds.flatMap((editorId) => {
        const document = storedDocuments.get(editorId);
        return document === undefined ? [] : [[editorId, document] as const];
      })
    )),
    save: vi.fn(async (document: AlertEditorDocument) => document),
    delete: vi.fn(async () => undefined)
  };
  const rules = {
    findRuleById: vi.fn(async (ruleId: string) => ruleId === ruleFixture.id ? ruleFixture : null),
    listRules: vi.fn(async () => [ruleFixture]),
    listCollections: vi.fn(async () => [{ id: "set-default", name: "Default", enabled: activeSet }]),
    saveRule: vi.fn(async (savedRule: AlertRule) => savedRule)
  };
  const metadata = {
    findRule: vi.fn(async () => null),
    saveRule: vi.fn(async (value: AlertRuleManagementMetadata) => value)
  };
  const saveAtomically = vi.fn(async (input: Parameters<NonNullable<AlertEditorServiceOptions["saveAtomically"]>>[0]) => input.document);
  const service = new AlertEditorService({
    documents,
    rules,
    metadata,
    hasConnectedOutput: async () => true,
    enqueueTest: async () => undefined,
    moderationService: new DefaultModerationService(),
    generateId: () => "generated",
    generateReferenceId: () => "reference",
    saveAtomically,
    now: () => new Date("2026-07-15T12:00:00.000Z")
  });
  return { service, documents, rules, metadata, saveAtomically };
}
