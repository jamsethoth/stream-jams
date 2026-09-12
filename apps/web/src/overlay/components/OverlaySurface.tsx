import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { prepareTimedMedia, rgbaColorSchema, targetProfileDefinitions } from "@stream-jams/core";
import type {
  OverlayComposition,
  OverlayElementLayout,
  OverlayInstruction,
  OverlayPresetAnimationInstruction
} from "@stream-jams/core";
import { alertTextLayerStyle } from "./alert-text-style.js";

export interface OverlayPlaybackEvent {
  readonly instructionId: string;
  readonly status: "started" | "completed" | "failed";
  readonly message?: string;
}

export interface OverlaySurfaceProps {
  readonly composition: OverlayComposition;
  readonly muted?: boolean;
  readonly resolveAssetUrl: (assetId: string) => string;
  readonly onPlaybackEvent?: ((event: OverlayPlaybackEvent) => void) | undefined;
}

export const overlayRootStyle: CSSProperties = {
  background: "transparent",
  height: "100vh",
  overflow: "hidden",
  position: "relative",
  width: "100vw"
};

const testAudioActivationEvent = "stream-jams:test-audio-activation";

export function OverlaySurface({ composition, muted = false, onPlaybackEvent, resolveAssetUrl }: OverlaySurfaceProps) {
  const [blockedTestAudioIds, setBlockedTestAudioIds] = useState<ReadonlySet<string>>(() => new Set());
  const [viewport, setViewport] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth
  }));
  useEffect(() => {
    const updateViewport = () => setViewport({ height: window.innerHeight, width: window.innerWidth });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const setTestAudioBlocked = useCallback((instructionId: string, blocked: boolean) => {
    setBlockedTestAudioIds((current) => {
      const next = new Set(current);
      if (blocked) {
        next.add(instructionId);
      } else {
        next.delete(instructionId);
      }
      return next.size === current.size ? current : next;
    });
  }, []);
  const enableTestAudio = useCallback(() => {
    window.dispatchEvent(new Event(testAudioActivationEvent));
  }, []);
  useEffect(() => {
    const activeInstructionIds = new Set(
      composition.modules.flatMap((moduleSnapshot) => moduleSnapshot.instructions.map((instruction) => instruction.id))
    );
    setBlockedTestAudioIds((current) => {
      const next = new Set([...current].filter((instructionId) => activeInstructionIds.has(instructionId)));
      return next.size === current.size ? current : next;
    });
  }, [composition]);
  const profile = targetProfileDefinitions.find((candidate) => candidate.id === composition.targetProfileId);
  const instructions = composition.modules
    .filter((moduleSnapshot) => moduleSnapshot.enabled)
    .map((moduleSnapshot) => (
      <div key={moduleSnapshot.moduleId} data-testid={`overlay-module-${moduleSnapshot.moduleId}`}
        style={moduleSnapshot.surfaceLayer === undefined ? { display: "contents" } : {
          position: "absolute", inset: 0, isolation: "isolate", zIndex: moduleSnapshot.surfaceLayer.zIndex
        }}>
      {moduleSnapshot.instructions.map((instruction) => (
        <OverlayInstructionLayer
          instruction={instruction}
          key={instruction.id}
          muted={muted}
          visualVisible={moduleSnapshot.surfaceLayer?.visible !== false}
          onPlaybackEvent={onPlaybackEvent}
          onTestAudioBlockedChange={setTestAudioBlocked}
          resolveAssetUrl={resolveAssetUrl}
        />
      ))}
      </div>
    ));

  return (
    <div className="overlay-root" data-testid="overlay-root" style={overlayRootStyle}>
      {profile === undefined ? instructions : (
        <div
          data-testid="overlay-profile-canvas"
          style={{
            height: `${profile.height}px`,
            left: "50%",
            position: "absolute",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${Math.min(viewport.width / profile.width, viewport.height / profile.height)})`,
            transformOrigin: "center",
            width: `${profile.width}px`
          }}
        >
          {instructions}
        </div>
      )}
      {blockedTestAudioIds.size === 0 ? null : <AudioActivationPrompt onEnable={enableTestAudio} />}
    </div>
  );
}

function OverlayInstructionLayer({
  instruction,
  muted,
  visualVisible,
  onPlaybackEvent,
  onTestAudioBlockedChange,
  resolveAssetUrl
}: {
  readonly instruction: OverlayInstruction;
  readonly muted: boolean;
  readonly visualVisible: boolean;
  readonly resolveAssetUrl: (assetId: string) => string;
  readonly onPlaybackEvent?: ((event: OverlayPlaybackEvent) => void) | undefined;
  readonly onTestAudioBlockedChange: (instructionId: string, blocked: boolean) => void;
}) {
  const textPresentationStyle = instruction.text === null
    ? undefined
    : alertTextLayerStyle({
        textStyle: instruction.text.textStyle,
        boxStyle: instruction.text.boxStyle
      });
  const textPresentationInvalid = instruction.text !== null && textPresentationStyle === null;
  const shapePresentationInvalid = instruction.shape != null
    && !rgbaColorSchema.safeParse(instruction.shape.fill).success;
  const presentationInvalid = textPresentationInvalid || shapePresentationInvalid;
  const presentationFailureMessage = textPresentationInvalid
    ? "Alert text style could not be rendered safely."
    : "Alert shape fill could not be rendered safely.";
  const completionReportedRef = useRef(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoHasStartedRef = useRef(false);
  const startsAt = instruction.timing?.startsAtEpochMs;
  const endsAt = instruction.timing?.endsAtEpochMs;
  const [timingActive, setTimingActive] = useState(() => startsAt === undefined || (Date.now() >= startsAt && Date.now() < endsAt!));
  const [videoReady, setVideoReady] = useState(startsAt === undefined);
  const initialOffset = useRef(startsAt === undefined ? 0 : Math.max(0, Date.now() - startsAt));
  const audioElementRef = useRef<HTMLMediaElement | null>(null);
  const audioPreparationRef = useRef<AbortController | null>(null);
  const speechConsideredRef = useRef(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioStarted, setAudioStarted] = useState(instruction.audio === null && !presentationInvalid);
  const reportFailure = useCallback((message: string) => {
    if (completionReportedRef.current) {
      return;
    }

    completionReportedRef.current = true;
    onPlaybackEvent?.({
      instructionId: instruction.id,
      status: "failed",
      message
    });
  }, [instruction.id, onPlaybackEvent]);

  useEffect(() => {
    if (startsAt === undefined || endsAt === undefined) return;
    setTimingActive(Date.now() >= startsAt && Date.now() < endsAt);
    const start = window.setTimeout(() => setTimingActive(Date.now() < endsAt), Math.max(0, startsAt - Date.now()));
    const end = window.setTimeout(() => setTimingActive(false), Math.max(0, endsAt - Date.now()));
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [startsAt, endsAt]);

  useEffect(() => {
    const video = videoElementRef.current;
    if (startsAt === undefined || endsAt === undefined || video === null) return;
    setVideoReady(false);
    if (!visualVisible || !timingActive || Date.now() >= endsAt) return;
    const preparation = new AbortController();
    const deadline = Math.min(endsAt, (videoHasStartedRef.current ? Date.now() : startsAt) + 5000);
    const startTimer = window.setTimeout(() => {
      preparation.abort(); video.pause();
      reportFailure("Video playback could not start before its preparation deadline.");
    }, Math.max(0, deadline - Date.now()));
    void prepareTimedMedia(video, { startsAtEpochMs: startsAt, endsAtEpochMs: endsAt },
      { signal: preparation.signal, deadlineMs: deadline })
      .then(() => { if (!preparation.signal.aborted) return video.play(); })
      .then(() => { if (!preparation.signal.aborted && Date.now() < endsAt) { videoHasStartedRef.current = true; setVideoReady(true); } })
      .catch(() => { if (!preparation.signal.aborted) { video.pause(); reportFailure("Video playback could not start at the shared offset."); } })
      .finally(() => window.clearTimeout(startTimer));
    return () => { preparation.abort(); window.clearTimeout(startTimer); video.pause(); };
  }, [startsAt, endsAt, visualVisible, timingActive, reportFailure]);

  useEffect(() => {
    if (!audioStarted || presentationInvalid) {
      return;
    }

    onPlaybackEvent?.({
      instructionId: instruction.id,
      status: "started"
    });
    const timeoutId = window.setTimeout(() => {
      if (completionReportedRef.current) {
        return;
      }

      completionReportedRef.current = true;
      onPlaybackEvent?.({
        instructionId: instruction.id,
        status: "completed"
      });
    }, endsAt === undefined ? instruction.durationMs : Math.max(0, endsAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [audioStarted, instruction.durationMs, instruction.id, onPlaybackEvent, presentationInvalid, endsAt]);

  useEffect(() => {
    if (!presentationInvalid) return;
    onTestAudioBlockedChange(instruction.id, false);
    reportFailure(presentationFailureMessage);
  }, [instruction.id, onTestAudioBlockedChange, presentationFailureMessage, presentationInvalid, reportFailure]);

  useEffect(() => {
    if (
      presentationInvalid ||
      instruction.tts?.mode !== "browser-speech" ||
      typeof window.speechSynthesis === "undefined"
    ) {
      return;
    }

    if (!speechConsideredRef.current) {
      speechConsideredRef.current = true;
      if (!muted) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(instruction.tts.text));
      }
    }
    if (muted) {
      window.speechSynthesis.cancel();
    }
  }, [instruction.tts, muted, presentationInvalid]);

  const audioAssetId = instruction.audio?.assetId ?? null;
  const audioVolume = instruction.audio?.volume ?? 1;
  const startAudio = useCallback(() => {
    if (presentationInvalid) return;
    const element = audioElementRef.current;
    if (element === null || audioAssetId === null) {
      return;
    }

    audioPreparationRef.current?.abort();
    const preparation = new AbortController();
    audioPreparationRef.current = preparation;
    const active = () => !preparation.signal.aborted && !completionReportedRef.current;
    const startTimer = startsAt === undefined || endsAt === undefined ? undefined : window.setTimeout(() => {
      if (!active()) return;
      preparation.abort(); element.pause();
      reportFailure("Audio playback could not start before its preparation deadline.");
    }, Math.max(0, Math.min(endsAt, startsAt + 5000) - Date.now()));
    preparation.signal.addEventListener("abort", () => window.clearTimeout(startTimer), { once: true });
    element.volume = Math.min(1, Math.max(0, audioVolume));
    const play = () => active() ? element.play() : Promise.resolve();
    const starting = startsAt === undefined || endsAt === undefined ? play() : prepareTimedMedia(element,
      { startsAtEpochMs: startsAt, endsAtEpochMs: endsAt },
      { signal: preparation.signal, deadlineMs: Math.min(endsAt, startsAt + 5000) }).then(play);
    void starting.then(() => {
      if (!active()) return;
      onTestAudioBlockedChange(instruction.id, false);
      setAudioBlocked(false);
      setAudioStarted(true);
    }).catch((error: unknown) => {
      if (!active()) return;
      if (instruction.operatorTest === true && isAudioActivationBlocked(error)) {
        onTestAudioBlockedChange(instruction.id, true);
        setAudioBlocked(true);
        return;
      }

      element.pause();
      reportFailure(audioStartFailureMessage(error));
    }).finally(() => window.clearTimeout(startTimer));
  }, [
    audioAssetId,
    audioVolume,
    startsAt,
    endsAt,
    instruction.id,
    instruction.operatorTest,
    onTestAudioBlockedChange,
    presentationInvalid,
    reportFailure
  ]);

  useEffect(() => {
    startAudio();
    const element = audioElementRef.current;
    return () => { audioPreparationRef.current?.abort(); element?.pause(); };
  }, [startAudio]);

  useEffect(() => {
    if (!audioBlocked) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onTestAudioBlockedChange(instruction.id, false);
      reportFailure(audioStartFailureMessage(new DOMException("Playback requires user interaction", "NotAllowedError")));
    }, 30_000);
    return () => window.clearTimeout(timeoutId);
  }, [audioBlocked, instruction.id, onTestAudioBlockedChange, reportFailure]);

  useEffect(() => {
    if (!audioBlocked) {
      return;
    }

    const retry = () => startAudio();
    window.addEventListener(testAudioActivationEvent, retry);
    return () => window.removeEventListener(testAudioActivationEvent, retry);
  }, [audioBlocked, startAudio]);

  if (presentationInvalid) return null;

  return (
    <>
      <div style={{ visibility: visualVisible && timingActive ? "visible" : "hidden" }}>
      {instruction.visual === null ? null : instruction.visual.mediaType === "video" ? (
        <video
          autoPlay={startsAt === undefined}
          ref={videoElementRef}
          data-testid={`overlay-video-${instruction.id}`}
          muted={instruction.moduleId === "alerts" || muted}
          onError={() => reportFailure("Video playback failed")}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={{ ...elementStyle(instruction.visual.layout, instruction.animation, instruction.durationMs, initialOffset.current), objectFit: "contain",
            ...(videoReady ? {} : { visibility: "hidden" }) }}
        />
      ) : (
        <img
          alt=""
          data-testid={`overlay-visual-${instruction.id}`}
          onError={() => reportFailure("Image playback failed")}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={{ ...elementStyle(instruction.visual.layout, instruction.animation, instruction.durationMs, initialOffset.current), objectFit: "contain" }}
        />
      )}
      {instruction.text === null ? null : (
        <div
          className="overlay-text"
          data-testid={`overlay-text-${instruction.id}`}
          style={elementStyle(instruction.text.layout, instruction.animation, instruction.durationMs, initialOffset.current)}
        >
          <div className="alert-text-layer" dir="auto" style={textPresentationStyle ?? undefined}>
            {instruction.text.text}
          </div>
        </div>
      )}
      {instruction.shape == null ? null : (
        <div
          aria-hidden="true"
          className="overlay-shape"
          data-testid={`overlay-shape-${instruction.id}`}
          style={{
            ...elementStyle(instruction.shape.layout, instruction.animation, instruction.durationMs, initialOffset.current),
            background: instruction.shape.fill
          }}
        />
      )}
      </div>
      {instruction.audio === null ? null : instruction.audio.sourceKind === "video-soundtrack" ? (
        <video
          data-testid={`overlay-audio-${instruction.id}`}
          muted={muted}
          onError={() => {
            onTestAudioBlockedChange(instruction.id, false);
            reportFailure("Audio playback failed. Confirm the video soundtrack is supported, then retry.");
          }}
          preload="auto"
          ref={(element) => { audioElementRef.current = element; }}
          src={resolveAssetUrl(instruction.audio.assetId)}
          style={{ height: 0, position: "absolute", width: 0 }}
        />
      ) : (
        <audio
          data-testid={`overlay-audio-${instruction.id}`}
          muted={muted}
          onError={() => {
            onTestAudioBlockedChange(instruction.id, false);
            reportFailure("Audio playback failed. Confirm the audio file is supported, then retry.");
          }}
          preload="auto"
          ref={(element) => { audioElementRef.current = element; }}
          src={resolveAssetUrl(instruction.audio.assetId)}
        />
      )}
    </>
  );
}

export function AudioActivationPrompt({ onEnable }: { readonly onEnable: () => void }) {
  return (
    <div aria-live="polite" className="overlay-audio-activation" role="status">
      <strong>Enable audio for test alerts</strong>
      <span>Allow this browser source to play alert audio. In OBS, open Interact first.</span>
      <button onClick={onEnable} type="button">Enable alert audio</button>
    </div>
  );
}

function isAudioActivationBlocked(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "NotAllowedError";
}

function audioStartFailureMessage(error: unknown): string {
  if (isAudioActivationBlocked(error)) {
    return "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry.";
  }

  return "Audio playback could not start. Confirm the browser source is not muted and supports the audio file, then retry.";
}

function elementStyle(
  layout: OverlayElementLayout,
  animation: OverlayPresetAnimationInstruction | null | undefined,
  instructionDurationMs: number,
  elapsedMs = 0
): CSSProperties {
  return {
    ...layoutStyle(layout),
    ...overlayPresetAnimationStyle(animation, instructionDurationMs, elapsedMs)
  };
}

function layoutStyle(layout: OverlayElementLayout): CSSProperties {
  return {
    height: `${layout.height}px`,
    left: `${layout.x}px`,
    position: "absolute",
    top: `${layout.y}px`,
    width: `${layout.width}px`,
    zIndex: layout.zIndex
  };
}

export function overlayPresetAnimationStyle(
  animation: OverlayPresetAnimationInstruction | null | undefined,
  instructionDurationMs: number,
  elapsedMs = 0
): CSSProperties {
  if (animation == null) return {};
  const exitDelayMs = Math.max(
    animation.delayMs + animation.durationMs,
    instructionDurationMs - animation.durationMs
  );
  return {
    animationName: `${entranceAnimationName(animation.entrance)}, ${exitAnimationName(animation.exit)}`,
    animationDuration: `${animation.durationMs}ms, ${animation.durationMs}ms`,
    animationDelay: `${animation.delayMs - elapsedMs}ms, ${exitDelayMs - elapsedMs}ms`,
    animationTimingFunction: `${animation.easing}, ${animation.easing}`,
    animationFillMode: "both, forwards"
  };
}

function entranceAnimationName(preset: string): string {
  if (preset === "fade") return "overlay-enter-fade";
  if (preset === "scale") return "overlay-enter-scale";
  if (preset === "slide-up") return "overlay-enter-slide-up";
  return "none";
}

function exitAnimationName(preset: string): string {
  if (preset === "fade") return "overlay-exit-fade";
  if (preset === "scale") return "overlay-exit-scale";
  if (preset === "slide-down") return "overlay-exit-slide-down";
  return "none";
}
