import type { AlertAudioOutputs } from "../audio/types.js";
import type { OverlayElementLayout, OverlayTargetProfileId } from "../shared/schemas.js";

export interface TimerDefinitionSnapshot {
  readonly id: string;
  readonly label: string;
  readonly durationMs: number;
  readonly iconAssetId: string | null;
  readonly startAudioAssetId: string | null;
  readonly endAudioAssetId: string | null;
  readonly outputs: AlertAudioOutputs;
}

export interface TimerDefinition extends TimerDefinitionSnapshot {
  readonly eventRules?: readonly import("./event-rules.js").TimerEventRule[] | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TimerDefinitionInput = Omit<TimerDefinitionSnapshot, "id"> & {
  readonly eventRules?: readonly import("./event-rules.js").TimerEventRule[] | undefined;
};

export type TimerRunState =
  | {
      readonly status: "running";
      readonly definitionId: string;
      readonly generation: string;
      readonly snapshot: TimerDefinitionSnapshot;
      readonly startedAtEpochMs: number;
      readonly endsAtEpochMs: number;
    }
  | {
      readonly status: "paused";
      readonly definitionId: string;
      readonly generation: string;
      readonly snapshot: TimerDefinitionSnapshot;
      readonly remainingMs: number;
    }
  | {
      readonly status: "completed";
      readonly definitionId: string;
      readonly generation: string;
      readonly snapshot: TimerDefinitionSnapshot;
      readonly completedAtEpochMs: number;
      readonly expiresAtEpochMs: number;
    };

export interface TimerCommandResult {
  readonly changed: boolean;
  readonly state: TimerRunState | null;
}

export interface TimerStackRegion {
  readonly layout: OverlayElementLayout;
  readonly orientation: "vertical" | "horizontal";
  readonly maxVisible: number;
}

export interface TimersOverlayModuleConfig {
  readonly schemaVersion: 2;
  readonly profiles: Readonly<Record<OverlayTargetProfileId, TimerProfile>>;
}

export interface TimerTypography {
  readonly fontPreset: "system-sans" | "rounded-sans" | "serif" | "monospace";
  readonly fontSizePx: number;
  readonly fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  readonly color: string;
  /** Only these two historical fallback strings are accepted; selecting a preset clears this. */
  readonly legacyFamily?: "Inter, ui-sans-serif, system-ui, sans-serif" | "ui-monospace, SFMono-Regular, Consolas, monospace" | undefined;
}

export interface TimerAppearance {
  readonly cardWidthPx: number;
  readonly cardHeightPx: number;
  readonly orientation: "vertical" | "horizontal";
  readonly maxVisible: number;
  readonly stackGapPx: number;
  readonly gapPx: number;
  readonly blockPaddingPx: number;
  readonly inlinePaddingPx: number;
  readonly cornerRadiusPx: number;
  readonly borderWidthPx: number;
  readonly borderColor: string;
  readonly backgroundColor: string;
  readonly backgroundOpacity: number;
  readonly labelFont: TimerTypography;
  readonly valueFont: TimerTypography;
  readonly iconSizePx: number;
  readonly runningAccent: string | null;
  readonly pausedAccent: string;
  readonly completedAccent: string;
}

export interface TimerProfile {
  readonly appearance: TimerAppearance;
  readonly desktopPlacement: { readonly x: number; readonly y: number; readonly zIndex: number; readonly scale: number };
}

export interface TimerOverflowGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSizePx: number;
  readonly blockPaddingPx: number;
  readonly inlinePaddingPx: number;
  readonly offsetPx: number;
}

interface TimerOverlayCardBase {
  readonly iconVersion?: string | undefined;
  readonly definitionId: string;
  readonly generation: string;
  readonly label: string;
  readonly iconAssetId: string | null;
  readonly slot: OverlayElementLayout;
}

export type TimerOverlayCard =
  | (TimerOverlayCardBase & { readonly status: "running"; readonly endsAtEpochMs: number })
  | (TimerOverlayCardBase & { readonly status: "paused"; readonly remainingMs: number })
  | (TimerOverlayCardBase & { readonly status: "completed"; readonly remainingMs: 0; readonly expiresAtEpochMs: number });

export interface TimerStackProjection {
  readonly targetProfileId: OverlayTargetProfileId;
  readonly region: TimerStackRegion;
  readonly cards: readonly TimerOverlayCard[];
  readonly overflowCount: number;
  readonly appearance?: TimerAppearance | undefined;
  readonly overflow?: TimerOverflowGeometry | undefined;
  readonly renderScale?: number | undefined;
}

/** Compatibility alias; presentation ownership lives with overlay modules. */
export type { OverlayModulePresentation } from "../overlay-modules/presentation.js";
