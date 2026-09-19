import { effectVariantSchema, screenEffectDocumentSchema } from "./schemas.js";
import type { EffectContentSnapshot, ScreenEffectDocument } from "./types.js";

interface WeightedVariant {
  readonly id: string;
  readonly weight: number;
}

export function chooseWeightedVariant(variants: readonly WeightedVariant[], random: number): string {
  validateRandom(random);
  if (variants.length === 0 || variants.length > 50) {
    throw new RangeError("Choose between one and 50 variants");
  }

  const ids = new Set<string>();
  let totalWeight = 0;
  for (const candidate of variants) {
    const id = effectVariantSchema.shape.id.parse(candidate.id);
    const weight = effectVariantSchema.shape.weight.parse(candidate.weight);
    if (ids.has(id)) {
      throw new TypeError("Weighted variant IDs must be unique");
    }
    ids.add(id);
    totalWeight += weight;
  }
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new RangeError("Variant weight total must be a positive safe integer");
  }

  let cursor = random * totalWeight;
  for (const variant of variants) {
    if (cursor < variant.weight) {
      return variant.id;
    }
    cursor -= variant.weight;
  }
  throw new Error("Variant weights failed validated selection");
}

export function resolveEffectContent(
  document: ScreenEffectDocument,
  random: number
): EffectContentSnapshot {
  validateRandom(random);
  const parsed = screenEffectDocumentSchema.parse(document);
  const enabled = parsed.variants.filter((variant) => variant.enabled);
  const selectedId = chooseWeightedVariant(enabled, random);
  const selected = parsed.variants.find((variant) => variant.id === selectedId);
  if (selected === undefined) {
    throw new Error("Selected effect variant is unavailable");
  }

  return {
    effectId: parsed.id,
    effectName: parsed.name,
    variant: structuredClone(selected),
    priority: parsed.priority
  };
}

function validateRandom(random: number): void {
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new RangeError("Random value must be in the range [0, 1)");
  }
}
