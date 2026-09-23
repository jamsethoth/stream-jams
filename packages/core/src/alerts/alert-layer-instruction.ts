import type { ResolvedAudioLayer } from "../audio/types.js";
import type { AlertLayer } from "../management/contracts.js";
import type {
  OverlayElementLayout,
  OverlayInstruction,
  OverlayVisualInstruction
} from "../overlays/types.js";

export type AlertLayerInstructionBase = Pick<
  OverlayInstruction,
  "id" | "overlayId" | "moduleId" | "purpose" | "scope" | "targetProfileId" | "durationMs"
> & { readonly operatorTest?: true };

export interface BuildAlertLayerInstructionInput {
  readonly base: AlertLayerInstructionBase;
  readonly layer: AlertLayer;
  readonly layout: OverlayElementLayout | undefined;
  readonly renderedText?: string | undefined;
  readonly tts?: OverlayInstruction["tts"] | undefined;
  readonly visualMediaType?: OverlayVisualInstruction["mediaType"] | undefined;
  readonly audio?: {
    readonly sourceKind: ResolvedAudioLayer["sourceKind"];
    readonly playbackDurationMs: number;
    readonly fadeInMs: number;
    readonly fadeOutMs: number;
  } | undefined;
}

export function buildAlertLayerInstruction(input: BuildAlertLayerInstructionInput): OverlayInstruction | null {
  const { base, layer, layout } = input;
  const instructionBase: OverlayInstruction = {
    ...base,
    visual: null,
    audio: null,
    text: null,
    shape: null,
    animation: layer.animation,
    tts: null
  };

  if (layer.type === "text") {
    if (layout === undefined || input.renderedText === undefined) return null;
    return {
      ...instructionBase,
      text: {
        text: input.renderedText,
        layout,
        textStyle: layer.textStyle,
        boxStyle: layer.boxStyle
      }
    };
  }

  if (layer.type === "image" || layer.type === "video") {
    if (layout === undefined) return null;
    return {
      ...instructionBase,
      visual: {
        assetId: layer.assetId,
        mediaType: input.visualMediaType ?? layer.type,
        layout,
        ...(layer.type === "video" ? { loop: layer.loop ?? false } : {})
      }
    };
  }

  if (layer.type === "audio") {
    const audio = input.audio ?? {
      sourceKind: "audio" as const,
      playbackDurationMs: base.durationMs,
      fadeInMs: layer.fadeInMs ?? 0,
      fadeOutMs: layer.fadeOutMs ?? 0
    };
    return {
      ...instructionBase,
      audio: {
        assetId: layer.assetId,
        volume: layer.volume,
        ...audio
      }
    };
  }

  if (layer.type === "tts") {
    if (input.tts === undefined || input.tts === null) return null;
    return { ...instructionBase, tts: input.tts };
  }

  if (layer.type === "shape") {
    if (layout === undefined) return null;
    return { ...instructionBase, shape: { fill: layer.fill, layout } };
  }

  return assertNever(layer);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported alert layer: ${JSON.stringify(value)}`);
}
