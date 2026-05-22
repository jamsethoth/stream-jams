import type { StreamEventType } from "../events/types.js";
import type { OverlayElementLayout } from "../overlays/types.js";

export interface AlertCollection {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface AlertCondition {
  readonly field: string;
  readonly operator: "equals" | "min" | "max" | "range" | "includes";
  readonly value: string | number | boolean | readonly [number, number];
}

export interface AlertTtsConfig {
  readonly enabled: boolean;
  readonly providerId: string;
  readonly voiceId: string | null;
  readonly template: string;
  readonly minimumAmount: number | null;
}

export interface AlertVariant {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly visualAssetId: string | null;
  readonly audioAssetId: string | null;
  readonly textTemplate: string;
  readonly ttsConfig: AlertTtsConfig | null;
  readonly durationMs: number;
  readonly layout: OverlayElementLayout;
}

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly eventType: StreamEventType;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly conditions: readonly AlertCondition[];
  readonly variants: readonly AlertVariant[];
  readonly cooldownSeconds: number;
  readonly priority: number;
}

export interface AlertActivationState {
  readonly enabledCollectionIds: readonly string[];
  readonly disabledRuleIds: readonly string[];
}
