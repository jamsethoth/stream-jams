import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type OverlayComposition,
  type OverlayInstruction
} from "@stream-jams/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlaySurface } from "./OverlaySurface.js";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("OverlaySurface", () => {
  it("renders animated shapes with target-profile geometry and preset timing", () => {
    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          shape: {
            fill: "#123456FF",
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

  it("mutes audio and embedded video from authoritative playback state", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          visual: {
            assetId: "asset-video",
            mediaType: "video",
            layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
          },
          audio: { assetId: "asset-audio", volume: 1 }
        })}
        muted
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(screen.getByTestId("overlay-video-instruction-1")).toHaveProperty("muted", true);
    expect(screen.getByTestId("overlay-audio-instruction-1")).toHaveProperty("muted", true);
  });

  it("does not start browser speech late after an instruction begins muted", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      constructor(readonly text: string) {}
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel }
    });
    const speechInstruction: OverlayInstruction = {
      ...instruction(),
      tts: { mode: "browser-speech", text: "Hello", audioAssetId: null, providerPayload: null }
    };
    const { rerender } = render(
      <OverlaySurface
        composition={composition(speechInstruction)}
        muted
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    rerender(
      <OverlaySurface
        composition={composition(speechInstruction)}
        muted={false}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(speak).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
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

  it("lets an operator enable and retry audio blocked during a management test", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("Playback requires user interaction", "NotAllowedError"))
      .mockResolvedValueOnce();
    const onPlaybackEvent = vi.fn();

    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          operatorTest: true,
          audio: { assetId: "asset-audio", volume: 0.35 }
        })}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    const enableAudio = await screen.findByRole("button", { name: "Enable alert audio" });
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));

    await user.click(enableAudio);

    expect(play).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "instruction-1",
      status: "started"
    }));
    expect(screen.queryByRole("button", { name: "Enable alert audio" })).not.toBeInTheDocument();
  });

  it("reports blocked management-test audio when activation is not granted", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("Playback requires user interaction", "NotAllowedError")
    );
    const onPlaybackEvent = vi.fn();

    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          operatorTest: true,
          audio: { assetId: "asset-audio", volume: 0.35 }
        })}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", { name: "Enable alert audio" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));

    expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "instruction-1",
      status: "failed",
      message: "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry."
    });
  });

  it("uses one activation action to retry every blocked test-audio layer", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("Playback requires user interaction", "NotAllowedError"))
      .mockRejectedValueOnce(new DOMException("Playback requires user interaction", "NotAllowedError"))
      .mockResolvedValue();

    render(
      <OverlaySurface
        composition={compositionFromInstructions([
          { ...instruction(), operatorTest: true, audio: { assetId: "asset-one", volume: 0.35 } },
          { ...instruction(), id: "instruction-2", operatorTest: true, audio: { assetId: "asset-two", volume: 0.5 } }
        ])}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    const enableAudio = await screen.findByRole("button", { name: "Enable alert audio" });
    expect(screen.getAllByRole("button", { name: "Enable alert audio" })).toHaveLength(1);

    await user.click(enableAudio);

    expect(play).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("button", { name: "Enable alert audio" })).not.toBeInTheDocument();
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
              fill: "#123456FF",
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

  it("renders validated text and box styles", () => {
    render(
      <OverlaySurface
        composition={composition({
          ...instruction(),
          text: {
            text: "Styled alert",
            layout: { x: 120, y: 80, width: 320, height: 240, zIndex: 5 },
            textStyle: {
              ...compatibilityAlertTextStyle,
              fontPreset: "serif",
              fontSizePx: 64,
              fontWeight: 700,
              horizontalAlign: "left",
              verticalAlign: "bottom",
              color: "#FFCC00FF",
              shadow: null
            },
            boxStyle: {
              backgroundColor: "#102030BF",
              paddingPx: 24,
              cornerRadiusPx: 18,
              shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
            }
          }
        })}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    const styledAlert = screen.getByText("Styled alert");
    expect(styledAlert.style.backgroundColor).toBe("rgba(16, 32, 48, 0.75)");
    expect(styledAlert.style.borderRadius).toBe("18px");
    expect(styledAlert.style.boxShadow).toBe("4px 6px 12px #00000080");
    expect(styledAlert.style.color).toBe("rgb(255, 204, 0)");
    expect(styledAlert.style.fontFamily).toBe('Georgia, "Times New Roman", serif');
    expect(styledAlert.style.fontSize).toBe("64px");
    expect(styledAlert.style.fontWeight).toBe("700");
    expect(styledAlert.style.justifyContent).toBe("flex-end");
    expect(styledAlert.style.padding).toBe("24px");
    expect(styledAlert.style.textAlign).toBe("left");
    expect(styledAlert.style.textShadow).toBe("none");
  });

  it("fails closed and transparent when a forged text style is unsafe", async () => {
    const onPlaybackEvent = vi.fn();
    const unsafe = {
      ...instruction(),
      visual: {
        assetId: "asset-image",
        mediaType: "image",
        layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
      },
      audio: { assetId: "asset-audio", volume: 1 },
      text: {
        text: "Do not render",
        layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 2 },
        textStyle: { ...compatibilityAlertTextStyle, fontPreset: "remote-font" },
        boxStyle: compatibilityAlertTextBoxStyle
      },
      tts: { mode: "browser-speech", text: "Do not speak", audioAssetId: null, providerPayload: null }
    } as unknown as OverlayInstruction;

    render(
      <OverlaySurface
        composition={composition(unsafe)}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    await waitFor(() => expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "instruction-1",
      status: "failed",
      message: "Alert text style could not be rendered safely."
    }));
    expect(screen.queryByText("Do not render")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-visual-instruction-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-audio-instruction-1")).not.toBeInTheDocument();
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "started" }));
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("fails closed and transparent when a forged shape fill is unsafe", async () => {
    const onPlaybackEvent = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const unsafe = {
      ...instruction(),
      visual: {
        assetId: "asset-image",
        mediaType: "image",
        layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
      },
      audio: { assetId: "asset-audio", volume: 1 },
      shape: {
        fill: "url(https://example.test/shape.svg)",
        layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 2 }
      },
      tts: { mode: "browser-speech", text: "Do not speak", audioAssetId: null, providerPayload: null }
    } as unknown as OverlayInstruction;

    render(
      <OverlaySurface
        composition={composition(unsafe)}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    await waitFor(() => expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "instruction-1",
      status: "failed",
      message: "Alert shape fill could not be rendered safely."
    }));
    expect(screen.queryByTestId("overlay-shape-instruction-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-visual-instruction-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-audio-instruction-1")).not.toBeInTheDocument();
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "started" }));
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
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
  return compositionFromInstructions([value], targetProfileId);
}

function compositionFromInstructions(
  instructions: readonly OverlayInstruction[],
  targetProfileId: "landscape" | "vertical" = "landscape"
): OverlayComposition {
  return {
    overlayId: "overlay-1",
    purpose: "live",
    scope: "module",
    targetProfileId,
    modules: [{ moduleId: "alerts", enabled: true, instructions }]
  };
}
