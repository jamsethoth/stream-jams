import type { AlertMatch } from "./alert-matcher.js";
import type { CheerEvent } from "../events/types.js";
import type { AlertEditorDocument } from "../management/contracts.js";
import type { AlertRule, AlertVariant } from "./types.js";
import { describe, expect, it } from "vitest";
import { DefaultModerationService } from "../moderation/moderation-service.js";
import { resolvedAlertSchema } from "../playback/schemas.js";
import { AlertVariantSelectionError, DefaultAlertResolver } from "./alert-resolver.js";

describe("DefaultAlertResolver", () => {
  it("resolves priority-ordered matches into overlay instructions without raw event payloads", () => {
    const event = createCheerEvent({
      amount: 500,
      actor: {
        id: "viewer-1",
        displayName: "<Viewer>"
      },
      metadata: {
        rawProviderPayload: {
          accessToken: "do-not-leak"
        }
      }
    });
    const lowPriorityRule = createRule({
      id: "low-priority",
      priority: 1,
      variants: [createVariant({ id: "low-variant", textTemplate: "Low {actor.displayName}" })]
    });
    const highPriorityRule = createRule({
      id: "high-priority",
      priority: 10,
      variants: [
        createVariant({
          id: "high-variant",
          visualAssetId: "visual-1",
          audioAssetId: "audio-1",
          textTemplate: "Thanks {actor.displayName} for {amount} bits",
          ttsConfig: {
            enabled: true,
            providerId: "browser",
            voiceId: "voice-1",
            template: "Say thanks to {actor.displayName}",
            minimumAmount: 100
          },
          durationMs: 7000
        })
      ]
    });
    const resolver = createResolver();

    const resolved = resolver.resolveMatches({
      matches: [createMatch(lowPriorityRule, event), createMatch(highPriorityRule, event)],
      target: {
        overlayId: "overlay-1",
        purpose: "live",
        scope: "module"
      },
      visualAssetMediaTypes: {
        "visual-1": "gif"
      }
    });

    expect(resolved.map((alert) => alert.ruleId)).toEqual(["high-priority", "low-priority"]);
    expect(resolved[0]).toMatchObject({
      id: "resolved-alert-1",
      sourceEventId: "event-cheer",
      ruleId: "high-priority",
      variantId: "high-variant",
      overlayInstruction: {
        id: "overlay-instruction-2",
        overlayId: "overlay-1",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        visual: {
          assetId: "visual-1",
          mediaType: "gif",
          layout
        },
        audio: {
          assetId: "audio-1",
          volume: 1
        },
        text: {
          text: "Thanks &lt;Viewer&gt; for 500 bits",
          layout
        },
        tts: {
          mode: "browser-speech",
          text: "Say thanks to &lt;Viewer&gt;",
          audioAssetId: null,
          providerPayload: {
            providerId: "browser",
            voiceId: "voice-1"
          }
        },
        durationMs: 7000
      }
    });
    expect(resolved.every((alert) => resolvedAlertSchema.safeParse(alert).success)).toBe(true);
    expect(JSON.stringify(resolved)).not.toContain("rawProviderPayload");
    expect(JSON.stringify(resolved)).not.toContain("do-not-leak");
  });

  it("uses a sanitized template context that cannot render raw provider payloads", () => {
    const event = createCheerEvent({
      metadata: {
        giftCount: 3,
        rawProviderPayload: {
          accessToken: "do-not-leak"
        }
      }
    });
    const rule = createRule({
      variants: [
        createVariant({
          textTemplate: "{metadata.rawProviderPayload.accessToken}:{metadata.giftCount}:{giftCount}",
          ttsConfig: {
            enabled: true,
            providerId: "browser",
            voiceId: null,
            template: "{metadata.rawProviderPayload.accessToken}:{giftCount}",
            minimumAmount: null
          }
        })
      ]
    });

    const resolved = createResolver().resolveMatches({ matches: [createMatch(rule, event)], target });

    expect(resolved[0]?.overlayInstruction.text?.text).toBe(":3:3");
    expect(resolved[0]?.overlayInstruction.tts?.text).toBe(":3");
    expect(JSON.stringify(resolved)).not.toContain("do-not-leak");
  });

  it("moderates rendered and TTS text before playback instructions leave the resolver", () => {
    const event = createCheerEvent({
      message: "badword https://example.test/secret"
    });
    const rule = createRule({
      variants: [
        createVariant({
          textTemplate: "{message} extra",
          ttsConfig: {
            enabled: true,
            providerId: "browser",
            voiceId: null,
            template: "Read {message}",
            minimumAmount: null
          }
        })
      ]
    });
    const resolver = createResolver({
      moderationService: new DefaultModerationService({
        settings: {
          renderedText: {
            maxLength: 80,
            blockedTerms: ["badword"],
            stripUrls: true
          },
          ttsText: {
            maxLength: 80,
            blockedTerms: ["badword"],
            stripUrls: true
          }
        }
      })
    });

    const resolved = resolver.resolveMatches({ matches: [createMatch(rule, event)], target });

    expect(resolved[0]?.overlayInstruction.text?.text).toBe("[moderated] [link removed] extra");
    expect(resolved[0]?.overlayInstruction.tts?.text).toBe("Read [moderated] [link removed]");
  });

  it("selects the highest-priority matching variant before applying weighted randomness", () => {
    const event = createCheerEvent({ amount: 600 });
    const rule = createRule({
      variants: [
        createVariant({ id: "low-priority-match", priority: 0, weight: 100 }),
        createVariant({
          id: "high-priority-nonmatch",
          priority: 10,
          weight: 100,
          conditions: [{ field: "amount", operator: "min", value: 1000 }]
        }),
        createVariant({
          id: "high-priority-common",
          priority: 5,
          weight: 1,
          conditions: [{ field: "amount", operator: "min", value: 500 }]
        }),
        createVariant({
          id: "high-priority-rare",
          priority: 5,
          weight: 3,
          conditions: [{ field: "amount", operator: "min", value: 500 }]
        })
      ]
    });

    expect(createResolver({ randomValues: [0.5] }).resolveMatches({ matches: [createMatch(rule, event)], target }).map((alert) => alert.variantId)).toEqual([
      "high-priority-rare"
    ]);
  });

  it("selects enabled variants with injected weighted randomness", () => {
    const event = createCheerEvent();
    const rule = createRule({
      variants: [
        createVariant({ id: "common", weight: 1 }),
        createVariant({ id: "rare", weight: 3 })
      ]
    });

    expect(createResolver({ randomValues: [0.1] }).resolveMatches({ matches: [createMatch(rule, event)], target }).map((alert) => alert.variantId)).toEqual([
      "common"
    ]);
    expect(createResolver({ randomValues: [0.5] }).resolveMatches({ matches: [createMatch(rule, event)], target }).map((alert) => alert.variantId)).toEqual([
      "rare"
    ]);
  });

  it("ignores disabled variants and fails closed when every variant is disabled", () => {
    const event = createCheerEvent();
    const mixedRule = createRule({
      variants: [
        createVariant({ id: "disabled", enabled: false, weight: 100 }),
        createVariant({ id: "enabled", weight: 1 })
      ]
    });
    const disabledRule = createRule({
      id: "all-disabled",
      variants: [createVariant({ id: "disabled-only", enabled: false })]
    });
    const resolver = createResolver({ randomValues: [0] });

    expect(resolver.resolveMatches({ matches: [createMatch(mixedRule, event)], target }).map((alert) => alert.variantId)).toEqual(["enabled"]);
    expect(() => resolver.resolveMatches({ matches: [createMatch(disabledRule, event)], target })).toThrow(AlertVariantSelectionError);
  });

  it("omits TTS instructions when the amount is below the configured minimum", () => {
    const event = createCheerEvent({ amount: 50 });
    const rule = createRule({
      variants: [
        createVariant({
          ttsConfig: {
            enabled: true,
            providerId: "browser",
            voiceId: null,
            template: "Small cheer from {actor.displayName}",
            minimumAmount: 100
          }
        })
      ]
    });

    expect(createResolver().resolveMatches({ matches: [createMatch(rule, event)], target })[0]?.overlayInstruction.tts).toBeNull();
  });

  it("resolves every visible supported editor layer with profile geometry", () => {
    const event = createCheerEvent({ actor: { id: "viewer-1", displayName: "Profile Viewer" } });
    const rule = createRule();
    const document = createEditorDocument(rule);
    const editorTarget = {
      overlayId: "overlay-1",
      purpose: "live" as const,
      scope: "module" as const,
      targetProfileId: "landscape" as const
    };
    const input = {
      matches: [createMatch(rule, event)],
      target: editorTarget,
      editorDocuments: new Map([[rule.id, document]]),
      visualAssetMediaTypes: { "asset-image": "gif" as const }
    };

    const resolved = createResolver().resolveMatches(input);

    expect(resolved.map((alert) => alert.variantId)).toEqual(Array(5).fill("variant-1"));
    expect(resolved.map((alert) => alert.overlayInstruction.targetProfileId)).toEqual([
      "landscape",
      "landscape",
      "landscape",
      "landscape",
      "landscape"
    ]);
    expect(resolved[0]?.overlayInstruction.text).toEqual({
      text: "Welcome Profile Viewer",
      layout: { layerId: "layer-text", x: 120, y: 80, width: 600, height: 140, zIndex: 3 }
    });
    expect(resolved[1]?.overlayInstruction.visual).toEqual({
      assetId: "asset-image",
      mediaType: "gif",
      layout: { layerId: "layer-image", x: 40, y: 30, width: 320, height: 240, zIndex: 2 }
    });
    expect(resolved[2]?.overlayInstruction.audio).toEqual({ assetId: "asset-audio", volume: 0.5 });
    expect(resolved[3]?.overlayInstruction.tts?.text).toBe("Read Profile Viewer");
    expect(resolved[4]?.overlayInstruction.shape).toEqual({
      fill: "#fff",
      layout: { layerId: "layer-shape", x: 0, y: 0, width: 100, height: 100, zIndex: 5 }
    });
    expect(resolved.map((alert) => alert.overlayInstruction.animation)).toEqual(Array(5).fill(animation));
  });

  it("does not resolve editor layers for a disabled target profile", () => {
    const rule = createRule();
    const input = {
      matches: [createMatch(rule, createCheerEvent())],
      target: {
        overlayId: "overlay-1",
        purpose: "live" as const,
        scope: "module" as const,
        targetProfileId: "vertical" as const
      },
      editorDocuments: new Map([[rule.id, createEditorDocument(rule)]])
    };

    expect(createResolver().resolveMatches(input)).toEqual([]);
  });

  it("renders the saved editor document for the selected variation", () => {
    const baseRule = createRule();
    const rule: AlertRule = {
      ...baseRule,
      variants: [
        { ...baseRule.variants[0]!, enabled: false },
        { ...baseRule.variants[0]!, id: "variant-special", name: "Special", enabled: true, textTemplate: "Legacy special" }
      ]
    };
    const document: AlertEditorDocument = {
      ...createEditorDocument(rule),
      id: "variant-special",
      kind: "variation",
      parentAlertId: rule.id,
      name: "Special",
      layers: createEditorDocument(rule).layers.map((layer) =>
        layer.type === "text" ? { ...layer, template: "Saved variation {actor.displayName}" } : layer
      )
    };

    const resolved = createResolver().resolveMatches({
      matches: [createMatch(rule, createCheerEvent())],
      target: {
        overlayId: "overlay-1",
        purpose: "live",
        scope: "module",
        targetProfileId: "landscape"
      },
      editorDocuments: new Map([[document.id, document]])
    });

    expect(resolved[0]?.overlayInstruction.text?.text).toBe("Saved variation Viewer");
    expect(resolved.every((alert) => alert.variantId === "variant-special")).toBe(true);
  });

  it("falls back to legacy rule rendering for a profile target without an editor document", () => {
    const rule = createRule();
    const input = {
      matches: [createMatch(rule, createCheerEvent())],
      target: {
        overlayId: "overlay-1",
        purpose: "live" as const,
        scope: "module" as const,
        targetProfileId: "vertical" as const
      },
      editorDocuments: new Map<string, AlertEditorDocument>()
    };

    expect(createResolver().resolveMatches(input)).toEqual([
      expect.objectContaining({
        variantId: "variant-1",
        overlayInstruction: expect.objectContaining({
          targetProfileId: "vertical",
          text: expect.objectContaining({ text: "Thanks Viewer" })
        })
      })
    ]);
  });
});

const target = {
  overlayId: "overlay-1",
  purpose: "test",
  scope: "module"
} as const;

const layout = {
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  zIndex: 1
};

function createResolver(options: { readonly randomValues?: readonly number[]; readonly moderationService?: DefaultModerationService } = {}): DefaultAlertResolver {
  let nextId = 1;
  let nextRandom = 0;

  return new DefaultAlertResolver({
    generateId: (kind) => `${kind}-${nextId++}`,
    random: () => options.randomValues?.[nextRandom++] ?? 0,
    moderationService: options.moderationService
  });
}

function createMatch(rule: AlertRule, event: CheerEvent): AlertMatch {
  return {
    rule,
    event
  };
}

function createCheerEvent(overrides: Partial<CheerEvent> = {}): CheerEvent {
  return {
    id: "event-cheer",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "cheer",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    message: null,
    amount: 100,
    metadata: {},
    ...overrides
  };
}

function createRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    name: "Cheer rule",
    eventType: "cheer",
    enabled: true,
    collectionIds: ["collection-1"],
    conditions: [],
    variants: [createVariant()],
    cooldownSeconds: 0,
    priority: 0,
    ...overrides
  };
}

function createVariant(overrides: Partial<AlertVariant> = {}): AlertVariant {
  return {
    id: "variant-1",
    name: "Default",
    enabled: true,
    weight: 1,
    visualAssetId: null,
    audioAssetId: null,
    textTemplate: "Thanks {actor.displayName}",
    ttsConfig: null,
    durationMs: 3000,
    layout,
    ...overrides
  };
}

function createEditorDocument(rule: AlertRule): AlertEditorDocument {
  return {
    id: rule.id,
    setId: rule.collectionIds[0]!,
    providerKind: "twitch",
    eventType: rule.eventType,
    kind: "default",
    parentAlertId: null,
    name: rule.name,
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: rule.cooldownSeconds,
    rulePriority: rule.priority,
    durationMs: 4_000,
    layers: [
      { id: "layer-text", name: "Text", type: "text", visible: true, order: 0, animation, template: "Welcome {actor.displayName}" },
      { id: "layer-image", name: "Image", type: "image", visible: true, order: 1, animation, assetId: "asset-image" },
      { id: "layer-audio", name: "Audio", type: "audio", visible: true, order: 2, animation, assetId: "asset-audio", volume: 0.5 },
      { id: "layer-tts", name: "TTS", type: "tts", visible: true, order: 3, animation, template: "Read {actor.displayName}" },
      { id: "layer-hidden", name: "Hidden", type: "text", visible: false, order: 4, animation, template: "Hidden" },
      { id: "layer-shape", name: "Shape", type: "shape", visible: true, order: 5, animation, fill: "#fff" }
    ],
    targetProfiles: [
      {
        id: "landscape",
        enabled: true,
        reviewState: "ready",
        layerLayouts: [
          { layerId: "layer-text", x: 120, y: 80, width: 600, height: 140, zIndex: 3 },
          { layerId: "layer-image", x: 40, y: 30, width: 320, height: 240, zIndex: 2 },
          { layerId: "layer-hidden", x: 0, y: 0, width: 100, height: 100, zIndex: 4 },
          { layerId: "layer-shape", x: 0, y: 0, width: 100, height: 100, zIndex: 5 }
        ]
      },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  };
}

const animation = {
  mode: "preset" as const,
  entrance: "fade",
  exit: "fade",
  durationMs: 300,
  delayMs: 0,
  easing: "ease-out"
};
