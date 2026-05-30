import type { NormalizedStreamEvent } from "../events/types.js";
import type { OverlayInstruction } from "../overlays/types.js";

export interface ResolvedAlert {
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
  readonly priority: number;
  readonly status: "queued" | "playing" | "completed" | "skipped";
  readonly enqueuedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface PlaybackQueueSnapshot {
  readonly current: PlaybackQueueItem | null;
  readonly queued: readonly PlaybackQueueItem[];
  readonly recent: readonly PlaybackQueueItem[];
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
}
