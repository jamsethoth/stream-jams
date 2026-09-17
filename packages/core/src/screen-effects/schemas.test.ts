import { describe, expect, it } from "vitest";
import {
  createScreenEffectDocument,
  effectBindingIdentity,
  screenEffectDocumentSchema
} from "./schemas.js";

const layout = { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 };
const animation = {
  mode: "preset" as const,
  entrance: "fade",
  exit: "fade",
  durationMs: 250,
  delayMs: 0,
  easing: "linear"
};

function audioOnlyDocument() {
  const draft = createScreenEffectDocument({
    id: "effect-neutral",
    name: "Neutral effect",
    defaultVariantId: "variant-default"
  });
  return {
    ...draft,
    variants: [{
      ...draft.variants[0]!,
      sound: { assetId: "asset-tone", volume: 0.25 },
      outputs: { browserSource: false, deviceRouteIds: ["route-headphones"] }
    }]
  };
}

describe("screenEffectDocumentSchema", () => {
  it("constructs a disabled no-output draft with safe playback defaults", () => {
    const draft = createScreenEffectDocument({
      id: "effect-new",
      name: "New effect",
      defaultVariantId: "variant-default"
    });

    expect(draft).toEqual({
      schemaVersion: 1,
      id: "effect-new",
      name: "New effect",
      enabled: false,
      description: null,
      category: null,
      priority: 0,
      cooldownSeconds: 0,
      bindings: [],
      variants: [{
        id: "variant-default",
        name: "Default",
        enabled: true,
        weight: 1,
        visual: null,
        sound: null,
        animation: null,
        durationMs: 10_000,
        outputs: { browserSource: false, deviceRouteIds: [] },
        visualOutputs: { browserSource: false, desktop: false }
      }]
    });
    expect(screenEffectDocumentSchema.safeParse(draft).success).toBe(false);
  });

  it("accepts a valid audio-only effect with an explicit route", () => {
    expect(screenEffectDocumentSchema.parse(audioOnlyDocument())).toMatchObject({
      enabled: false,
      variants: [{
        visual: null,
        sound: { assetId: "asset-tone", volume: 0.25 },
        outputs: { browserSource: false, deviceRouteIds: ["route-headphones"] }
      }]
    });
  });

  it("rejects a saved variant with no visual or explicit sound", () => {
    const document = audioOnlyDocument();
    expect(screenEffectDocumentSchema.safeParse({
      ...document,
      variants: [{ ...document.variants[0]!, sound: null }]
    }).success).toBe(false);
  });

  it("keeps video soundtrack and separate sound controls independent", () => {
    const document = audioOnlyDocument();
    const parsed = screenEffectDocumentSchema.parse({
      ...document,
      variants: [{
        ...document.variants[0]!,
        visual: {
          mediaType: "video",
          assetId: "asset-video",
          layout,
          playEmbeddedAudio: false,
          audioVolume: 0.2
        },
        sound: { assetId: "asset-sound", volume: 0.8 },
        animation,
        outputs: { browserSource: true, deviceRouteIds: ["route-headphones"] },
        visualOutputs: { browserSource: true, desktop: false }
      }]
    });

    expect(parsed.variants[0]).toMatchObject({
      visual: { playEmbeddedAudio: false, audioVolume: 0.2 },
      sound: { assetId: "asset-sound", volume: 0.8 },
      outputs: { browserSource: true, deviceRouteIds: ["route-headphones"] },
      visualOutputs: { browserSource: true, desktop: false }
    });
  });

  it.each([
    ["duration below one second", (document: ReturnType<typeof audioOnlyDocument>) => ({
      ...document, variants: [{ ...document.variants[0]!, durationMs: 999 }]
    })],
    ["duration above two minutes", (document: ReturnType<typeof audioOnlyDocument>) => ({
      ...document, variants: [{ ...document.variants[0]!, durationMs: 120_001 }]
    })],
    ["zero weight", (document: ReturnType<typeof audioOnlyDocument>) => ({
      ...document, variants: [{ ...document.variants[0]!, weight: 0 }]
    })],
    ["oversized weight", (document: ReturnType<typeof audioOnlyDocument>) => ({
      ...document, variants: [{ ...document.variants[0]!, weight: 10_001 }]
    })],
    ["negative cooldown", (document: ReturnType<typeof audioOnlyDocument>) => ({ ...document, cooldownSeconds: -1 })],
    ["oversized cooldown", (document: ReturnType<typeof audioOnlyDocument>) => ({ ...document, cooldownSeconds: 86_401 })],
    ["unsafe priority", (document: ReturnType<typeof audioOnlyDocument>) => ({ ...document, priority: Number.MAX_SAFE_INTEGER + 1 })],
    ["invalid layout", (document: ReturnType<typeof audioOnlyDocument>) => ({
      ...document,
      variants: [{
        ...document.variants[0]!,
        visual: { mediaType: "image", assetId: "asset-image", layout: { ...layout, width: 0 } }
      }]
    })],
    ["invalid animation", (document: ReturnType<typeof audioOnlyDocument>) => ({
      ...document,
      variants: [{ ...document.variants[0]!, animation: { ...animation, delayMs: -1 } }]
    })]
  ])("rejects %s", (_label, candidate) => {
    expect(screenEffectDocumentSchema.safeParse(candidate(audioOnlyDocument())).success).toBe(false);
  });

  it("rejects unknown fields, unsafe IDs, duplicate variants, and duplicate binding identities", () => {
    const document = audioOnlyDocument();
    expect(screenEffectDocumentSchema.safeParse({ ...document, command: "launch.exe" }).success).toBe(false);
    expect(screenEffectDocumentSchema.safeParse({ ...document, id: "../effect" }).success).toBe(false);
    expect(screenEffectDocumentSchema.safeParse({
      ...document,
      variants: [document.variants[0], document.variants[0]]
    }).success).toBe(false);

    const binding = {
      id: "binding-one",
      kind: "twitch-reward" as const,
      broadcasterId: "broadcaster-1",
      rewardId: "reward-1"
    };
    expect(screenEffectDocumentSchema.safeParse({
      ...document,
      bindings: [binding, { ...binding, id: "binding-two" }]
    }).success).toBe(false);
  });

  it("requires at least one enabled variant and accepts multiple enabled variants", () => {
    const document = audioOnlyDocument();
    expect(screenEffectDocumentSchema.safeParse({
      ...document,
      variants: [{ ...document.variants[0]!, enabled: false }]
    }).success).toBe(false);
    expect(screenEffectDocumentSchema.safeParse({
      ...document,
      variants: [document.variants[0], { ...document.variants[0]!, id: "variant-second" }]
    }).success).toBe(true);
  });

  it("rejects the removed variant kind field", () => {
    const document = audioOnlyDocument();
    expect(screenEffectDocumentSchema.safeParse({
      ...document,
      variants: [{ ...document.variants[0]!, kind: "default" }]
    }).success).toBe(false);
  });
});

describe("effectBindingIdentity", () => {
  it("uses stable matching fields and excludes the storage ID", () => {
    expect(effectBindingIdentity({
      id: "binding-one",
      kind: "twitch-reward",
      broadcasterId: "broadcaster-1",
      rewardId: "reward-1"
    })).toBe('twitch-reward:["broadcaster-1","reward-1"]');
    expect(effectBindingIdentity({
      id: "binding-two",
      kind: "streamerbot-event",
      providerId: "provider-1",
      sourceKey: "Custom",
      eventType: "Jump"
    })).toBe('streamerbot-event:["provider-1","Custom","Jump"]');
  });
});
