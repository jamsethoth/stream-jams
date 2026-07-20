import type { OverlayComposition, OverlayInstruction } from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayApp, OverlaySurface } from "./OverlayApp.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("OverlaySurface", () => {
  it("renders image, gif, video, text, and audio instruction shapes with overlay layout", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const onPlaybackEvent = vi.fn();

    render(
      <OverlaySurface
        composition={createComposition([
          createInstruction("image-instruction", {
            visual: {
              assetId: "asset-image",
              mediaType: "image"
            },
            text: "Thanks for following",
            audioAssetId: "asset-audio"
          }),
          createInstruction("gif-instruction", {
            visual: {
              assetId: "asset-gif",
              mediaType: "gif"
            }
          }),
          createInstruction("video-instruction", {
            visual: {
              assetId: "asset-video",
              mediaType: "video"
            }
          })
        ])}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/overlay/modules/alerts/test/ovl_moduleKey/assets/${assetId}`}
      />
    );

    const image = screen.getByTestId("overlay-visual-image-instruction");
    const gif = screen.getByTestId("overlay-visual-gif-instruction");
    const video = screen.getByTestId("overlay-video-video-instruction");
    const text = screen.getByText("Thanks for following");
    const audio = screen.getByTestId("overlay-audio-image-instruction");

    expect(image).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-image");
    expect(gif).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-gif");
    expect(video).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-video");
    expect(audio).toHaveAttribute("src", "/overlay/modules/alerts/test/ovl_moduleKey/assets/asset-audio");
    expect(image).toHaveStyle({
      height: "120px",
      left: "10px",
      position: "absolute",
      top: "20px",
      width: "320px",
      zIndex: "5"
    });
    expect(text).toHaveStyle({
      height: "80px",
      left: "10px",
      position: "absolute",
      top: "160px",
      width: "320px",
      zIndex: "6"
    });
    expect(text).toHaveAttribute("dir", "auto");
    expect(screen.getByTestId("overlay-root")).toHaveStyle({
      background: "transparent",
      height: "100vh",
      width: "100vw"
    });
    await waitFor(() =>
      expect(onPlaybackEvent).toHaveBeenCalledWith({
        instructionId: "image-instruction",
        status: "started"
      })
    );
  });

  it("does not render instructions for disabled module snapshots", () => {
    render(
      <OverlaySurface
        composition={{
          overlayId: "default",
          purpose: "test",
          scope: "module",
          modules: [
            {
              moduleId: "alerts",
              enabled: false,
              instructions: [
                createInstruction("disabled-instruction", {
                  text: "This should not appear"
                })
              ]
            }
          ]
        }}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(screen.queryByText("This should not appear")).not.toBeInTheDocument();
  });

  it("reports missing visual media as playback failure", () => {
    const onPlaybackEvent = vi.fn();
    render(
      <OverlaySurface
        composition={createComposition([
          createInstruction("missing-image", {
            visual: {
              assetId: "missing",
              mediaType: "image"
            }
          })
        ])}
        onPlaybackEvent={onPlaybackEvent}
        resolveAssetUrl={(assetId) => `/overlay/modules/alerts/test/ovl_moduleKey/assets/${assetId}`}
      />
    );

    fireEvent.error(screen.getByTestId("overlay-visual-missing-image"));

    expect(onPlaybackEvent).toHaveBeenCalledWith({
      instructionId: "missing-image",
      status: "failed",
      message: "Image playback failed"
    });
  });
});

describe("OverlayApp transport integration", () => {
  it("clears visible output when the real client socket closes unexpectedly", async () => {
    AppFakeWebSocket.instances.length = 0;
    window.history.replaceState(null, "", "/overlay/modules/alerts/live/ovl_live?profile=landscape");
    vi.stubGlobal("WebSocket", AppFakeWebSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ...createComposition([createInstruction("visible-instruction", { text: "Visible before close" })]),
        targetProfileId: "landscape"
      })
    }));

    render(<OverlayApp />);
    expect(await screen.findByText("Visible before close")).toBeInTheDocument();
    vi.useFakeTimers();

    act(() => AppFakeWebSocket.instances[0]!.emitClose(1006));
    expect(screen.getByTestId("overlay-root")).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(999));
    expect(AppFakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(AppFakeWebSocket.instances).toHaveLength(2);
  });
});

function createComposition(instructions: readonly OverlayInstruction[]): OverlayComposition {
  return {
    overlayId: "default",
    purpose: "test",
    scope: "module",
    modules: [
      {
        moduleId: "alerts",
        enabled: true,
        instructions
      }
    ]
  };
}

function createInstruction(
  id: string,
  options: {
    readonly visual?: {
      readonly assetId: string;
      readonly mediaType: "image" | "gif" | "video";
    };
    readonly text?: string;
    readonly audioAssetId?: string;
  }
): OverlayInstruction {
  return {
    id,
    overlayId: "default",
    moduleId: "alerts",
    purpose: "test",
    scope: "module",
    visual:
      options.visual === undefined
        ? null
        : {
            assetId: options.visual.assetId,
            mediaType: options.visual.mediaType,
            layout: {
              x: 10,
              y: 20,
              width: 320,
              height: 120,
              zIndex: 5
            }
          },
    audio:
      options.audioAssetId === undefined
        ? null
        : {
            assetId: options.audioAssetId,
            volume: 0.75
          },
    text:
      options.text === undefined
        ? null
        : {
            text: options.text,
            layout: {
              x: 10,
              y: 160,
              width: 320,
              height: 80,
              zIndex: 6
            }
          },
    tts: null,
    durationMs: 4000
  };
}

class AppFakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly instances: AppFakeWebSocket[] = [];
  readonly close = vi.fn();
  readonly sent: string[] = [];
  readyState = AppFakeWebSocket.CONNECTING;
  readonly #listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(readonly url: string) {
    AppFakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  emitClose(code: number): void {
    this.readyState = AppFakeWebSocket.CLOSED;
    for (const listener of this.#listeners.get("close") ?? []) listener({ code } as CloseEvent);
  }

  send(message: string): void {
    this.sent.push(message);
  }
}
