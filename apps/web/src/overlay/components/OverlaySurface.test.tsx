import type { OverlayComposition, OverlayInstruction } from "@stream-jams/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlaySurface } from "./OverlaySurface.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OverlaySurface", () => {
  it("renders animated shapes with target-profile geometry and preset timing", () => {
    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          shape: {
            fill: "#123456",
            layout: { x: 120, y: 80, width: 320, height: 240, zIndex: 5 }
          },
          animation: {
            mode: "preset",
            entrance: "scale",
            exit: "fade",
            durationMs: 450,
            delayMs: 120,
            easing: "ease-in-out"
          },
          durationMs: 4_000
        })}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(screen.getByTestId("overlay-shape-instruction-1")).toHaveStyle({
      animationDelay: "120ms, 3550ms",
      animationDuration: "450ms, 450ms",
      animationFillMode: "both, forwards",
      animationName: "overlay-enter-scale, overlay-exit-fade",
      animationTimingFunction: "ease-in-out, ease-in-out",
      background: "#123456",
      height: "240px",
      left: "120px",
      top: "80px",
      width: "320px",
      zIndex: "5"
    });
  });

  it("applies normalized audio volume to the media element", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          audio: { assetId: "asset-audio", volume: 0.35 }
        })}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect((screen.getByTestId("overlay-audio-instruction-1") as HTMLAudioElement).volume).toBe(0.35);
  });

  it("reports a browser-rejected audio start with an actionable failure", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("Playback requires user interaction", "NotAllowedError")
    );
    const onPlaybackEvent = vi.fn();

    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          audio: { assetId: "asset-audio", volume: 0.35 }
        })}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    await waitFor(() =>
      expect(onPlaybackEvent).toHaveBeenCalledWith({
        instructionId: "instruction-1",
        status: "failed",
        message: "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry."
      })
    );
  });
});

function instruction(): OverlayInstruction {
  return {
    id: "instruction-1",
    overlayId: "overlay-1",
    moduleId: "alerts",
    purpose: "live",
    scope: "module",
    targetProfileId: "landscape",
    visual: null,
    audio: null,
    text: null,
    tts: null,
    durationMs: 5_000
  };
}

function composition(value: OverlayInstruction): OverlayComposition {
  return {
    overlayId: "overlay-1",
    purpose: "live",
    scope: "module",
    targetProfileId: "landscape",
    modules: [{ moduleId: "alerts", enabled: true, instructions: [value] }]
  };
}
