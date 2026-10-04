import type { NormalizedStreamEvent } from "../events/types.js";
import type { ResolvedAlertAudio } from "../audio/types.js";
import type { OverlayInstruction } from "../overlays/types.js";

export interface ResolvedAlert {
  /** Set only by resolution of an enabled, reviewed Landscape document. */
  readonly desktopVisualEligible?: true | undefined;
  readonly id: string;
  readonly sourceEventId: string;
  readonly ruleId: string;
  readonly variantId: string;
  readonly overlayInstruction: OverlayInstruction;
}

export interface PlaybackQueueItem {
  readonly id: string;
  readonly sourceEvent: NormalizedStreamEvent;
  readonly alerts: readonly ResolvedAlert[];
  readonly audio: readonly ResolvedAlertAudio[];
  readonly priority: number;
  readonly sequence: number;
  readonly status: "queued" | "playing" | "completed" | "skipped";
  readonly enqueuedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export type MutablePlaybackModuleId = "alerts" | "screen-effects";
export type ModuleMuteState = Readonly<Record<MutablePlaybackModuleId, boolean>>;
export const defaultModuleMuteState: ModuleMuteState = { alerts: false, "screen-effects": false };

export interface PlaybackSafetyState {
  readonly moduleMutes?: ModuleMuteState | undefined;
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
}

export const defaultPlaybackSafetyState: PlaybackSafetyState = {
  paused: false,
  muted: false,
  doNotDisturb: false
};

export interface PlaybackQueueSnapshot extends PlaybackSafetyState {
  readonly current: PlaybackQueueItem | null;
  readonly queued: readonly PlaybackQueueItem[];
  readonly recent: readonly PlaybackQueueItem[];
}
