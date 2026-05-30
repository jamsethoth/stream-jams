import { useEffect, useRef, type CSSProperties } from "react";
import type { OverlayComposition, OverlayElementLayout, OverlayInstruction } from "@stream-jams/core";

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
  minHeight: "100vh",
  overflow: "hidden",
  position: "relative",
  width: "100vw"
};

export function OverlaySurface({ composition, onPlaybackEvent, resolveAssetUrl }: OverlaySurfaceProps) {
  return (
    <div className="overlay-root" data-testid="overlay-root" style={overlayRootStyle}>
      {composition.modules
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

  useEffect(() => {
    onPlaybackEvent?.({
      instructionId: instruction.id,
      status: "started"
    });
    const timeoutId = window.setTimeout(() => {
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

  const reportFailure = (message: string) => {
    if (completionReportedRef.current) {
      return;
    }

    onPlaybackEvent?.({
      instructionId: instruction.id,
      status: "failed",
      message
    });
  };

  return (
    <>
      {instruction.visual === null ? null : instruction.visual.mediaType === "video" ? (
        <video
          autoPlay
          data-testid={`overlay-video-${instruction.id}`}
          onError={() => reportFailure("Video playback failed")}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={layoutStyle(instruction.visual.layout)}
        />
      ) : (
        <img
          alt=""
          data-testid={`overlay-visual-${instruction.id}`}
          onError={() => reportFailure("Image playback failed")}
          src={resolveAssetUrl(instruction.visual.assetId)}
          style={layoutStyle(instruction.visual.layout)}
        />
      )}
      {instruction.text === null ? null : (
        <div className="overlay-text" data-testid={`overlay-text-${instruction.id}`} style={layoutStyle(instruction.text.layout)}>
          {instruction.text.text}
        </div>
      )}
      {instruction.audio === null ? null : (
        <audio
          autoPlay
          data-testid={`overlay-audio-${instruction.id}`}
          onError={() => reportFailure("Audio playback failed")}
          src={resolveAssetUrl(instruction.audio.assetId)}
        />
      )}
    </>
  );
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
