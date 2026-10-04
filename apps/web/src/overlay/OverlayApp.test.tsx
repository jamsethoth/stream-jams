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
    const textLayer = screen.getByTestId("overlay-text-image-instruction");
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
    expect(textLayer).toHaveStyle({
      height: "80px",
      left: "10px",
      position: "absolute",
      top: "160px",
      width: "320px",
      zIndex: "6"
    });
    expect(text).toHaveAttribute("dir", "auto");
    expect(text).toHaveStyle({ fontSize: "32px" });
    expect(screen.getByTestId("overlay-root")).toHaveStyle({
      background: "transparent",
      height: "100vh",
      width: "100vw"
    });
    await waitFor(() =>
      expect(onPlaybackEvent).toHaveBeenCalledWith({
        instructionId: "image-instruction",
        status: "started",
        diagnostics: expect.objectContaining({ actualStartEpochMs: expect.any(Number) })
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
      failure: expect.objectContaining({
        referenceId: expect.stringMatching(/^err_/),
        stage: "source-load",
        message: "Image playback failed",
        exception: expect.objectContaining({ type: expect.any(String) })
      }),
      diagnostics: { terminalOutcome: "failed", actualStartEpochMs: expect.any(Number) }
    });
  });
});

describe("OverlayApp transport integration", () => {
  it("preserves streamed playback across timer compositions, but honors stop and module disable", async () => {
    AppFakeWebSocket.instances.length = 0;
    window.history.replaceState(null, "", "/overlay/unified/live/ovl_fixture");
    vi.stubGlobal("WebSocket", AppFakeWebSocket);
    const snapshot: OverlayComposition = { overlayId: "default", purpose: "live", scope: "unified", modules: ["alerts", "screen-effects", "timers"].map(moduleId => ({ moduleId, enabled: true, instructions: [] })) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));
    render(<OverlayApp />);
    await act(async () => { AppFakeWebSocket.instances[0]!.emitOpen(); AppFakeWebSocket.instances[0]!.emitMessage({ type: "overlay.playback.audio-state", muted: false }); });
    const socket = AppFakeWebSocket.instances[0]!;
    for (const moduleId of ["alerts", "screen-effects", "timers"]) {
      act(() => socket.emitMessage({ type: "overlay.playback", instruction: { ...createInstruction(moduleId, { text: `Playing ${moduleId}` }), moduleId, purpose: "live", scope: "unified" } }));
    }
    expect(await screen.findByText("Playing alerts")).toBeVisible();
    act(() => socket.emitMessage({ type: "overlay.composition", composition: snapshot }));
    for (const moduleId of ["alerts", "screen-effects", "timers"]) expect(screen.getByText(`Playing ${moduleId}`)).toBeVisible();
    act(() => socket.emitMessage({ type: "overlay.playback.stop", instructionIds: ["alerts"] }));
    act(() => socket.emitMessage({ type: "overlay.composition", composition: snapshot }));
    expect(screen.queryByText("Playing alerts")).toBeNull();
    act(() => socket.emitMessage({ type: "overlay.composition", composition: { ...snapshot, modules: snapshot.modules.map(module => ({ ...module, enabled: false })) } }));
    expect(screen.queryByText("Playing screen-effects")).toBeNull();
    act(() => socket.emitMessage({ type: "overlay.composition", composition: snapshot }));
    expect(screen.queryByText("Playing screen-effects")).toBeNull();
  });
  it("rebootstraps and completes fresh prepared playback after the real client socket reconnects", async () => {
    AppFakeWebSocket.instances.length = 0;
    window.history.replaceState(null, "", "/overlay/modules/alerts/live/ovl_live?profile=landscape");
    vi.stubGlobal("WebSocket", AppFakeWebSocket);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ...createComposition([createInstruction("visible-instruction", { text: "Visible before close" })]),
        targetProfileId: "landscape"
      })
    });
    vi.stubGlobal("fetch", fetcher);

    render(<OverlayApp />);
    await act(async () => {
      AppFakeWebSocket.instances[0]!.emitOpen();
      AppFakeWebSocket.instances[0]!.emitMessage({ type: "overlay.playback.audio-state", muted: false });
      await Promise.resolve();
    });
    expect(await screen.findByText("Visible before close")).toBeInTheDocument();
    vi.useFakeTimers();

    act(() => AppFakeWebSocket.instances[0]!.emitClose(1006));
    expect(screen.getByTestId("overlay-root")).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(999));
    expect(AppFakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(AppFakeWebSocket.instances).toHaveLength(2);
    const reconnected = AppFakeWebSocket.instances[1]!;
    await act(async () => {
      reconnected.emitOpen();
      reconnected.emitMessage({ type: "overlay.playback.audio-state", muted: false });
      await Promise.resolve();
    });
    const instruction = { ...createInstruction("after-reconnect", { text: "Recovered playback" }), purpose: "live" as const, targetProfileId: "landscape" as const };
    act(() => reconnected.emitMessage({ type: "overlay.playback.prepare", instruction }));
    await act(async () => {});
    expect(reconnected.sent.map(message => JSON.parse(message))).toContainEqual({ type: "overlay.playback.ready", instructionId: "after-reconnect" });
    act(() => reconnected.emitMessage({ type: "overlay.playback.start", instructionId: "after-reconnect", startsAtEpochMs: Date.now() + 100 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText("Recovered playback")).toBeVisible();
    expect(reconnected.sent.map(message => JSON.parse(message))).toContainEqual(expect.objectContaining({
      type: "overlay.playback.started", instructionId: "after-reconnect", diagnostics: expect.objectContaining({ actualStartEpochMs: expect.any(Number) })
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(reconnected.sent.map(message => JSON.parse(message))).toContainEqual(expect.objectContaining({
      type: "overlay.playback.completed", instructionId: "after-reconnect"
    }));
    expect(fetcher).toHaveBeenCalledTimes(2);
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

  emitOpen(): void {
    this.readyState = AppFakeWebSocket.OPEN;
    for (const listener of this.#listeners.get("open") ?? []) listener(new Event("open"));
  }

  emitMessage(message: unknown): void {
    for (const listener of this.#listeners.get("message") ?? []) {
      listener(new MessageEvent("message", { data: JSON.stringify(message) }));
    }
  }

  send(message: string): void {
    this.sent.push(message);
  }
}
