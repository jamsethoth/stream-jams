import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { targetProfileDefinitions } from "@stream-jams/core";
import type {
  OverlayComposition,
  OverlayElementLayout,
  OverlayInstruction,
  OverlayPresetAnimationInstruction
} from "@stream-jams/core";

export interface OverlayPlaybackEvent {
  readonly instructionId: string;
  readonly status: "started" | "completed" | "failed";
  readonly message?: string;
}

export interface OverlaySurfaceProps {
  readonly composition: OverlayComposition;
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

export function OverlaySurface({ composition, onPlaybackEvent, resolveAssetUrl }: OverlaySurfaceProps) {
  const [viewport, setViewport] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth
  }));
  useEffect(() => {
    const updateViewport = () => setViewport({ height: window.innerHeight, width: window.innerWidth });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const profile = targetProfileDefinitions.find((candidate) => candidate.id === composition.targetProfileId);
  const instructions = composition.modules
    .filter((moduleSnapshot) => moduleSnapshot.enabled)
    .flatMap((moduleSnapshot) =>
      moduleSnapshot.instructions.map((instruction) => (
        <OverlayInstructionLayer
          instruction={instruction}
          key={instruction.id}
          onPlaybackEvent={onPlaybackEvent}
          resolveAssetUrl={resolveAssetUrl}
        />
      ))
    );

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
    </div>
  );
}

function OverlayInstructionLayer({
  instruction,
  onPlaybackEvent,
  resolveAssetUrl
}: {
  readonly instruction: OverlayInstruction;
  readonly resolveAssetUrl: (assetId: string) => string;
  readonly onPlaybackEvent?: ((event: OverlayPlaybackEvent) => void) | undefined;
}) {
  const completionReportedRef = useRef(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
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
    }, instruction.durationMs);

    return () => window.clearTimeout(timeoutId);
  }, [instruction.durationMs, instruction.id, onPlaybackEvent]);

  useEffect(() => {
    if (instruction.tts?.mode !== "browser-speech" || typeof window.speechSynthesis === "undefined") {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(instruction.tts.text);
    window.speechSynthesis.speak(utterance);
  }, [instruction.tts]);

  const audioAssetId = instruction.audio?.assetId ?? null;
  const audioVolume = instruction.audio?.volume ?? 1;
  useEffect(() => {
    const element = audioElementRef.current;
    if (element === null || audioAssetId === null) {
      return;
    }

    element.volume = Math.min(1, Math.max(0, audioVolume));
    void element.play().catch((error: unknown) => reportFailure(audioStartFailureMessage(error)));
  }, [audioAssetId, audioVolume, reportFailure]);

  return (
    <>
      {instruction.visual === null ? null : instruction.visual.mediaType === "video" ? (
        <video
          autoPlay
          data-testid={`overlay-video-${instruction.id}`}
          onError={() => reportFailure("Video playback failed")}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={elementStyle(instruction.visual.layout, instruction.animation, instruction.durationMs)}
        />
      ) : (
        <img
          alt=""
          data-testid={`overlay-visual-${instruction.id}`}
          onError={() => reportFailure("Image playback failed")}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={elementStyle(instruction.visual.layout, instruction.animation, instruction.durationMs)}
        />
      )}
      {instruction.text === null ? null : (
        <div
          className="overlay-text"
          data-testid={`overlay-text-${instruction.id}`}
          dir="auto"
          style={elementStyle(instruction.text.layout, instruction.animation, instruction.durationMs)}
        >
          {instruction.text.text}
        </div>
      )}
      {instruction.shape == null ? null : (
        <div
          aria-hidden="true"
          className="overlay-shape"
          data-testid={`overlay-shape-${instruction.id}`}
          style={{
            ...elementStyle(instruction.shape.layout, instruction.animation, instruction.durationMs),
            background: instruction.shape.fill
          }}
        />
      )}
      {instruction.audio === null ? null : (
        <audio
          data-testid={`overlay-audio-${instruction.id}`}
          onError={() => reportFailure("Audio playback failed. Confirm the audio file is supported, then retry.")}
          preload="auto"
          ref={audioElementRef}
          src={resolveAssetUrl(instruction.audio.assetId)}
        />
      )}
    </>
  );
}

function audioStartFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error && error.name === "NotAllowedError") {
    return "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry.";
  }

  return "Audio playback could not start. Confirm the browser source is not muted and supports the audio file, then retry.";
}

function elementStyle(
  layout: OverlayElementLayout,
  animation: OverlayPresetAnimationInstruction | null | undefined,
  instructionDurationMs: number
): CSSProperties {
  return {
    ...layoutStyle(layout),
    ...overlayPresetAnimationStyle(animation, instructionDurationMs)
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
