import type { OverlayPurpose } from "../shared/schemas.js";

export type VideoProvider = "youtube" | "twitch-clip" | "twitch-vod" | "direct";

/** A validated, provider-normalized video. Player URLs are always rebuilt from this, never stored. */
export type VideoSource =
  | { readonly provider: "youtube"; readonly videoId: string; readonly startAtMs: number }
  | { readonly provider: "twitch-clip"; readonly clipSlug: string }
  | { readonly provider: "twitch-vod"; readonly videoId: string; readonly startAtMs: number }
  | { readonly provider: "direct"; readonly url: string };

export type VideoSubmissionChannel = "management" | "operator" | "automation" | "streamerbot" | "channel-points";

export type VideoRequestStatus = "queued" | "held" | "playing" | "paused" | "played" | "failed" | "removed";

export type VideoHoldReason = "over-limit" | "unknown-length";

export interface VideoRequestItem {
  readonly id: string;
  readonly purpose: OverlayPurpose;
  readonly source: VideoSource;
  readonly title: string | null;
  readonly requester: string | null;
  readonly submittedVia: VideoSubmissionChannel;
  readonly durationMs: number | null;
  readonly status: VideoRequestStatus;
  readonly holdReason: VideoHoldReason | null;
  /** Set when the operator chose Play anyway; the item then ignores the length limit. */
  readonly limitOverridden: boolean;
  readonly autoplay: boolean;
  readonly position: number;
  readonly createdAt: string;
}

export interface VideoRewardMapping {
  readonly rewardId: string;
  readonly purpose: OverlayPurpose;
}

export interface VideosModuleConfig {
  readonly maxLengthSeconds: number;
  readonly gapSeconds: number;
  readonly allowedDirectHosts: readonly string[];
  readonly obsAudio: boolean;
  readonly audioDeviceIds: readonly string[];
  readonly streamerBotAutoplay: boolean;
  readonly rewardMappings: readonly VideoRewardMapping[];
}

export type VideoLinkRejection = "invalid-link" | "unsafe-link" | "unsupported-source";

export type VideoLinkParseResult =
  | { readonly status: "accepted"; readonly source: VideoSource }
  | { readonly status: "rejected"; readonly reason: VideoLinkRejection };

/** Whether pause, resume and seek are expected to work; Twitch control is feature-detected at runtime. */
export interface VideoControlSupport {
  readonly pause: boolean;
  readonly seek: boolean;
}

export interface VideoPlaybackClock {
  readonly state: "playing" | "paused";
  /** Media position at `atEpochMs`; a playing clock advances from it in real time. */
  readonly positionMs: number;
  readonly atEpochMs: number;
}

/** What an overlay output renders for the Videos module. */
export type VideosProjection =
  | { readonly status: "idle" }
  | {
      readonly status: "active";
      readonly itemId: string;
      readonly title: string | null;
      readonly requester: string | null;
      /** `mirror`: show the desktop primary player's stream. `player`: desktop app absent, play locally. */
      readonly delivery:
        | { readonly mode: "mirror"; readonly obsAudio: boolean }
        | { readonly mode: "player"; readonly source: VideoSource; readonly clock: VideoPlaybackClock; readonly obsAudio: boolean };
    }
  | { readonly status: "notice"; readonly noticeId: string; readonly notice: "no-clip"; readonly displayName: string | null };

/** Queue state as returned to management, operator and automation clients. */
export interface VideoQueueResponse {
  readonly purpose: OverlayPurpose;
  readonly revision: number;
  readonly queuePaused: boolean;
  readonly runRemaining: number;
  readonly gapEndsAtEpochMs: number | null;
  readonly serverTimeEpochMs: number;
  readonly items: readonly (VideoRequestItem & { readonly link: string })[];
  readonly current: {
    readonly itemId: string;
    readonly phase: "loading" | "playing" | "paused";
    readonly positionMs: number;
    readonly atEpochMs: number;
    readonly durationMs: number | null;
    readonly controls: VideoControlSupport;
  } | null;
}
