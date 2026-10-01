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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TimerDefinitionInput = Omit<TimerDefinitionSnapshot, "id">;

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
  readonly profiles: Readonly<Record<OverlayTargetProfileId, TimerStackRegion>>;
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
}

export type OverlayModulePresentation = {
  readonly kind: "timer-stack";
  readonly stack: TimerStackProjection;
};
