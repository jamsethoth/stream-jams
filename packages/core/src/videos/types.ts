import type { BoxShadow } from "../shared/box-shadow.js";
/** The sole ordinary Videos session; public submissions cannot select it. */
export type VideoQueuePurpose = "live";

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

export type VideoRequestRejection = "module-disabled" | "invalid-request" | "invalid-link" | "unsafe-link" | "unsupported-source" | "queue-full";
export type VideoRequestAdmissionResult =
  | { readonly status: "accepted"; readonly item: VideoRequestItem }
  | { readonly status: "rejected"; readonly reason: VideoRequestRejection; readonly fields: readonly string[] };
export interface VideoSubmissionPending { readonly status: "pending"; readonly busId: string; readonly eventId: string }
export type VideoSubmissionResult =
  | (VideoRequestAdmissionResult & { readonly busId?: string; readonly eventId?: string })
  | VideoSubmissionPending
  | { readonly status: "unavailable"; readonly busId: string; readonly eventId: string; readonly outcome: "failed" | "expired" | "no-match"; readonly referenceId: string | null };

export interface VideoRequestItem {
  readonly id: string;
  readonly reviewRequired: boolean;
  readonly migrationProvenance: { readonly kind: "test-queue-consolidation"; readonly originalPurpose: "test"; readonly originalStatus: VideoRequestStatus } | null;
  readonly source: VideoSource;
  /** The title given with the submission. It wins over `providerTitle` and is the only title shown on stream. */
  readonly title: string | null;
  /** The title the provider reported for the video after it was queued, or null when unknown. */
  readonly providerTitle: string | null;
  /** The uploader or broadcaster name the provider reported, or null when unknown. */
  readonly channelName: string | null;
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

/** A finished request kept for operator review and replay, newest first. */
export interface VideoRecentItem extends VideoRequestItem {
  readonly status: "played" | "failed";
  /** When playback ended; skipped and stopped videos count as played. */
  readonly finishedAt: string;
}

/**
 * What a provider reported about a queued video. Every field is optional because providers
 * differ: YouTube oEmbed has no length, and direct files are never looked up.
 */
export interface VideoMetadata {
  readonly title: string | null;
  readonly channelName: string | null;
  readonly durationMs: number | null;
}

export interface VideoRewardMapping {
  readonly rewardId: string;
  /**
   * Redemptions arrive held for operator review instead of joining the queue. Set for mappings that targeted the
   * retired test queue; validated configuration always carries it (default false), so absent means false.
   */
  readonly reviewRequired?: boolean;
}

/** Stable local picture/caption content, with independent desktop scene placement. */
export interface VideosLayout {
  readonly schemaVersion: 2;
  readonly content: { readonly width: number; readonly height: number };
  readonly desktopPlacement: { readonly x: number; readonly y: number; readonly scale: number };
  /** Picture shadow; absent keeps the original CSS shadow with no browser source margin. */
  readonly shadow?: BoxShadow | undefined;
}

export interface VideosModuleConfig {
  readonly maxLengthSeconds: number;
  readonly gapSeconds: number;
  readonly allowedDirectHosts: readonly string[];
  readonly obsAudio: boolean;
  readonly audioDeviceIds: readonly string[];
  /** Per-device delay in ms keyed by audio route id, to line device sound up with OBS. Missing means 0. */
  readonly audioDeviceDelaysMs: Readonly<Record<string, number>>;
  readonly streamerBotAutoplay: boolean;
  readonly rewardMappings: readonly VideoRewardMapping[];
  /** Browser content size and desktop-only placement. Layer order remains with the desktop surface. */
  readonly layout: VideosLayout;
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
      readonly layout: VideosLayout;
      /** `mirror`: show the desktop primary player's stream. `player`: desktop app absent, play locally. */
      readonly delivery:
        | { readonly mode: "mirror"; readonly paused: boolean; readonly obsAudio: boolean }
        | { readonly mode: "player"; readonly source: VideoSource; readonly clock: VideoPlaybackClock; readonly obsAudio: boolean };
    }
  | { readonly status: "notice"; readonly noticeId: string; readonly notice: "no-clip"; readonly displayName: string | null; readonly layout: VideosLayout };

/** Queue state as returned to management, operator and automation clients. */
export interface VideoQueueResponse {
  readonly revision: number;
  readonly queuePaused: boolean;
  readonly runRemaining: number;
  readonly gapEndsAtEpochMs: number | null;
  readonly serverTimeEpochMs: number;
  /** Whether the desktop primary player is running; without it browser sources play on their own. */
  readonly mirror: { readonly available: boolean };
  readonly items: readonly (VideoRequestItem & { readonly link: string })[];
  /** The newest finished (played or failed) items, newest first and bounded; removed items are left out. */
  readonly recent: readonly (VideoRecentItem & { readonly link: string })[];
  readonly current: {
    readonly itemId: string;
    readonly phase: "loading" | "playing" | "paused";
    readonly positionMs: number;
    readonly atEpochMs: number;
    readonly durationMs: number | null;
    readonly controls: VideoControlSupport;
  } | null;
}
