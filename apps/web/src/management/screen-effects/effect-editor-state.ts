import type { EffectVariant, ScreenEffectDocument } from "@stream-jams/core";

export function updateEffectVariant(
  document: ScreenEffectDocument,
  variantId: string,
  update: (variant: EffectVariant) => EffectVariant
): ScreenEffectDocument {
  if (!document.variants.some((variant) => variant.id === variantId)) {
    throw new RangeError(`Screen Effect variant "${variantId}" was not found`);
  }
  return {
    ...document,
    variants: document.variants.map((variant) =>
      variant.id === variantId ? update(structuredClone(variant)) : variant
    )
  };
}
