import { createScreenEffectDocument, type ScreenEffectDocument } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { removeEffectVariant, updateEffectVariant } from "./effect-editor-state.js";

describe("updateEffectVariant", () => {
  it("immutably updates only the selected variant", () => {
    const original = createScreenEffectDocument({
      id: "effect-one",
      name: "Effect one",
      defaultVariantId: "variant-one"
    });
    const second = { ...original.variants[0]!, id: "variant-two", name: "Second" };
    const document: ScreenEffectDocument = { ...original, variants: [...original.variants, second] };

    const updated = updateEffectVariant(document, "variant-two", (variant) => ({
      ...variant,
      durationMs: 12_000
    }));

    expect(updated.variants[0]).toBe(document.variants[0]);
    expect(updated.variants[1]).toMatchObject({ id: "variant-two", durationMs: 12_000 });
    expect(document.variants[1]!.durationMs).toBe(10_000);
  });

  it("rejects an unknown variant without creating a misleading document", () => {
    const document = createScreenEffectDocument({
      id: "effect-one",
      name: "Effect one",
      defaultVariantId: "variant-one"
    });

    expect(() => updateEffectVariant(document, "missing", (variant) => variant)).toThrow("missing");
  });
});

describe("removeEffectVariant", () => {
  it("removes only the selected variant", () => {
    const original = createScreenEffectDocument({
      id: "effect-one",
      name: "Effect one",
      defaultVariantId: "variant-one"
    });
    const second = { ...original.variants[0]!, id: "variant-two", name: "Second" };
    const document: ScreenEffectDocument = { ...original, variants: [...original.variants, second] };

    const updated = removeEffectVariant(document, "variant-two");

    expect(updated.variants).toEqual([document.variants[0]]);
    expect(document.variants).toHaveLength(2);
  });

  it("protects the final variant", () => {
    const document = createScreenEffectDocument({
      id: "effect-one",
      name: "Effect one",
      defaultVariantId: "variant-one"
    });

    expect(() => removeEffectVariant(document, "variant-one")).toThrow("at least one variant");
  });

  it("protects the only enabled variant", () => {
    const original = createScreenEffectDocument({
      id: "effect-one",
      name: "Effect one",
      defaultVariantId: "variant-one"
    });
    const second = { ...original.variants[0]!, id: "variant-two", name: "Second", enabled: false };
    const document: ScreenEffectDocument = { ...original, variants: [...original.variants, second] };

    expect(() => removeEffectVariant(document, "variant-one")).toThrow("only enabled variant");
  });
});
