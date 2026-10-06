import { NamedError } from "@stream-jams/core";
export class EffectDefinitionNotFoundError extends Error {
  constructor(readonly effectId: string) {
    super(`Screen Effect "${effectId}" was not found`);
    this.name = "EffectDefinitionNotFoundError";
  }
}

export type EffectReferenceKind = "visual-asset" | "sound-asset" | "audio-route";

export class EffectReferenceUnavailableError extends NamedError {
  readonly code = "SCREEN_EFFECT_REFERENCE_UNAVAILABLE";
  constructor(readonly kind: EffectReferenceKind, readonly referenceId: string, options?: ErrorOptions) {
    const label = kind === "visual-asset" ? "visual asset" : kind === "sound-asset" ? "sound asset" : "audio route";
    const detail = kind === "audio-route" ? "does not exist" : "is missing or incompatible";
    super("EffectReferenceUnavailableError", `Screen Effect ${label} "${referenceId}" ${detail}`, options);
  }
}
