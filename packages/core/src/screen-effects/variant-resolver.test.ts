import { describe, expect, it } from "vitest";
import { createScreenEffectDocument, screenEffectDocumentSchema } from "./schemas.js";
import { chooseWeightedVariant, resolveEffectContent } from "./variant-resolver.js";

function documentWithVariants() {
  const draft = createScreenEffectDocument({
    id: "effect-neutral",
    name: "Neutral",
    defaultVariantId: "variant-default"
  });
  return screenEffectDocumentSchema.parse({
    ...draft,
    priority: 4,
    variants: [
      { ...draft.variants[0]!, sound: { assetId: "asset-default", volume: 0.1 } },
      {
        ...draft.variants[0]!,
        id: "variant-a",
        name: "A",
        weight: 2,
        sound: { assetId: "asset-a", volume: 0.2 },
        outputs: { browserSource: false, deviceRouteIds: ["route-a"] }
      },
      {
        ...draft.variants[0]!,
        id: "variant-b",
        name: "B",
        weight: 3,
        sound: { assetId: "asset-b", volume: 0.3 },
        outputs: { browserSource: false, deviceRouteIds: ["route-b"] }
      }
    ]
  });
}

describe("chooseWeightedVariant", () => {
  it("uses stable weighted boundaries without selecting twice", () => {
    const variants = [{ id: "a", weight: 2 }, { id: "b", weight: 3 }];
    expect(chooseWeightedVariant(variants, 0)).toBe("a");
    expect(chooseWeightedVariant(variants, 0.4)).toBe("b");
    expect(chooseWeightedVariant(variants, 0.999)).toBe("b");
    expect(() => chooseWeightedVariant(variants, 1)).toThrow();
  });

  it.each([-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY])("rejects random value %s", (random) => {
    expect(() => chooseWeightedVariant([{ id: "a", weight: 1 }], random)).toThrow();
  });

  it("rejects empty, duplicate, fractional, and out-of-range candidates", () => {
    expect(() => chooseWeightedVariant([], 0)).toThrow();
    expect(() => chooseWeightedVariant([{ id: "a", weight: 1 }, { id: "a", weight: 2 }], 0)).toThrow();
    expect(() => chooseWeightedVariant([{ id: "a", weight: 1.5 }], 0)).toThrow();
    expect(() => chooseWeightedVariant([{ id: "a", weight: 10_001 }], 0)).toThrow();
  });
});

describe("resolveEffectContent", () => {
  it("selects every enabled variant from one weighted pool and snapshots the selected content once", () => {
    const document = documentWithVariants();
    expect(resolveEffectContent(document, 0).variant.id).toBe("variant-default");
    expect(resolveEffectContent(document, 1 / 6).variant.id).toBe("variant-a");
    const snapshot = resolveEffectContent(document, 0.5);

    expect(snapshot).toMatchObject({
      effectId: "effect-neutral",
      effectName: "Neutral",
      priority: 4,
      variant: { id: "variant-b", sound: { assetId: "asset-b", volume: 0.3 } }
    });

    const edited = document.variants[2] as unknown as {
      name: string;
      sound: { assetId: string; volume: number };
      outputs: { deviceRouteIds: string[] };
    };
    edited.name = "Edited";
    edited.sound.assetId = "asset-edited";
    edited.outputs.deviceRouteIds.push("route-edited");
    expect(snapshot.variant).toMatchObject({
      id: "variant-b",
      name: "B",
      sound: { assetId: "asset-b" },
      outputs: { deviceRouteIds: ["route-b"] }
    });
  });

  it("excludes disabled variants from weighted selection", () => {
    const document = documentWithVariants();
    const withDisabledCandidates = screenEffectDocumentSchema.parse({
      ...document,
      variants: document.variants.map((variant) => variant.id === "variant-a"
        ? { ...variant, enabled: false }
        : variant)
    });

    expect(resolveEffectContent(withDisabledCandidates, 0.2).variant.id).toBe("variant-default");
    expect(resolveEffectContent(withDisabledCandidates, 0.3).variant.id).toBe("variant-b");
  });
});
