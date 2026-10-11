import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { serializeException, videosPlacementGeometry, type VideoPlaybackClock, type VideoSource, type VideosLayout, type VideosProjection } from "@stream-jams/core";
import { buildVideoPlayerUrl, parseYouTubeMessage, videoClockPositionMs, videoInstructionPrefix, videoMediaDurationMaximumMs, videoProviderOrigin, videosProjectionSchema } from "@stream-jams/core/videos";
import type { OverlayPlaybackEvent } from "./OverlaySurface.js";
import { VideoBox, VideoCaption, videoFrameStyle } from "./VideoPlacement.js";
import { startVideoMirrorReceiver, videoMirrorPictureSize, type VideoMirrorConnector, type VideoMirrorReceiver, type VideoMirrorReceiverState } from "@stream-jams/core/videos";

export { parseYouTubeMessage } from "@stream-jams/core/videos";
import "../overlay.css";

export interface VideosOverlayProps {
  readonly projection: VideosProjection;
  readonly onPlaybackEvent?: ((event: OverlayPlaybackEvent) => void) | undefined;
  /** Storybook and tests substitute a local document; production renders the provider player URL as built. */
  readonly resolvePlayerUrl?: ((playerUrl: string, source: VideoSource) => string) | undefined;
  /** Iframes expose no load errors, so a player that has not loaded by then is reported failed. */
  readonly playerLoadTimeoutMs?: number | undefined;
  readonly now?: (() => number) | undefined;
  /** Signaling to the desktop primary player; without it a mirror projection renders nothing. */
  readonly mirror?: VideoMirrorConnector | undefined;
  /** Global mute policy: the mirror's sound is silenced while visuals continue. */
  readonly muted?: boolean | undefined;
  /** The desktop overlay shows the mirror's picture only; its sound goes to devices from the desktop app. */
  readonly mirrorAudio?: boolean | undefined;
  /** Tests and stories substitute a local peer connection; production uses the browser's RTCPeerConnection. */
  readonly createMirrorPeerConnection?: ((configuration: RTCConfiguration) => RTCPeerConnection) | undefined;
}

const passThrough = (playerUrl: string) => playerUrl;
// Below the server's load timeout so the item fails visibly instead of silently clearing.
const defaultPlayerLoadTimeoutMs = 12_000;
/** Outputs further than this from the shared clock jump to it; smaller drift is left alone. */
export const videoDriftToleranceMs = 750;
const driftCheckIntervalMs = 1_000;

export function VideosOverlay({ projection, onPlaybackEvent, resolvePlayerUrl = passThrough, playerLoadTimeoutMs = defaultPlayerLoadTimeoutMs, now = Date.now,
  mirror, muted = false, mirrorAudio = true, createMirrorPeerConnection }: VideosOverlayProps) {
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
      <VideoBox data-state="notice" data-testid="video-overlay" layout={videos.layout}>
        <div className="video-overlay__notice" role="status">
          {videos.displayName === null ? null : <span className="video-overlay__name">{videos.displayName}</span>}
          <span className="video-overlay__notice-text">No clip to show right now</span>
        </div>
      </VideoBox>
    );
  }
  const { layout } = videos;
  const context = <VideoCaption layout={layout} requester={videos.requester} title={videos.title} />;
  // Mirror delivery shows the desktop primary player's stream; it never plays the item here.
  if (videos.delivery.mode === "mirror") {
    if (mirror === undefined) return null;
    return (
      <MirrorReceiver
        connector={mirror}
        context={context}
        createPeerConnection={createMirrorPeerConnection}
        layout={layout}
        muted={muted || !mirrorAudio || !videos.delivery.obsAudio}
        paused={videos.delivery.paused}
      />
    );
  }
  const { source, clock, obsAudio } = videos.delivery;
  const silent = muted || !obsAudio;
  const playerUrl = source.provider === "direct" ? source.url : buildVideoPlayerUrl(source, {
    parentHost: window.location.hostname,
    playerOrigin: window.location.origin,
    muted: silent
  });
  return (
    <VideoBox data-provider={source.provider} data-testid="video-overlay" layout={layout}>
      <PlayerFrame
        clock={clock}
        frameStyle={videoFrameStyle(layout)}
        itemId={videos.itemId}
        key={videos.itemId}
        loadTimeoutMs={playerLoadTimeoutMs}
        muted={silent}
        now={now}
        onPlaybackEvent={onPlaybackEvent}
        playerUrl={resolvePlayerUrl(playerUrl, source)}
        source={source}
      />
      {context}
    </VideoBox>
  );
}

interface MirrorReceiverProps {
  readonly connector: VideoMirrorConnector;
  readonly context: ReactNode;
  readonly layout: VideosLayout;
  readonly muted: boolean;
  readonly paused: boolean;
  readonly createPeerConnection: VideosOverlayProps["createMirrorPeerConnection"];
}

/**
 * Shows the desktop primary player's stream. Stays transparent until frames arrive and
 * whenever the mirror is unavailable; reconnects on its own and releases the connection on unmount.
 * It asks only for what it plays: sound only while audible, and a picture no larger than its
 * frame in device pixels. Needing more later (unmuted, a bigger box) reconnects once; needing less does not.
 */
function MirrorReceiver({ connector, context, layout, muted, paused, createPeerConnection }: MirrorReceiverProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<VideoMirrorReceiverState>("connecting");
  // The latest props, read by the receiver's callbacks.
  const latest = useRef({ muted, layout });
  const receiverRef = useRef<VideoMirrorReceiver | null>(null);
  useEffect(() => {
    latest.current = { muted, layout };
    if (videoRef.current !== null) videoRef.current.muted = muted;
    receiverRef.current?.refresh();
  }, [muted, layout]);
  useEffect(() => {
    const receiver = startVideoMirrorReceiver({
      connector,
      createPeerConnection,
      request: () => {
        const box = latest.current.layout;
        const { frame } = videosPlacementGeometry(box);
        // The canvas is scaled to the output; measure the box to get device pixels.
        const width = videoRef.current?.closest(".video-overlay")?.getBoundingClientRect().width ?? 0;
        const scale = (width / box.width || 1) * devicePixelRatio;
        return { media: latest.current.muted ? "video" : "both", ...videoMirrorPictureSize(frame.width * scale, frame.height * scale) };
      },
      onState: setState,
      onStream: stream => {
        const video = videoRef.current;
        if (video === null || video.srcObject === stream) return;
        video.srcObject = stream;
        if (stream === null) return;
        video.muted = latest.current.muted;
        // A browser that refuses autoplay with sound still shows the picture.
        void video.play().catch(
          // error-provenance: allow expected -- autoplay with sound was refused; show the picture muted instead
          () => {
            video.muted = true;
            return video.play().catch(
              // error-provenance: allow expected -- the overlay fails closed and stays transparent if even muted playback is refused
              () => undefined);
          });
      }
    });
    // A stopped receiver ignores refresh, so the ref needs no clearing.
    receiverRef.current = receiver;
    return () => {
      receiver.stop();
      const video = videoRef.current;
      if (video !== null) { video.pause(); video.srcObject = null; }
    };
  }, [connector, createPeerConnection]);
  const shown = state === "playing";
  return (
    <VideoBox data-delivery="mirror" data-state={shown && paused ? "paused" : state} data-testid="video-overlay" layout={layout}>
      <div className="video-overlay__frame" data-state={shown ? "playing" : "loading"} hidden={!shown} style={videoFrameStyle(layout)}>
        <video autoPlay className="video-overlay__player" data-testid="video-overlay-mirror" muted={muted} playsInline ref={videoRef} />
      </div>
      {shown ? context : null}
    </VideoBox>
  );
}

interface PlayerFrameProps {
  readonly itemId: string;
  readonly source: VideoSource;
  readonly clock: VideoPlaybackClock;
  readonly muted: boolean;
  readonly playerUrl: string;
  readonly frameStyle: CSSProperties;
  readonly loadTimeoutMs: number;
  readonly now: () => number;
  readonly onPlaybackEvent: VideosOverlayProps["onPlaybackEvent"];
}

function PlayerFrame(props: PlayerFrameProps) {
  const { itemId, loadTimeoutMs, onPlaybackEvent } = props;
  const [started, setStarted] = useState(false);
  const onPlaybackEventRef = useRef(onPlaybackEvent);
  useEffect(() => { onPlaybackEventRef.current = onPlaybackEvent; }, [onPlaybackEvent]);
  // Created once per item: each player reports started, completed or failed, and the media length, at most once.
  const [reporter] = useState(() => createReporter(itemId, setStarted, onPlaybackEventRef));
  const reportRef = useRef(reporter);

  useEffect(() => {
    if (started) return;
    const timeout = window.setTimeout(() => reportRef.current.failed("The video player did not load in time.", new Error("Video player load timed out")), loadTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [loadTimeoutMs, started]);

  return (
    <div className="video-overlay__frame" data-state={started ? "playing" : "loading"} style={props.frameStyle}>
      {props.source.provider === "direct"
        ? <DirectPlayer {...props} reportRef={reportRef} />
        : <EmbeddedPlayer {...props} reportRef={reportRef} />}
      {started ? null : <div aria-live="polite" className="video-overlay__loading" role="status">Loading video</div>}
    </div>
  );
}

interface PlaybackReporter { started(): void; ended(): void; failed(message: string, cause: unknown): void; duration(mediaDurationMs: number): void }
type Reporter = { readonly current: PlaybackReporter };

function createReporter(itemId: string, setStarted: (started: boolean) => void, onPlaybackEventRef: { readonly current: VideosOverlayProps["onPlaybackEvent"] }): PlaybackReporter {
  let settled: "started" | "finished" | null = null;
  let durationReported = false;
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
    },
    // The server learns the length so an unknown-length item over the limit is cut; live streams report none.
    duration(mediaDurationMs) {
      const rounded = Math.round(mediaDurationMs);
      if (durationReported || settled === "finished" || !(rounded >= 1 && rounded <= videoMediaDurationMaximumMs)) return;
      durationReported = true;
      onPlaybackEventRef.current?.({ instructionId, status: "duration", mediaDurationMs: rounded });
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
      onDurationChange={event => reportRef.current.duration(event.currentTarget.duration * 1000)}
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
      if (message.duration !== undefined) reportRef.current.duration(message.duration * 1000);
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

function reportFailure(onPlaybackEvent: VideosOverlayProps["onPlaybackEvent"], itemId: string, message: string, cause: unknown): void {
  onPlaybackEvent?.({
    instructionId: `${videoInstructionPrefix}${itemId}`,
    status: "failed",
    failure: { referenceId: `err_${crypto.randomUUID()}`, stage: "source-load", message, exception: serializeException(cause) }
  });
}
