import { describe, expect, it } from "vitest";
import { createScreenEffectDocument, screenEffectDocumentSchema } from "./schemas.js";
import {
  applyScreenEffectEdit,
  copyScreenEffectVariant,
  createScreenEffectAuthoringState,
  duplicateScreenEffect,
  isScreenEffectAuthoringDirty,
  markScreenEffectSaved,
  parseScreenEffectForSave,
  redoScreenEffectEdit,
  revertScreenEffectEdits,
  undoScreenEffectEdit
} from "./authoring.js";

describe("Screen Effect authoring", () => {
  it("keeps copy/edit/undo/redo/save/revert snapshots immutable", () => {
    const initial = effectDocument();
    let state = createScreenEffectAuthoringState(initial, 2);
    const edited = applyScreenEffectEdit(state, (document) => ({
      ...document,
      name: "Edited",
      variants: document.variants.map((variant) => ({
        ...variant,
        sound: variant.sound === null ? null : { ...variant.sound, volume: 0.75 }
      }))
    }));

    expect(edited.document).toMatchObject({ name: "Edited", variants: [{ sound: { volume: 0.75 } }] });
    expect(initial).toMatchObject({ name: "Original", variants: [{ sound: { volume: 0.25 } }] });
    expect(isScreenEffectAuthoringDirty(edited)).toBe(true);
    state = undoScreenEffectEdit(edited);
    expect(state.document).toEqual(initial);
    state = redoScreenEffectEdit(state);
    expect(state.document.name).toBe("Edited");
    state = markScreenEffectSaved(state, parseScreenEffectForSave(state.document));
    expect(isScreenEffectAuthoringDirty(state)).toBe(false);
    const invalid = applyScreenEffectEdit(state, (document) => ({
      ...document,
      variants: document.variants.map((variant) => ({ ...variant, sound: null }))
    }));
    expect(() => parseScreenEffectForSave(invalid.document)).toThrow(/visual|sound/iu);
    expect(revertScreenEffectEdits(invalid).document).toEqual(state.savedDocument);
  });

  it("copies variants and duplicates effects with caller-owned stable IDs and no shared nested state", () => {
    const source = effectDocument();
    const withCopy = copyScreenEffectVariant(source, "variant-default", {
      id: "variant-copy",
      name: "Copy"
    });
    expect(withCopy.variants[1]).toMatchObject({
      id: "variant-copy",
      name: "Copy",
      kind: "weighted",
      enabled: false,
      sound: { assetId: "asset-tone", volume: 0.25 }
    });
    expect(screenEffectDocumentSchema.parse(withCopy)).toEqual(withCopy);

    const duplicated = duplicateScreenEffect(source, {
      id: "effect-copy",
      name: "Original copy",
      variantIds: ["variant-duplicated"],
      bindingIds: ["binding-duplicated"]
    });
    expect(duplicated).toMatchObject({
      id: "effect-copy",
      name: "Original copy",
      enabled: false,
      bindings: [{ id: "binding-duplicated" }],
      variants: [{ id: "variant-duplicated" }]
    });
    const mutable = duplicated.variants[0]!.sound as { volume: number };
    mutable.volume = 0.9;
    expect(source.variants[0]!.sound?.volume).toBe(0.25);
  });

  it("preserves independent embedded video, separate sound, and audio-only variant settings", () => {
    const source = effectDocument();
    const video = screenEffectDocumentSchema.parse({
      ...source,
      variants: [{
        ...source.variants[0]!,
        visual: {
          mediaType: "video",
          assetId: "asset-video",
          layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 },
          playEmbeddedAudio: true,
          audioVolume: 0.4
        },
        sound: { assetId: "asset-tone", volume: 0.7 },
        outputs: { browserSource: true, deviceRouteIds: ["route-headphones"] }
      }, {
        ...source.variants[0]!,
        id: "variant-audio-only",
        name: "Audio only",
        kind: "weighted",
        visual: null,
        sound: { assetId: "asset-other", volume: 0.3 },
        outputs: { browserSource: false, deviceRouteIds: ["route-speakers"] }
      }]
    });

    expect(parseScreenEffectForSave(structuredClone(video))).toEqual(video);
  });
});

function effectDocument() {
  const draft = createScreenEffectDocument({
    id: "effect-original",
    name: "Original",
    defaultVariantId: "variant-default"
  });
  return screenEffectDocumentSchema.parse({
    ...draft,
    bindings: [{
      id: "binding-original",
      kind: "twitch-reward",
      broadcasterId: "broadcaster-1",
      rewardId: "reward-1"
    }],
    variants: [{
      ...draft.variants[0]!,
      sound: { assetId: "asset-tone", volume: 0.25 },
      outputs: { browserSource: false, deviceRouteIds: ["route-headphones"] }
    }]
  });
}
