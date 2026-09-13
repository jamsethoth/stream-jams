import { screenEffectDocumentSchema } from "./schemas.js";
import type { ScreenEffectDocument } from "./types.js";

export interface ScreenEffectAuthoringState {
  readonly document: ScreenEffectDocument;
  readonly savedDocument: ScreenEffectDocument;
  readonly past: readonly ScreenEffectDocument[];
  readonly future: readonly ScreenEffectDocument[];
  readonly historyLimit: number;
}

export interface ScreenEffectCopyIdentity {
  readonly id: string;
  readonly name: string;
  readonly variantIds: readonly string[];
  readonly bindingIds: readonly string[];
}

export interface ScreenEffectVariantCopyIdentity {
  readonly id: string;
  readonly name: string;
}

export function createScreenEffectAuthoringState(
  document: ScreenEffectDocument,
  historyLimit = 50
): ScreenEffectAuthoringState {
  const initial = structuredClone(document);
  return {
    document: initial,
    savedDocument: initial,
    past: [],
    future: [],
    historyLimit: Math.max(1, Math.trunc(historyLimit))
  };
}

export function applyScreenEffectEdit(
  state: ScreenEffectAuthoringState,
  update: (document: ScreenEffectDocument) => ScreenEffectDocument
): ScreenEffectAuthoringState {
  const document = update(structuredClone(state.document));
  if (JSON.stringify(document) === JSON.stringify(state.document)) return state;
  return {
    ...state,
    document,
    past: [...state.past, state.document].slice(-state.historyLimit),
    future: []
  };
}

export function undoScreenEffectEdit(state: ScreenEffectAuthoringState): ScreenEffectAuthoringState {
  const document = state.past.at(-1);
  if (document === undefined) return state;
  return {
    ...state,
    document,
    past: state.past.slice(0, -1),
    future: [state.document, ...state.future].slice(0, state.historyLimit)
  };
}

export function redoScreenEffectEdit(state: ScreenEffectAuthoringState): ScreenEffectAuthoringState {
  const document = state.future[0];
  if (document === undefined) return state;
  return {
    ...state,
    document,
    past: [...state.past, state.document].slice(-state.historyLimit),
    future: state.future.slice(1)
  };
}

export function markScreenEffectSaved(
  state: ScreenEffectAuthoringState,
  savedDocument: ScreenEffectDocument = state.document
): ScreenEffectAuthoringState {
  const saved = parseScreenEffectForSave(savedDocument);
  return {
    ...state,
    document: saved,
    savedDocument: saved,
    past: [],
    future: []
  };
}

export function revertScreenEffectEdits(state: ScreenEffectAuthoringState): ScreenEffectAuthoringState {
  return createScreenEffectAuthoringState(state.savedDocument, state.historyLimit);
}

export function isScreenEffectAuthoringDirty(state: ScreenEffectAuthoringState): boolean {
  return state.document !== state.savedDocument;
}

export function parseScreenEffectForSave(document: ScreenEffectDocument): ScreenEffectDocument {
  return screenEffectDocumentSchema.parse(structuredClone(document));
}

export function copyScreenEffectVariant(
  document: ScreenEffectDocument,
  sourceVariantId: string,
  identity: ScreenEffectVariantCopyIdentity
): ScreenEffectDocument {
  const parsed = screenEffectDocumentSchema.parse(document);
  const source = parsed.variants.find((variant) => variant.id === sourceVariantId);
  if (source === undefined) throw new RangeError(`Screen Effect variant "${sourceVariantId}" was not found`);
  return screenEffectDocumentSchema.parse({
    ...parsed,
    variants: [...parsed.variants, {
      ...structuredClone(source),
      id: identity.id,
      name: identity.name,
      kind: "weighted",
      enabled: false
    }]
  });
}

export function duplicateScreenEffect(
  document: ScreenEffectDocument,
  identity: ScreenEffectCopyIdentity
): ScreenEffectDocument {
  const parsed = screenEffectDocumentSchema.parse(document);
  if (identity.variantIds.length !== parsed.variants.length) {
    throw new RangeError("Duplicating a Screen Effect requires one new ID per variant");
  }
  if (identity.bindingIds.length !== parsed.bindings.length) {
    throw new RangeError("Duplicating a Screen Effect requires one new ID per binding");
  }
  return screenEffectDocumentSchema.parse({
    ...structuredClone(parsed),
    id: identity.id,
    name: identity.name,
    enabled: false,
    variants: parsed.variants.map((variant, index) => ({
      ...structuredClone(variant),
      id: identity.variantIds[index]
    })),
    bindings: parsed.bindings.map((binding, index) => ({
      ...structuredClone(binding),
      id: identity.bindingIds[index]
    }))
  });
}
