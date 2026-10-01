import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type OverlayComposition,
  type OverlayInstruction
} from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlaySurface } from "./OverlaySurface.js";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OverlaySurface", () => {
  it("resolves each concurrent occurrence against its own immutable asset version", () => {
    const first = { ...instruction(), id: "first", assetVersions: { image: "a".repeat(64) },
      visual: { assetId: "image", mediaType: "image" as const, layout: { x: 0, y: 0, width: 10, height: 10, zIndex: 0 } } };
    const second = { ...first, id: "second", assetVersions: { image: "b".repeat(64) } };
    const resolve = vi.fn((id: string, version?: string) => `/assets/${id}?version=${version}`);
    const { container } = render(<OverlaySurface composition={compositionFromInstructions([first, second])} resolveAssetUrl={resolve} />);
    expect([...container.querySelectorAll("img")].map(element => element.getAttribute("src")))
      .toEqual([`/assets/image?version=${"a".repeat(64)}`, `/assets/image?version=${"b".repeat(64)}`]);
  });
  it("fails stalled media and never reports timer completion", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn();
    const value = { ...instruction(), durationMs: 1000, audio: { assetId: "clip", volume: 1 } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.wav"} onPlaybackEvent={events} />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ stage: "stall" }) }));
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });
  it("detects a sustained post-start stall and the next instruction recovers", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn(); const value = { ...instruction(), audio: { assetId: "clip", volume: 1 } };
    const props = { resolveAssetUrl: () => "/clip.wav", onPlaybackEvent: events };
    const { rerender, unmount } = render(<OverlaySurface composition={composition(value)} {...props} />);
    await act(async () => {});
    const media = screen.getByTestId("overlay-audio-instruction-1") as HTMLMediaElement;
    media.currentTime = 0.5;
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.waiting(media);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", diagnostics: expect.objectContaining({ completionReason: "stalled" }) }));
    const next = { ...value, id: "next" };
    rerender(<OverlaySurface composition={composition(next)} {...props} />);
    await act(async () => {});
    const nextMedia = screen.getByTestId("overlay-audio-next") as HTMLMediaElement;
    fireEvent.ended(nextMedia);
    await act(async () => { await vi.advanceTimersByTimeAsync(next.durationMs); });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ instructionId: "next", status: "completed", diagnostics: expect.objectContaining({ completionReason: "natural-end" }) }));
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("allows muted progressing playback after transient waiting and loop wrap", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn(); const value = { ...instruction(), durationMs: 3000, audio: { assetId: "clip", volume: 1 } };
    render(<OverlaySurface muted composition={composition(value)} resolveAssetUrl={() => "/clip.wav"} onPlaybackEvent={events} />);
    await act(async () => {});
    const media = screen.getByTestId("overlay-audio-instruction-1") as HTMLMediaElement;
    fireEvent.waiting(media);
    await act(async () => { await vi.advanceTimersByTimeAsync(1250); });
    media.currentTime = 1; await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    media.currentTime = 0; await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", diagnostics: expect.objectContaining({ completionReason: "configured-duration" }) }));
  });
  it("classifies metadata-only startup timeout as decode failure", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000); const events = vi.fn();
    const value: OverlayInstruction = { ...instruction(), timing: { startsAtEpochMs: 1000, endsAtEpochMs: 6000 },
      visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} onPlaybackEvent={events} />);
    const video = screen.getByTestId("overlay-video-instruction-1");
    Object.defineProperty(video, "readyState", { configurable: true, value: 1 }); fireEvent.loadedMetadata(video);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ stage: "decode" }) }));
  });
  it("finishes each mixed media interval without extra audio while the later video completes", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const starts = new Map<HTMLMediaElement, () => void>();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function(this: HTMLMediaElement) { return new Promise<void>(resolve => { starts.set(this, resolve); }); });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause); const events = vi.fn();
    const value: OverlayInstruction = { ...instruction(), durationMs: 1000, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 2000 }, audio: { assetId: "sound", volume: 0.5 },
      visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} onPlaybackEvent={events} />);
    const audio = screen.getByTestId("overlay-audio-instruction-1") as HTMLMediaElement;
    const video = screen.getByTestId("overlay-video-instruction-1") as HTMLMediaElement;
    for (const element of [audio, video]) { Object.defineProperty(element, "readyState", { configurable: true, value: 2 }); fireEvent.loadedData(element); }
    await act(async () => { await vi.advanceTimersByTimeAsync(170); starts.get(audio)!(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(130); starts.get(video)!(); });
    simulateProgress(audio); simulateProgress(video);
    pause.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(870); });
    expect(pause.mock.contexts).toContain(audio); expect(pause.mock.contexts).not.toContain(video);
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(video).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(130); });
    expect(events).toHaveBeenCalledWith({ instructionId: value.id, status: "completed", diagnostics: expect.objectContaining({ terminalOutcome: "completed" }) });
    expect(starts.size).toBe(2);
  });
  it.each(["audio", "video"])("preserves the full %s interval when play starts 170ms late", async kind => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    let started!: () => void;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => new Promise<void>(resolve => { started = resolve; }));
    const events = vi.fn();
    const value: OverlayInstruction = { ...instruction(), durationMs: 1000, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 2000 },
      ...(kind === "audio" ? { audio: { assetId: "clip", volume: 0.4 } } : { visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } }) };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} onPlaybackEvent={events} />);
    const element = screen.getByTestId(`overlay-${kind}-instruction-1`) as HTMLMediaElement;
    Object.defineProperty(element, "readyState", { configurable: true, value: 2 }); fireEvent.loadedData(element);
    await act(async () => { await vi.advanceTimersByTimeAsync(170); started(); });
    simulateProgress(element);
    await act(async () => { await vi.advanceTimersByTimeAsync(830); });
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(element).toBeVisible();
    if (kind === "audio") expect(element.volume).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(169); });
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(events).toHaveBeenCalledWith({ instructionId: value.id, status: "completed", diagnostics: expect.objectContaining({ terminalOutcome: "completed" }) });
    expect(element.currentTime).toBeGreaterThan(0); expect(element.playbackRate).toBe(1);
  });
  it("waits for prepared images to load before acknowledging readiness", async () => {
    const events = vi.fn();
    const value = { ...instruction(), visual: { assetId: "image", mediaType: "image" as const, layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 } } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/image.png"} onPlaybackEvent={events} preparingInstructionIds={new Set([value.id])} />);
    await act(async () => {});
    expect(events).not.toHaveBeenCalled();
    fireEvent.load(screen.getByTestId("overlay-visual-instruction-1"));
    await act(async () => {});
    expect(events).toHaveBeenCalledWith({ instructionId: value.id, status: "ready" });
  });
  it("prepares the retained media silently then starts from zero at the scheduled epoch", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn();
    const value = { ...instruction(), audio: { assetId: "clip", volume: 0.4 } };
    const props = { resolveAssetUrl: () => "/clip.webm", onPlaybackEvent: events };
    const view = render(<OverlaySurface {...props} composition={composition(value)} preparingInstructionIds={new Set([value.id])} />);
    const media = screen.getByTestId("overlay-audio-instruction-1");
    Object.defineProperty(media, "readyState", { configurable: true, value: 2 });
    fireEvent.loadedData(media);
    await act(async () => { await Promise.resolve(); });
    expect(play).not.toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith({ instructionId: value.id, status: "ready" });
    view.rerender(<OverlaySurface {...props} composition={composition({ ...value, timing: { startsAtEpochMs: 1100, endsAtEpochMs: 5100 } })} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(99); });
    expect(play).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByTestId("overlay-audio-instruction-1")).toBe(media);
    expect(media).toHaveProperty("currentTime", 0);
    expect(media).toHaveProperty("playbackRate", 1);
    expect(play).toHaveBeenCalledTimes(1);
  });
  it("honors the saved visual loop setting", () => {
    const value = { ...instruction(), visual: { assetId: "video", mediaType: "video" as const, loop: true,
      layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/video.webm"} />);
    expect(screen.getByTestId("overlay-video-instruction-1")).toHaveProperty("loop", true);
  });

  it.each([
    { loop: false, visibleAfterEnding: false },
    { loop: true, visibleAfterEnding: true }
  ])("keeps a video visible after ended=$visibleAfterEnding when loop=$loop", ({ loop, visibleAfterEnding }) => {
    const value = { ...instruction(), visual: { assetId: "video", mediaType: "video" as const, loop,
      layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/video.webm"} />);
    const video = screen.getByTestId("overlay-video-instruction-1");

    fireEvent.ended(video);

    expect(video).toHaveStyle({ visibility: visibleAfterEnding ? "visible" : "hidden" });
  });

  it("uses a hidden video media element for a routed video soundtrack", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const value = {
      ...instruction(),
      audio: { assetId: "asset-video", volume: 0.35, sourceKind: "video-soundtrack" }
    } as unknown as OverlayInstruction;

    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} />);

    const soundtrack = screen.getByTestId("overlay-audio-instruction-1");
    expect(soundtrack.tagName).toBe("VIDEO");
    expect(soundtrack).toHaveStyle({ height: "0px", position: "absolute", width: "0px" });
    expect(soundtrack).toHaveProperty("muted", false);
  });

  it.each(["audio", "video"])("bounds timed %s startup through play promise fulfillment", async kind => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => new Promise(() => {}));
    const events = vi.fn();
    const value: OverlayInstruction = { ...instruction(), timing: { startsAtEpochMs: 1000, endsAtEpochMs: 11000 },
      ...(kind === "audio" ? { audio: { assetId: "clip", volume: 0.4 } } : { visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } }) };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} onPlaybackEvent={events} />);
    const element = screen.getByTestId(`overlay-${kind}-instruction-1`);
    Object.defineProperty(element, "readyState", { configurable: true, value: 2 });
    fireEvent.loadedMetadata(element);
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(events.mock.calls.some(([event]) => event.status === "failed")).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ instructionId: value.id, status: "failed" }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
  it("waits for the shared epoch before starting browser audio and cancels pending starts", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const value = { ...instruction(), audio: { assetId: "video", volume: 0.4 }, timing: { startsAtEpochMs: 1100, endsAtEpochMs: 6100 } };
    const { unmount } = render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} />);
    const audio = screen.getByTestId("overlay-audio-instruction-1");
    Object.defineProperty(audio, "readyState", { configurable: true, value: 2 });
    await act(async () => { await vi.advanceTimersByTimeAsync(99); });
    expect(play).not.toHaveBeenCalled();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(play).not.toHaveBeenCalled();
  });

  it("starts late browser soundtrack at zero and preserves its full duration", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn();
    const value = { ...instruction(), audio: { assetId: "video", volume: 0.4 }, timing: { startsAtEpochMs: 1100, endsAtEpochMs: 6100 } };
    render(<OverlaySurface composition={composition(value)} resolveAssetUrl={() => "/clip.webm"} onPlaybackEvent={events} />);
    const audio = screen.getByTestId("overlay-audio-instruction-1") as HTMLAudioElement;
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(play).not.toHaveBeenCalled();
    Object.defineProperty(audio, "readyState", { configurable: true, value: 2 });
    fireEvent.loadedMetadata(audio);
    await act(async () => {});
    expect(audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
    simulateProgress(audio);
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(events).toHaveBeenCalledWith({ instructionId: value.id, status: "completed", diagnostics: expect.objectContaining({ terminalOutcome: "completed" }) });
  });
  it("starts timed video at zero before reveal and preserves its full duration", async () => {
    vi.useFakeTimers(); vi.setSystemTime(4000);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn();
    const value = { ...instruction(), timing: { startsAtEpochMs: 1000, endsAtEpochMs: 6000 },
      visual: { assetId: "video", mediaType: "video" as const, layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } } };
    const resolveAssetUrl = () => "/video.webm";
    const make = (visible: boolean): OverlayComposition => ({ ...composition(value), modules: [
      { moduleId: "alerts", enabled: true, surfaceLayer: { visible, zIndex: 0 }, instructions: [value] }
    ] });
    const { rerender } = render(<OverlaySurface composition={make(true)} resolveAssetUrl={resolveAssetUrl} onPlaybackEvent={events} />);
    const video = screen.getByTestId("overlay-video-instruction-1") as HTMLVideoElement;
    expect(video).not.toBeVisible();
    Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0);
    fireEvent.seeked(video);
    await act(async () => {});
    expect(video).toBeVisible();
    expect(play).toHaveBeenCalledOnce();
    rerender(<OverlaySurface composition={make(false)} resolveAssetUrl={resolveAssetUrl} onPlaybackEvent={events} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    rerender(<OverlaySurface composition={make(true)} resolveAssetUrl={resolveAssetUrl} onPlaybackEvent={events} />);
    expect(video).not.toBeVisible();
    expect(video.currentTime).toBe(0);
    fireEvent.seeked(video);
    await act(async () => {});
    expect(video).toBeVisible();
    simulateProgress(video);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(events).toHaveBeenCalledWith({ instructionId: value.id, status: "completed", diagnostics: expect.objectContaining({ terminalOutcome: "completed" }) });
    expect(video).not.toBeVisible();
  });

  it("gives a timed video a fresh preparation window when first shown late", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const events = vi.fn();
    const value = {
      ...instruction(),
      timing: { startsAtEpochMs: 1000, endsAtEpochMs: 20000 },
      visual: { assetId: "video", mediaType: "video" as const, layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } }
    };
    const make = (visible: boolean): OverlayComposition => ({
      ...composition(value),
      modules: [{ moduleId: "alerts", enabled: true, surfaceLayer: { visible, zIndex: 0 }, instructions: [value] }]
    });
    const props = { resolveAssetUrl: () => "/video.webm", onPlaybackEvent: events };
    const { rerender } = render(<OverlaySurface composition={make(false)} {...props} />);
    const video = screen.getByTestId("overlay-video-instruction-1") as HTMLVideoElement;

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    rerender(<OverlaySurface composition={make(true)} {...props} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(events).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0);
    fireEvent.seeked(video);
    await act(async () => {});
    expect(play).toHaveBeenCalledOnce();
    expect(video).toBeVisible();
  });

  it("retains media nodes and audio playback when surface layers reorder or hide", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const value = { ...instruction(), visual: { assetId: "video", mediaType: "video" as const,
      layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 999999 } }, audio: { assetId: "sound", volume: 1 } };
    const make = (visible: boolean, zIndex: number): OverlayComposition => ({ ...composition(value), modules: [
      { moduleId: "alerts", enabled: true, surfaceLayer: { visible, zIndex }, instructions: [value] }
    ] });
    const resolveAssetUrl = (id: string) => `/assets/${id}`;
    const { rerender } = render(<OverlaySurface composition={make(true, 1)} resolveAssetUrl={resolveAssetUrl} />);
    const video = screen.getByTestId("overlay-video-instruction-1");
    const audio = screen.getByTestId("overlay-audio-instruction-1");
    rerender(<OverlaySurface composition={make(false, 2)} resolveAssetUrl={resolveAssetUrl} />);
    expect(screen.getByTestId("overlay-module-alerts")).toHaveStyle({ isolation: "isolate", zIndex: "2" });
    expect(screen.getByTestId("overlay-video-instruction-1")).toBe(video);
    expect(video).not.toBeVisible();
    expect(screen.getByTestId("overlay-audio-instruction-1")).toBe(audio);
    expect(audio).toBeVisible();
    expect(play).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    rerender(<OverlaySurface composition={make(true, 0)} resolveAssetUrl={resolveAssetUrl} />);
    expect(video).toBeVisible();
  });

  it.each(["live", "test"] as const)("keeps alert videos silent in %s even when the output is unmuted", (purpose) => {
    const value = { ...instruction(), purpose, visual: {
      assetId: "legacy-video", mediaType: "video" as const,
      layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
    } };
    const { rerender } = render(<OverlaySurface composition={composition(value)} muted={false} resolveAssetUrl={(id) => `/assets/${id}`} />);
    expect(screen.getByTestId("overlay-video-instruction-1")).toHaveProperty("muted", true);
    rerender(<OverlaySurface composition={composition({ ...value, moduleId: "video-shoutout" })} muted={false} resolveAssetUrl={(id) => `/assets/${id}`} />);
    expect(screen.getByTestId("overlay-video-instruction-1")).toHaveProperty("muted", false);
  });

  it("keeps Screen Effect video sound exclusively on its normalized audio element", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const value = { ...instruction(), moduleId: "screen-effects", visual: {
      assetId: "effect-video", mediaType: "video" as const,
      layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
    }, audio: { assetId: "effect-video", volume: 1, sourceKind: "video-soundtrack" as const } };
    const { rerender } = render(<OverlaySurface composition={composition(value)} muted={false} resolveAssetUrl={(id) => `/assets/${id}`} />);

    expect(screen.getByTestId("overlay-video-instruction-1")).toHaveProperty("muted", true);
    expect(screen.getByTestId("overlay-audio-instruction-1")).toHaveProperty("muted", false);
    rerender(<OverlaySurface composition={composition({ ...value, audio: null })} muted={false} resolveAssetUrl={(id) => `/assets/${id}`} />);
    expect(screen.getByTestId("overlay-video-instruction-1")).toHaveProperty("muted", true);
    expect(screen.queryByTestId("overlay-audio-instruction-1")).not.toBeInTheDocument();
  });

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
      expect(onPlaybackEvent).toHaveBeenCalledWith(expect.objectContaining({
        instructionId: "instruction-1",
        status: "failed",
        failure: expect.objectContaining({
          stage: "play",
          message: "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry.",
          exception: expect.objectContaining({ type: "NotAllowedError", message: "Playback requires user interaction" })
        })
      }))
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
      status: "started",
      diagnostics: expect.objectContaining({ actualStartEpochMs: expect.any(Number) })
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

    expect(onPlaybackEvent).toHaveBeenCalledWith(expect.objectContaining({
      instructionId: "instruction-1",
      status: "failed",
      failure: expect.objectContaining({ stage: "play", message: "Audio playback was blocked by the browser. Enable autoplay for this browser source, then retry." })
    }));
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

  it("remeasures the profile canvas when its root changes size without a window resize event", () => {
    let notifyResize: ResizeObserverCallback | undefined;
    const observer: ResizeObserver = {
      disconnect: vi.fn(),
      observe: vi.fn(),
      unobserve: vi.fn()
    };
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      disconnect = observer.disconnect;
      observe = observer.observe;
      unobserve = observer.unobserve;
    });
    setViewport(2_560, 1_392);
    render(
      <OverlaySurface
        composition={composition(instruction())}
        resolveAssetUrl={(assetId) => `/assets/${assetId}`}
      />
    );

    expect(screen.getByTestId("overlay-profile-canvas")).toHaveStyle({
      transform: `translate(-50%, -50%) scale(${1_392 / 1_080})`
    });
    expect(notifyResize).toBeTypeOf("function");

    act(() => {
      notifyResize!([{
        contentRect: { width: 2_560, height: 1_440 }
      } as ResizeObserverEntry], observer);
    });

    expect(screen.getByTestId("overlay-profile-canvas")).toHaveStyle({
      transform: `translate(-50%, -50%) scale(${1_440 / 1_080})`
    });
  });

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

    await waitFor(() => expect(onPlaybackEvent).toHaveBeenCalledWith(expect.objectContaining({
      instructionId: "instruction-1",
      status: "failed",
      failure: expect.objectContaining({ stage: "source-load", message: "Alert text style could not be rendered safely." })
    })));
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

    await waitFor(() => expect(onPlaybackEvent).toHaveBeenCalledWith(expect.objectContaining({
      instructionId: "instruction-1",
      status: "failed",
      failure: expect.objectContaining({ stage: "source-load", message: "Alert shape fill could not be rendered safely." })
    })));
    expect(screen.queryByTestId("overlay-shape-instruction-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-visual-instruction-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-audio-instruction-1")).not.toBeInTheDocument();
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "started" }));
    expect(onPlaybackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("renders timer presentation inside a visible module layer without playback completion events", () => {
    const onPlaybackEvent = vi.fn();
    const timerComposition: OverlayComposition = {
      overlayId: "overlay-1", purpose: "live", scope: "unified", targetProfileId: "landscape",
      modules: [{
        moduleId: "timers", enabled: true, surfaceLayer: { visible: true, zIndex: 3 }, instructions: [],
        presentation: { kind: "timer-stack", stack: {
          targetProfileId: "landscape",
          region: { layout: { x: 10, y: 20, width: 400, height: 100, zIndex: 2 }, orientation: "vertical", maxVisible: 1 },
          cards: [{ definitionId: "cat-paws", generation: "g1", label: "Cat paws", iconAssetId: null,
            status: "paused", remainingMs: 30_000, slot: { x: 10, y: 20, width: 400, height: 100, zIndex: 2 } }],
          overflowCount: 0
        } }
      }]
    };
    const { rerender } = render(<OverlaySurface composition={timerComposition} onPlaybackEvent={onPlaybackEvent} resolveAssetUrl={() => "/asset"} />);
    expect(screen.getByRole("list", { name: "Active timers" })).toBeVisible();
    expect(screen.getByText("Cat paws")).toBeVisible();
    expect(onPlaybackEvent).not.toHaveBeenCalled();

    rerender(<OverlaySurface composition={{ ...timerComposition, modules: timerComposition.modules.map(module => ({
      ...module, surfaceLayer: { visible: false, zIndex: 3 }
    })) }} onPlaybackEvent={onPlaybackEvent} resolveAssetUrl={() => "/asset"} />);
    expect(screen.queryByRole("list", { name: "Active timers" })).toBeNull();
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

function simulateProgress(element: HTMLMediaElement): void {
  const start = Date.now();
  Object.defineProperty(element, "currentTime", { configurable: true, get: () => (Date.now() - start) / 1000 });
}
