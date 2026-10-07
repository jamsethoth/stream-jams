import type { OverlayPurpose } from "../shared/schemas.js";

/** The module stores no authored settings in this slice; presentation is fixed. */
export type VideoShoutoutModuleConfig = Readonly<Record<string, never>>;

/** A validated Streamer.bot-selected clip, with duration normalized to milliseconds. */
export interface VideoShoutoutClip {
  readonly login: string;
  readonly displayName: string;
  readonly clipId: string;
  readonly embedUrl: string;
  readonly title: string;
  readonly durationMs: number;
  readonly avatarUrl: string | null;
}

export type VideoShoutoutErrorReason = "no-clip" | "playback-failed";

export type VideoShoutoutProjection =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly activationId: string; readonly clip: VideoShoutoutClip }
  | { readonly status: "playing"; readonly activationId: string; readonly clip: VideoShoutoutClip; readonly endsAtEpochMs: number }
  | {
      readonly status: "error";
      readonly activationId: string;
      readonly reason: VideoShoutoutErrorReason;
      readonly displayName: string | null;
    };

export type VideoShoutoutCommand =
  | { readonly kind: "play"; readonly purpose: OverlayPurpose; readonly clip: VideoShoutoutClip; readonly avatarOmitted: boolean }
  | { readonly kind: "no-clip"; readonly purpose: OverlayPurpose; readonly displayName: string | null }
  | { readonly kind: "clear"; readonly purpose: OverlayPurpose };

export type VideoShoutoutRejection = "invalid-payload" | "unsafe-embed-url" | "invalid-duration";

export type VideoShoutoutCommandParseResult =
  | { readonly status: "accepted"; readonly command: VideoShoutoutCommand }
  | {
      readonly status: "rejected";
      readonly reason: VideoShoutoutRejection;
      /** Field names only; values are never echoed so diagnostics cannot leak payload content. */
      readonly fields: readonly string[];
    };
