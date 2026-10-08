import { useEffect, useRef, useState } from "react";
import { serializeException, type VideoPlaybackClock, type VideoSource, type VideosProjection } from "@stream-jams/core";
import { buildVideoPlayerUrl, videoClockPositionMs, videoInstructionPrefix, videoProviderOrigin, videosProjectionSchema } from "@stream-jams/core/videos";
import type { OverlayPlaybackEvent } from "./OverlaySurface.js";
import "../overlay.css";

export interface VideosOverlayProps {
  readonly projection: VideosProjection;
  readonly onPlaybackEvent?: ((event: OverlayPlaybackEvent) => void) | undefined;
  /** Storybook and tests substitute a local document; production renders the provider player URL as built. */
  readonly resolvePlayerUrl?: ((playerUrl: string, source: VideoSource) => string) | undefined;
  /** Iframes expose no load errors, so a player that has not loaded by then is reported failed. */
  readonly playerLoadTimeoutMs?: number | undefined;
  readonly now?: (() => number) | undefined;
}

const passThrough = (playerUrl: string) => playerUrl;
// Below the server's load timeout so the item fails visibly instead of silently clearing.
const defaultPlayerLoadTimeoutMs = 12_000;
/** Outputs further than this from the shared clock jump to it; smaller drift is left alone. */
export const videoDriftToleranceMs = 750;
const driftCheckIntervalMs = 1_000;

export function VideosOverlay({ projection, onPlaybackEvent, resolvePlayerUrl = passThrough, playerLoadTimeoutMs = defaultPlayerLoadTimeoutMs, now = Date.now }: VideosOverlayProps) {
  const parsed = videosProjectionSchema.safeParse(projection);
  const itemId = projection.status === "active" && typeof projection.itemId === "string" ? projection.itemId : null;
  const invalid = !parsed.success;
  const reportedInvalidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!invalid || itemId === null || reportedInvalidRef.current === itemId) return;
    reportedInvalidRef.current = itemId;
    reportFailure(onPlaybackEvent, itemId, "Video data was invalid.", new Error("Videos projection failed validation"));
  }, [itemId, invalid, onPlaybackEvent]);

  // Live overlays fail closed: invalid data never renders chrome or raw values.
  if (!parsed.success) return null;
  const videos = parsed.data;
  if (videos.status === "idle") return null;
  if (videos.status === "notice") {
    return (
      <div className="video-overlay" data-state="notice" data-testid="video-overlay">
        <div className="video-overlay__notice" role="status">
          {videos.displayName === null ? null : <span className="video-overlay__name">{videos.displayName}</span>}
          <span className="video-overlay__notice-text">No clip to show right now</span>
        </div>
      </div>
    );
  }
  // Mirror delivery shows the desktop primary player's stream; that receiver arrives with the desktop player host.
  if (videos.delivery.mode === "mirror") return null;
  const { source, clock, obsAudio } = videos.delivery;
  const playerUrl = source.provider === "direct" ? source.url : buildVideoPlayerUrl(source, {
    parentHost: window.location.hostname,
    playerOrigin: window.location.origin,
    muted: !obsAudio
  });
  return (
    <div className="video-overlay" data-provider={source.provider} data-testid="video-overlay">
      <PlayerFrame
        clock={clock}
        itemId={videos.itemId}
        key={videos.itemId}
        loadTimeoutMs={playerLoadTimeoutMs}
        muted={!obsAudio}
        now={now}
        onPlaybackEvent={onPlaybackEvent}
        playerUrl={resolvePlayerUrl(playerUrl, source)}
        source={source}
      />
      {videos.title === null && videos.requester === null ? null : (
        <div className="video-overlay__context">
          {videos.title === null ? null : <span className="video-overlay__title">{videos.title}</span>}
          {videos.requester === null ? null : <span className="video-overlay__requester">Requested by {videos.requester}</span>}
        </div>
      )}
    </div>
  );
}

interface PlayerFrameProps {
  readonly itemId: string;
  readonly source: VideoSource;
  readonly clock: VideoPlaybackClock;
  readonly muted: boolean;
  readonly playerUrl: string;
  readonly loadTimeoutMs: number;
  readonly now: () => number;
  readonly onPlaybackEvent: VideosOverlayProps["onPlaybackEvent"];
}

function PlayerFrame(props: PlayerFrameProps) {
  const { itemId, loadTimeoutMs, onPlaybackEvent } = props;
  const [started, setStarted] = useState(false);
  const onPlaybackEventRef = useRef(onPlaybackEvent);
  useEffect(() => { onPlaybackEventRef.current = onPlaybackEvent; }, [onPlaybackEvent]);
  // Created once per item: each player reports started, completed or failed at most once.
  const [reporter] = useState(() => createReporter(itemId, setStarted, onPlaybackEventRef));
  const reportRef = useRef(reporter);

  useEffect(() => {
    if (started) return;
    const timeout = window.setTimeout(() => reportRef.current.failed("The video player did not load in time.", new Error("Video player load timed out")), loadTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [loadTimeoutMs, started]);

  return (
    <div className="video-overlay__frame" data-state={started ? "playing" : "loading"}>
      {props.source.provider === "direct"
        ? <DirectPlayer {...props} reportRef={reportRef} />
        : <EmbeddedPlayer {...props} reportRef={reportRef} />}
      {started ? null : <div aria-live="polite" className="video-overlay__loading" role="status">Loading video</div>}
    </div>
  );
}

interface PlaybackReporter { started(): void; ended(): void; failed(message: string, cause: unknown): void }
type Reporter = { readonly current: PlaybackReporter };

function createReporter(itemId: string, setStarted: (started: boolean) => void, onPlaybackEventRef: { readonly current: VideosOverlayProps["onPlaybackEvent"] }): PlaybackReporter {
  let settled: "started" | "finished" | null = null;
  const instructionId = `${videoInstructionPrefix}${itemId}`;
  return {
    started() {
      setStarted(true);
      if (settled !== null) return;
      settled = "started";
      onPlaybackEventRef.current?.({ instructionId, status: "started" });
    },
    ended() {
      if (settled === "finished") return;
      settled = "finished";
      onPlaybackEventRef.current?.({ instructionId, status: "completed" });
    },
    failed(message, cause) {
      if (settled !== null) return;
      settled = "finished";
      reportFailure(onPlaybackEventRef.current, itemId, message, cause);
    }
  };
}

/** Stream Jams' own `<video>` for allowlisted direct files: follows the shared clock exactly. */
function DirectPlayer({ clock, muted, now, playerUrl, reportRef }: PlayerFrameProps & { readonly reportRef: Reporter }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    const sync = () => {
      const targetSeconds = videoClockPositionMs(clock, now()) / 1000;
      if (Number.isFinite(video.duration) && Math.abs(video.currentTime - targetSeconds) * 1000 > videoDriftToleranceMs) video.currentTime = targetSeconds;
      if (clock.state === "paused") video.pause();
      else if (video.paused && !video.ended) void video.play().catch((error: unknown) => reportRef.current.failed("The video could not start.", error));
    };
    sync();
    video.addEventListener("loadedmetadata", sync);
    const interval = window.setInterval(sync, driftCheckIntervalMs);
    return () => { video.removeEventListener("loadedmetadata", sync); window.clearInterval(interval); };
  }, [clock, now, reportRef]);
  return (
    <video
      className="video-overlay__player"
      data-testid="video-overlay-direct"
      muted={muted}
      onEnded={() => reportRef.current.ended()}
      onError={() => reportRef.current.failed("The video file could not be loaded.", new Error("Direct video failed to load"))}
      onPlaying={() => reportRef.current.started()}
      playsInline
      preload="auto"
      ref={videoRef}
      src={playerUrl}
    />
  );
}

/**
 * Provider iframe. YouTube is steered through its postMessage API (no provider script runs in
 * this page). Twitch exposes no control here, so it plays from its start offset until the queue ends it.
 */
function EmbeddedPlayer({ clock, now, playerUrl, reportRef, source }: PlayerFrameProps & { readonly reportRef: Reporter }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const playerTimeRef = useRef<number | null>(null);
  const origin = videoProviderOrigin(source);
  const controllable = source.provider === "youtube";

  useEffect(() => {
    if (!controllable || origin === null) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow || typeof event.data !== "string") return;
      const message = parseYouTubeMessage(event.data);
      if (message === null) return;
      if (message.currentTime !== null) playerTimeRef.current = message.currentTime;
      if (message.playerState === 1) reportRef.current.started();
      if (message.playerState === 0) reportRef.current.ended();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [controllable, origin, reportRef]);

  useEffect(() => {
    if (!controllable || !loaded || origin === null) return;
    const post = (message: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify(message), origin);
    const command = (func: string, args: readonly unknown[] = []) => post({ event: "command", func, args, id: 1, channel: "widget" });
    post({ event: "listening", id: 1, channel: "widget" });
    const sync = () => {
      const targetSeconds = videoClockPositionMs(clock, now()) / 1000;
      const current = playerTimeRef.current;
      if (current === null || Math.abs(current - targetSeconds) * 1000 > videoDriftToleranceMs) command("seekTo", [targetSeconds, true]);
      command(clock.state === "paused" ? "pauseVideo" : "playVideo");
    };
    sync();
    const interval = window.setInterval(sync, driftCheckIntervalMs);
    return () => window.clearInterval(interval);
  }, [clock, controllable, loaded, now, origin]);

  return (
    <iframe
      allow="autoplay; fullscreen"
      className="video-overlay__player"
      data-loaded={loaded}
      data-testid="video-overlay-embed"
      onLoad={() => {
        setLoaded(true);
        // Twitch reports nothing back; YouTube confirms through its state messages.
        if (!controllable) reportRef.current.started();
      }}
      // Providers check the embedding origin, never the keyed overlay path.
      referrerPolicy="origin"
      ref={frameRef}
      sandbox="allow-scripts allow-same-origin"
      src={playerUrl}
      title="Video player"
    />
  );
}

/** Reads the fields Stream Jams uses from a YouTube iframe API message; anything else is ignored. */
export function parseYouTubeMessage(data: string): { readonly playerState: number | null; readonly currentTime: number | null } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(data); }
  // error-provenance: allow expected -- unrelated or malformed provider messages are ignored by design
  catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as { readonly event?: unknown; readonly info?: unknown };
  if (message.event === "onStateChange" && typeof message.info === "number") return { playerState: message.info, currentTime: null };
  if (message.event !== "infoDelivery" || typeof message.info !== "object" || message.info === null) return null;
  const info = message.info as { readonly playerState?: unknown; readonly currentTime?: unknown };
  return {
    playerState: typeof info.playerState === "number" ? info.playerState : null,
    currentTime: typeof info.currentTime === "number" && Number.isFinite(info.currentTime) ? info.currentTime : null
  };
}

function reportFailure(onPlaybackEvent: VideosOverlayProps["onPlaybackEvent"], itemId: string, message: string, cause: unknown): void {
  onPlaybackEvent?.({
    instructionId: `${videoInstructionPrefix}${itemId}`,
    status: "failed",
    failure: { referenceId: `err_${crypto.randomUUID()}`, stage: "source-load", message, exception: serializeException(cause) }
  });
}
