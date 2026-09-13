import type { AlertAudioOutputs } from "../audio/types.js";
import type { OverlayElementLayout } from "../shared/schemas.js";
import type { OverlayPresetAnimationInstruction } from "../overlays/types.js";

export type EffectBinding =
  | {
      readonly id: string;
      readonly kind: "twitch-reward";
      readonly broadcasterId: string;
      readonly rewardId: string;
    }
  | {
      readonly id: string;
      readonly kind: "streamerbot-event";
      readonly providerId: string;
      readonly sourceKey: string;
      readonly eventType: string;
    };

export type EffectVisual =
  | {
      readonly mediaType: "image" | "gif";
      readonly assetId: string;
      readonly layout: OverlayElementLayout;
    }
  | {
      readonly mediaType: "video";
      readonly assetId: string;
      readonly layout: OverlayElementLayout;
      readonly playEmbeddedAudio: boolean;
      readonly audioVolume: number;
    };

export interface EffectSound {
  readonly assetId: string;
  readonly volume: number;
}

export interface EffectVisualOutputs {
  readonly browserSource: boolean;
  readonly desktop: boolean;
}

export interface EffectVariant {
  readonly id: string;
  readonly name: string;
  readonly kind: "default" | "weighted";
  readonly enabled: boolean;
  readonly weight: number;
  readonly visual: EffectVisual | null;
  readonly sound: EffectSound | null;
  readonly animation: OverlayPresetAnimationInstruction | null;
  readonly durationMs: number;
  readonly outputs: AlertAudioOutputs;
  readonly visualOutputs: EffectVisualOutputs;
}

export interface ScreenEffectDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly description: string | null;
  readonly category: string | null;
  readonly priority: number;
  readonly cooldownSeconds: number;
  readonly bindings: readonly EffectBinding[];
  readonly variants: readonly EffectVariant[];
}

export interface EffectContentSnapshot {
  readonly effectId: string;
  readonly effectName: string;
  readonly variant: EffectVariant;
  readonly priority: number;
}

export interface CreateScreenEffectDocumentInput {
  readonly id: string;
  readonly name: string;
  readonly defaultVariantId: string;
}
