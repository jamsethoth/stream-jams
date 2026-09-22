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

export function removeEffectVariant(
  document: ScreenEffectDocument,
  variantId: string
): ScreenEffectDocument {
  const variant = document.variants.find((candidate) => candidate.id === variantId);
  if (variant === undefined) {
    throw new RangeError(`Screen Effect variant "${variantId}" was not found`);
  }
  if (document.variants.length === 1) {
    throw new RangeError("A Screen Effect requires at least one variant");
  }
  if (variant.enabled && document.variants.every((candidate) => candidate.id === variantId || !candidate.enabled)) {
    throw new RangeError("Enable another variant before removing the only enabled variant");
  }
  return {
    ...document,
    variants: document.variants.filter((candidate) => candidate.id !== variantId)
  };
}
