import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import "../overlay.css";
import { monitorMediaProgress, prepareMediaAtStart, rgbaColorSchema, serializeException, targetProfileDefinitions, timerStackProjectionSchema, TimedMediaPreparationError } from "@stream-jams/core";
import type {
  PlaybackTimingMilestone,
  PlaybackTimingDiagnostics,
  OverlayComposition,
  OverlayElementLayout,
  OverlayInstruction,
  OverlayPresetAnimationInstruction,
  OverlayPlaybackFailure,
  OverlayPlaybackFailureStage
} from "@stream-jams/core";
import { alertTextLayerStyle } from "./alert-text-style.js";
import { useMediaVolumeEnvelope } from "../../media/use-media-volume-envelope.js";
import { TimerStack } from "./TimerStack.js";

export type OverlayPlaybackEvent =
  | { readonly instructionId: string; readonly status: "ready" }
  | { readonly instructionId: string; readonly status: "started"; readonly diagnostics?: PlaybackTimingMilestone }
  | { readonly instructionId: string; readonly status: "completed"; readonly diagnostics?: PlaybackTimingDiagnostics }
  | { readonly instructionId: string; readonly status: "failed"; readonly failure: OverlayPlaybackFailure; readonly diagnostics?: PlaybackTimingDiagnostics };

export interface OverlaySurfaceProps {
  readonly composition: OverlayComposition;
  readonly preparingInstructionIds?: ReadonlySet<string>;
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

export function OverlaySurface({ composition, preparingInstructionIds, muted = false, onPlaybackEvent, resolveAssetUrl }: OverlaySurfaceProps) {
  const [blockedTestAudioIds, setBlockedTestAudioIds] = useState<ReadonlySet<string>>(() => new Set());
  const rootElementRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth
  }));
  useEffect(() => {
    const updateViewport = (width: number, height: number) => setViewport((current) =>
      current.width === width && current.height === height ? current : { height, width });
    const updateWindowViewport = () => updateViewport(window.innerWidth, window.innerHeight);
    const rootElement = rootElementRef.current;
    const resizeObserver = rootElement === null || typeof ResizeObserver === "undefined" ? null : new ResizeObserver(([entry]) => {
      if (entry !== undefined) updateViewport(entry.contentRect.width, entry.contentRect.height);
    });
    if (rootElement !== null) resizeObserver?.observe(rootElement);
    window.addEventListener("resize", updateWindowViewport);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateWindowViewport);
    };
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
          preparing={preparingInstructionIds?.has(instruction.id) === true}
          muted={muted}
          visualVisible={moduleSnapshot.surfaceLayer?.visible !== false}
          onPlaybackEvent={onPlaybackEvent}
          onTestAudioBlockedChange={setTestAudioBlocked}
          resolveAssetUrl={resolveAssetUrl}
        />
      ))}
      {moduleSnapshot.surfaceLayer?.visible === false ? null : (
        <TimerPresentation
          presentation={moduleSnapshot.presentation}
          resolveAssetUrl={resolveAssetUrl}
        />
      )}
      </div>
    ));

  return (
    <div className="overlay-root" data-testid="overlay-root" ref={rootElementRef} style={overlayRootStyle}>
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

function TimerPresentation({
  presentation,
  resolveAssetUrl
}: {
  readonly presentation: OverlayComposition["modules"][number]["presentation"];
  readonly resolveAssetUrl: (assetId: string) => string;
}) {
  if (presentation?.kind !== "timer-stack") return null;
  const stack = timerStackProjectionSchema.safeParse(presentation.stack);
  return stack.success ? <TimerStack stack={stack.data} resolveAssetUrl={resolveAssetUrl} /> : null;
}

function OverlayInstructionLayer({
  instruction,
  preparing,
  muted,
  visualVisible,
  onPlaybackEvent,
  onTestAudioBlockedChange,
  resolveAssetUrl
}: {
  readonly instruction: OverlayInstruction;
  readonly preparing: boolean;
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
  const progressRef = useRef(new Map<HTMLMediaElement, ReturnType<typeof monitorMediaProgress>>());
  const diagnosticsRef = useRef<{ -readonly [K in keyof PlaybackTimingDiagnostics]?: PlaybackTimingDiagnostics[K] }>({});
  const naturalEndsRef = useRef(new Set<HTMLMediaElement>());
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const [videoStartedAt, setVideoStartedAt] = useState<number | null>(null);
  const [audioStartedAt, setAudioStartedAt] = useState<number | null>(null);
  const startedReportedRef = useRef(false);
  const startsAt = instruction.timing?.startsAtEpochMs;
  const endsAt = instruction.timing?.endsAtEpochMs;
  const timedVideo = startsAt !== undefined && instruction.visual?.mediaType === "video" && visualVisible;
  const hasTimedMedia = startsAt !== undefined && (instruction.audio !== null || timedVideo);
  const mediaStarted = (!timedVideo || videoStartedAt !== null) && (instruction.audio === null || audioStartedAt !== null);
  const audioDurationMs = instruction.audio?.playbackDurationMs ?? instruction.durationMs;
  const completionAt = hasTimedMedia ? Math.max(
    startsAt + instruction.durationMs,
    audioStartedAt === null ? 0 : audioStartedAt + audioDurationMs,
    videoStartedAt === null ? 0 : videoStartedAt + instruction.durationMs
  ) : endsAt;
  const [timingActive, setTimingActive] = useState(() => startsAt === undefined || (Date.now() >= startsAt && (hasTimedMedia || Date.now() < endsAt!)));
  const playbackActive = !preparing && timingActive && (startsAt === undefined || Date.now() >= startsAt);
  const [videoReady, setVideoReady] = useState(startsAt === undefined);
  const [videoEnded, setVideoEnded] = useState(false);
  const initialOffset = useRef(0);
  const audioElementRef = useRef<HTMLMediaElement | null>(null);
  const audioPreparationRef = useRef<AbortController | null>(null);
  const speechConsideredRef = useRef(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioStarted, setAudioStarted] = useState(instruction.audio === null && !presentationInvalid);
  const visualAssetId = instruction.visual?.assetId;
  const visualLoop = instruction.visual?.mediaType === "video" && instruction.visual.loop === true;
  const reportFailure = useCallback((stage: OverlayPlaybackFailureStage, message: string, cause: unknown) => {
    if (completionReportedRef.current) {
      return;
    }

    completionReportedRef.current = true;
    for (const [media, monitor] of progressRef.current) { monitor.stop(); media.pause(); }
    progressRef.current.clear();
    setTimingActive(false);
    onPlaybackEvent?.({
      instructionId: instruction.id,
      status: "failed",
      diagnostics: { ...diagnosticsRef.current, terminalOutcome: "failed", ...(stage === "stall" ? { completionReason: "stalled" } : {}) },
      failure: {
        referenceId: `err_${crypto.randomUUID()}`,
        stage,
        message,
        exception: serializeException(cause)
      }
    });
  }, [instruction.id, onPlaybackEvent]);

  const observeMedia = useCallback((element: HTMLMediaElement) => {
    diagnosticsRef.current.actualStartEpochMs ??= Date.now();
    progressRef.current.get(element)?.stop();
    naturalEndsRef.current.delete(element);
    progressRef.current.set(element, monitorMediaProgress(element, error => reportFailure("stall", "Media stopped advancing. Check the media file and retry.", element.error ?? error)));
  }, [reportFailure]);
  const finishMedia = useCallback((element: HTMLMediaElement | null) => {
    if (element === null) return true;
    const monitor = progressRef.current.get(element);
    if (monitor === undefined) return true;
    const healthy = monitor.finish();
    progressRef.current.delete(element);
    return healthy;
  }, []);
  const naturalEnd = useCallback((element: HTMLMediaElement) => {
    naturalEndsRef.current.add(element);
    progressRef.current.get(element)?.stop();
    progressRef.current.delete(element);
  }, []);
  useEffect(() => () => {
    for (const monitor of progressRef.current.values()) monitor.stop();
    progressRef.current.clear();
  }, []);
  useEffect(() => {
    if (startsAt !== undefined) diagnosticsRef.current.scheduledStartEpochMs = startsAt;
  }, [startsAt]);

  useEffect(() => {
    if (!preparing || presentationInvalid) return;
    const preparationStartedAt = Date.now();
    const controller = new AbortController();
    const media = [videoElementRef.current, audioElementRef.current].filter((element): element is HTMLMediaElement => element !== null);
    const image = imageElementRef.current;
    const imageReady = image === null || (image.complete && image.naturalWidth > 0) ? Promise.resolve() : new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); image.removeEventListener("load", loaded); image.removeEventListener("error", failed); controller.signal.removeEventListener("abort", aborted); };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new TimedMediaPreparationError("source-load", "Image could not load.")); };
      const aborted = () => { cleanup(); reject(new DOMException("Preparation cancelled", "AbortError")); };
      const timeout = window.setTimeout(failed, 5000);
      image.addEventListener("load", loaded); image.addEventListener("error", failed); controller.signal.addEventListener("abort", aborted, { once: true });
    });
    void Promise.all([imageReady, ...media.map(element => prepareMediaAtStart(element, { signal: controller.signal, deadlineMs: Date.now() + 5000 }))])
      .then(() => { if (!controller.signal.aborted && !completionReportedRef.current) { diagnosticsRef.current.preparationDurationMs = Math.min(300000, Date.now() - preparationStartedAt); onPlaybackEvent?.({ instructionId: instruction.id, status: "ready" }); } })
      .catch((error: unknown) => { if (!controller.signal.aborted) reportFailure(error instanceof TimedMediaPreparationError ? error.stage : "decode", "Media could not prepare for playback.", error); });
    return () => controller.abort();
  }, [preparing, instruction.id, presentationInvalid, onPlaybackEvent, reportFailure]);

  useEffect(() => {
    setVideoEnded(false);
  }, [instruction.id, visualAssetId, visualLoop, startsAt, endsAt]);

  useEffect(() => {
    if (startsAt === undefined || endsAt === undefined) return;
    setTimingActive(Date.now() >= startsAt && (hasTimedMedia || Date.now() < endsAt));
    const start = window.setTimeout(() => setTimingActive(hasTimedMedia || Date.now() < endsAt), Math.max(0, startsAt - Date.now()));
    const end = hasTimedMedia ? undefined : window.setTimeout(() => setTimingActive(false), Math.max(0, endsAt - Date.now()));
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [startsAt, endsAt, hasTimedMedia]);

  useEffect(() => {
    const video = videoElementRef.current;
    if (startsAt === undefined || endsAt === undefined || video === null) return;
    setVideoReady(false);
    if (!playbackActive || !visualVisible) return;
    const preparation = new AbortController();
    const deadline = Date.now() + 5000;
    const startTimer = window.setTimeout(() => {
      preparation.abort(); video.pause();
      reportFailure(video.readyState < 1 ? "metadata" : video.readyState < 2 ? "decode" : "play", "Video playback could not start before its preparation deadline.",
        new TimedMediaPreparationError(video.readyState < 1 ? "metadata" : video.readyState < 2 ? "decode" : "play", "Video playback preparation deadline exceeded."));
    }, Math.max(0, deadline - Date.now()));
    void prepareMediaAtStart(video, { signal: preparation.signal, deadlineMs: deadline })
      .then(() => { if (!preparation.signal.aborted) return video.play(); })
      .then(() => { if (!preparation.signal.aborted) { observeMedia(video); setVideoStartedAt(current => current ?? Date.now()); setVideoReady(true); } })
      .catch((error: unknown) => { if (!preparation.signal.aborted) { video.pause(); reportFailure(
        error instanceof TimedMediaPreparationError ? error.stage : "play",
        "Video playback could not start from the beginning.",
        error
      ); } })
      .finally(() => window.clearTimeout(startTimer));
    return () => { preparation.abort(); window.clearTimeout(startTimer); progressRef.current.get(video)?.stop(); progressRef.current.delete(video); video.pause(); };
  }, [startsAt, endsAt, visualVisible, timingActive, preparing, playbackActive, reportFailure, observeMedia]);

  useEffect(() => {
    if (!playbackActive || !audioStarted || presentationInvalid || (hasTimedMedia && !mediaStarted)) {
      return;
    }

    if (!startedReportedRef.current) {
      startedReportedRef.current = true;
      diagnosticsRef.current.actualStartEpochMs ??= Date.now();
      onPlaybackEvent?.({ instructionId: instruction.id, status: "started", diagnostics: {
        ...(diagnosticsRef.current.preparationDurationMs === undefined ? {} : { preparationDurationMs: diagnosticsRef.current.preparationDurationMs }),
        ...(diagnosticsRef.current.scheduledStartEpochMs === undefined ? {} : { scheduledStartEpochMs: diagnosticsRef.current.scheduledStartEpochMs }),
        actualStartEpochMs: diagnosticsRef.current.actualStartEpochMs
      } });
    }
    const timeoutId = window.setTimeout(() => {
      if (completionReportedRef.current) {
        return;
      }

      if (!finishMedia(audioElementRef.current) || !finishMedia(videoElementRef.current) || completionReportedRef.current) return;
      completionReportedRef.current = true;
      if (hasTimedMedia) setTimingActive(false);
      onPlaybackEvent?.({
        instructionId: instruction.id,
        status: "completed",
        diagnostics: { ...diagnosticsRef.current, terminalOutcome: "completed", completionReason: [audioElementRef.current, videoElementRef.current].filter(element => element !== null).length > 0 && [audioElementRef.current, videoElementRef.current].every(element => element === null || naturalEndsRef.current.has(element)) ? "natural-end" : "configured-duration" }
      });
    }, completionAt === undefined ? instruction.durationMs : Math.max(0, completionAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [audioStarted, instruction.durationMs, instruction.id, onPlaybackEvent, presentationInvalid, endsAt, preparing, timingActive, playbackActive, hasTimedMedia, mediaStarted, completionAt, finishMedia]);

  useEffect(() => {
    if (!hasTimedMedia || audioStartedAt === null) return;
    const element = audioElementRef.current;
    const timer = window.setTimeout(() => { finishMedia(element); element?.pause(); }, Math.max(0, audioStartedAt + audioDurationMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [hasTimedMedia, audioStartedAt, audioDurationMs, finishMedia]);

  useEffect(() => {
    if (!hasTimedMedia || videoStartedAt === null) return;
    const element = videoElementRef.current;
    const timer = window.setTimeout(() => { finishMedia(element); element?.pause(); setVideoEnded(true); }, Math.max(0, videoStartedAt + instruction.durationMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [hasTimedMedia, videoStartedAt, instruction.durationMs, finishMedia]);

  useEffect(() => {
    if (!presentationInvalid) return;
    onTestAudioBlockedChange(instruction.id, false);
    reportFailure("source-load", presentationFailureMessage, new Error(presentationFailureMessage));
  }, [instruction.id, onTestAudioBlockedChange, presentationFailureMessage, presentationInvalid, reportFailure]);

  useEffect(() => {
    if (
      !playbackActive || presentationInvalid ||
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
  }, [instruction.tts, muted, presentationInvalid, preparing, timingActive, playbackActive]);

  const audioAssetId = instruction.audio?.assetId ?? null;
  const audioVolume = instruction.audio?.volume ?? 1;
  useMediaVolumeEnvelope(audioElementRef, instruction.audio === null ? null : {
    volume: audioVolume,
    fadeInMs: instruction.audio.fadeInMs ?? 0,
    fadeOutMs: instruction.audio.fadeOutMs ?? 0,
    playbackDurationMs: instruction.audio.playbackDurationMs ?? instruction.durationMs,
    ...(audioStartedAt === null ? {} : { startsAtEpochMs: audioStartedAt }),
    muted: muted || preparing
  }, instruction.audio !== null);
  const startAudio = useCallback(() => {
    if (!playbackActive || presentationInvalid) return;
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
      reportFailure(element.readyState < 1 ? "metadata" : element.readyState < 2 ? "decode" : "play", "Audio playback could not start before its preparation deadline.",
        new TimedMediaPreparationError(element.readyState < 1 ? "metadata" : element.readyState < 2 ? "decode" : "play", "Audio playback preparation deadline exceeded."));
    }, 5000);
    preparation.signal.addEventListener("abort", () => window.clearTimeout(startTimer), { once: true });
    const play = () => active() ? element.play() : Promise.resolve();
    const starting = startsAt === undefined || endsAt === undefined ? play() : prepareMediaAtStart(element,
      { signal: preparation.signal, deadlineMs: Date.now() + 5000 }).then(play);
    void starting.then(() => {
      if (!active()) return;
      onTestAudioBlockedChange(instruction.id, false);
      setAudioBlocked(false);
      observeMedia(element);
      setAudioStartedAt(current => current ?? Date.now());
      setAudioStarted(true);
    }).catch((error: unknown) => {
      if (!active()) return;
      if (instruction.operatorTest === true && isAudioActivationBlocked(error)) {
        onTestAudioBlockedChange(instruction.id, true);
        setAudioBlocked(true);
        return;
      }

      element.pause();
      reportFailure(error instanceof TimedMediaPreparationError ? error.stage : "play", audioStartFailureMessage(error), error);
    }).finally(() => window.clearTimeout(startTimer));
  }, [
    preparing,
    timingActive,
    playbackActive,
    audioAssetId,
    audioVolume,
    startsAt,
    endsAt,
    instruction.id,
    instruction.operatorTest,
    onTestAudioBlockedChange,
    presentationInvalid,
    reportFailure,
    observeMedia
  ]);

  useEffect(() => {
    startAudio();
    const element = audioElementRef.current;
    return () => { audioPreparationRef.current?.abort(); if (element !== null) { progressRef.current.get(element)?.stop(); progressRef.current.delete(element); element.pause(); } };
  }, [startAudio]);

  useEffect(() => {
    if (!audioBlocked) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onTestAudioBlockedChange(instruction.id, false);
      const error = new DOMException("Playback requires user interaction", "NotAllowedError");
      reportFailure("play", audioStartFailureMessage(error), error);
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
      <div style={{ visibility: playbackActive && visualVisible ? "visible" : "hidden" }}>
      {instruction.visual === null ? null : instruction.visual.mediaType === "video" ? (
        <video
          autoPlay={!preparing && startsAt === undefined}
          preload="auto"
          loop={instruction.visual.loop ?? false}
          ref={videoElementRef}
          data-testid={`overlay-video-${instruction.id}`}
          muted={preparing || instruction.moduleId === "alerts" || instruction.moduleId === "screen-effects" || muted}
          onPlay={(event) => { if (startsAt === undefined && !preparing) observeMedia(event.currentTarget); }}
          onEnded={(event) => { if (!visualLoop) { naturalEnd(event.currentTarget); setVideoEnded(true); } }}
          onError={(event) => reportFailure("source-load", "Video playback failed", event.currentTarget.error ?? event.nativeEvent)}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={{ ...elementStyle(instruction.visual.layout, !playbackActive || !videoReady ? null : instruction.animation, instruction.durationMs, initialOffset.current), objectFit: "contain",
            ...(videoReady && !videoEnded ? {} : { visibility: "hidden" }) }}
        />
      ) : (
        <img
          alt=""
          ref={imageElementRef}
          data-testid={`overlay-visual-${instruction.id}`}
          onError={(event) => reportFailure("source-load", "Image playback failed", event.nativeEvent)}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={{ ...elementStyle(instruction.visual.layout, !playbackActive ? null : instruction.animation, instruction.durationMs, initialOffset.current), objectFit: "contain" }}
        />
      )}
      {instruction.text === null ? null : (
        <div
          className="overlay-text"
          data-testid={`overlay-text-${instruction.id}`}
          style={elementStyle(instruction.text.layout, !playbackActive ? null : instruction.animation, instruction.durationMs, initialOffset.current)}
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
            ...elementStyle(instruction.shape.layout, !playbackActive ? null : instruction.animation, instruction.durationMs, initialOffset.current),
            background: instruction.shape.fill
          }}
        />
      )}
      </div>
      {instruction.audio === null ? null : instruction.audio.sourceKind === "video-soundtrack" ? (
        <video
          data-testid={`overlay-audio-${instruction.id}`}
          onEnded={(event) => naturalEnd(event.currentTarget)}
          muted={preparing || muted}
          onError={(event) => {
            onTestAudioBlockedChange(instruction.id, false);
            reportFailure("source-load", "Audio playback failed. Confirm the video soundtrack is supported, then retry.", event.currentTarget.error ?? event.nativeEvent);
          }}
          preload="auto"
          ref={(element) => { audioElementRef.current = element; }}
          src={resolveAssetUrl(instruction.audio.assetId)}
          style={{ height: 0, position: "absolute", width: 0 }}
        />
      ) : (
        <audio
          data-testid={`overlay-audio-${instruction.id}`}
          onEnded={(event) => naturalEnd(event.currentTarget)}
          muted={preparing || muted}
          onError={(event) => {
            onTestAudioBlockedChange(instruction.id, false);
            reportFailure("source-load", "Audio playback failed. Confirm the audio file is supported, then retry.", event.currentTarget.error ?? event.nativeEvent);
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
