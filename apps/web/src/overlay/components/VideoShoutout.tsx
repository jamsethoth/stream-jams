import { useEffect, useRef, useState } from "react";
import { serializeException, videoShoutoutProjectionSchema, type VideoShoutoutClip, type VideoShoutoutProjection } from "@stream-jams/core";
import type { OverlayPlaybackEvent } from "./OverlaySurface.js";
import "../overlay.css";

export interface VideoShoutoutProps {
  readonly projection: VideoShoutoutProjection;
  readonly onPlaybackEvent?: ((event: OverlayPlaybackEvent) => void) | undefined;
  /** Storybook and tests substitute a local document; production renders the validated embed URL as given. */
  readonly resolvePlayerUrl?: ((embedUrl: string) => string) | undefined;
  /** Iframes expose no load errors, so a player that has not loaded by then is reported failed. */
  readonly playerLoadTimeoutMs?: number | undefined;
}

const passThrough = (embedUrl: string) => embedUrl;
// Below the server's loading timeout so the bounded failure state is shown instead of a silent clear.
const defaultPlayerLoadTimeoutMs = 12_000;

export function VideoShoutout({ projection, onPlaybackEvent, resolvePlayerUrl = passThrough, playerLoadTimeoutMs = defaultPlayerLoadTimeoutMs }: VideoShoutoutProps) {
  const parsed = videoShoutoutProjectionSchema.safeParse(projection);
  const activationId = projection.status === "idle" ? null : projection.activationId;
  const invalid = !parsed.success;
  const reportedInvalidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!invalid || activationId === null || reportedInvalidRef.current === activationId) return;
    reportedInvalidRef.current = activationId;
    reportFailure(onPlaybackEvent, activationId, "source-load", "Video shoutout data was invalid.", new Error("Video shoutout projection failed validation"));
  }, [activationId, invalid, onPlaybackEvent]);

  // Live overlays fail closed: invalid data never renders chrome or raw values.
  if (!parsed.success) return null;
  const shoutout = parsed.data;
  if (shoutout.status === "idle") return null;
  if (shoutout.status === "error") {
    return (
      <div className="video-shoutout" data-state="error" data-testid="video-shoutout">
        <div className="video-shoutout__notice" role="status">
          {shoutout.displayName === null ? null : <span className="video-shoutout__name">{shoutout.displayName}</span>}
          <span className="video-shoutout__notice-text">{shoutout.reason === "no-clip" ? "No clip to show right now" : "Clip unavailable"}</span>
        </div>
      </div>
    );
  }
  return (
    <ClipPlayer
      activationId={shoutout.activationId}
      clip={shoutout.clip}
      key={shoutout.activationId}
      loadTimeoutMs={playerLoadTimeoutMs}
      onPlaybackEvent={onPlaybackEvent}
      playerUrl={resolvePlayerUrl(shoutout.clip.embedUrl)}
    />
  );
}

function ClipPlayer({ activationId, clip, loadTimeoutMs, onPlaybackEvent, playerUrl }: {
  readonly activationId: string;
  readonly clip: VideoShoutoutClip;
  readonly loadTimeoutMs: number;
  readonly onPlaybackEvent: VideoShoutoutProps["onPlaybackEvent"];
  readonly playerUrl: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const reportedRef = useRef(false);
  const showAvatar = clip.avatarUrl !== null && !avatarFailed;
  useEffect(() => {
    if (loaded) return;
    const timeout = window.setTimeout(() => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      reportFailure(onPlaybackEvent, activationId, "source-load", "Twitch clip player did not load in time.", new Error("Twitch clip iframe load timed out"));
    }, loadTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [activationId, loadTimeoutMs, loaded, onPlaybackEvent]);

  return (
    <div className="video-shoutout" data-state={loaded ? "playing" : "loading"} data-testid="video-shoutout">
      <div className="video-shoutout__frame">
        <iframe
          allow="autoplay; fullscreen"
          className="video-shoutout__player"
          data-loaded={loaded}
          onLoad={() => {
            setLoaded(true);
            if (reportedRef.current) return;
            reportedRef.current = true;
            onPlaybackEvent?.({ instructionId: activationId, status: "started" });
          }}
          // The overlay page sends no referrer; Twitch checks the embedding origin, never the keyed path.
          referrerPolicy="origin"
          sandbox="allow-scripts allow-same-origin"
          src={playerUrl}
          title={`Twitch clip: ${clip.title}`}
        />
        {loaded ? null : <div aria-live="polite" className="video-shoutout__loading" role="status">Loading clip</div>}
      </div>
      <div className="video-shoutout__context">
        {showAvatar ? (
          <img alt="" className="video-shoutout__avatar" onError={() => setAvatarFailed(true)} referrerPolicy="no-referrer" src={clip.avatarUrl!} />
        ) : null}
        <div className="video-shoutout__text">
          <span className="video-shoutout__name">
            {clip.displayName}
            {clip.displayName.toLowerCase() === clip.login.toLowerCase() ? null : <span className="video-shoutout__login"> ({clip.login})</span>}
          </span>
          <span className="video-shoutout__title">{clip.title}</span>
        </div>
      </div>
    </div>
  );
}

function reportFailure(
  onPlaybackEvent: VideoShoutoutProps["onPlaybackEvent"],
  activationId: string,
  stage: "source-load",
  message: string,
  cause: unknown
): void {
  onPlaybackEvent?.({
    instructionId: activationId,
    status: "failed",
    failure: { referenceId: `err_${crypto.randomUUID()}`, stage, message, exception: serializeException(cause) }
  });
}
