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

  it.each([
    ["Landscape canonical", "landscape", 1_920, 1_080, 1_920, 1_080, 1],
    ["Landscape noncanonical", "landscape", 960, 1_080, 1_920, 1_080, 0.5],
    ["Vertical canonical", "vertical", 1_080, 1_920, 1_080, 1_920, 1],
    ["Vertical noncanonical", "vertical", 1_080, 1_080, 1_080, 1_920, 0.5625]
  ] as const)(
    "scales and centers the %s fixed profile without changing profile-pixel geometry",
    (_name, profileId, viewportWidth, viewportHeight, profileWidth, profileHeight, scale) => {
      setViewport(viewportWidth, viewportHeight);
      render(
        <OverlaySurface
          composition={composition({
            ...instruction(),
            targetProfileId: profileId,
            shape: {
              fill: "#123456",
              layout: { x: 120, y: 80, width: 320, height: 240, zIndex: 5 }
            }
          }, profileId)}
          resolveAssetUrl={(assetId) => `/assets/${assetId}`}
        />
      );

      expect(screen.getByTestId("overlay-root")).toHaveStyle({
        background: "transparent",
        height: "100vh",
        width: "100vw"
      });
      expect(screen.getByTestId("overlay-profile-canvas")).toHaveStyle({
        height: `${profileHeight}px`,
        left: "50%",
        position: "absolute",
        top: "50%",
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center",
        width: `${profileWidth}px`
      });
      expect(screen.getByTestId("overlay-shape-instruction-1")).toHaveStyle({
        height: "240px",
        left: "120px",
        top: "80px",
        width: "320px"
      });
    }
  );

  it("lets user-generated text determine its own direction", () => {
    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          text: {
            text: "مرحبا Viewer",
            layout: { x: 120, y: 80, width: 320, height: 240, zIndex: 5 }
          }
        })}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(screen.getByText("مرحبا Viewer")).toHaveAttribute("dir", "auto");
  });
});

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

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

function composition(
  value: OverlayInstruction,
  targetProfileId: "landscape" | "vertical" = "landscape"
): OverlayComposition {
  return {
    overlayId: "overlay-1",
    purpose: "live",
    scope: "module",
    targetProfileId,
    modules: [{ moduleId: "alerts", enabled: true, instructions: [value] }]
  };
}
