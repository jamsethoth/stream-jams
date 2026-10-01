import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopOverlayApp } from "./DesktopOverlayApp.js";
import { DesktopOverlayController } from "./desktop-overlay-controller.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("acknowledges actual decoded readiness and retains the silent video until the committed start", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const listeners = new Set<() => void>(); const report = vi.fn(); const dispose = vi.fn();
  const controller = new DesktopOverlayController({ report, changed: () => { for (const listener of listeners) listener(); }, prepareAsset: async () => ({ url: "blob:clip", dispose }) });
  const receive = (command: unknown) => controller.receive({ protocolVersion: 1, generation: 1, requestId: crypto.randomUUID(), command });
  render(<DesktopOverlayApp controller={controller} subscribe={listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }} />);
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "prepared-video", generation: 1 };
  await act(async () => {
    receive({ type: "configure", config: { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "monitor", opacity: 1, layers: [{ moduleId: "alerts", visible: true }] } });
    receive({ type: "prepare", batch: { key, deferredStart: true, timing: { startsAtEpochMs: 16000, endsAtEpochMs: 17000 }, assets: [privateAsset("clip", "video/webm")], instructions: [
      { id: "video", moduleId: "alerts", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", durationMs: 1000, audio: null, text: null, tts: null,
        visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } }
    ] } });
  });
  const video = screen.getByTestId(/^overlay-video-/) as HTMLVideoElement;
  await act(() => vi.advanceTimersByTimeAsync(1700));
  expect(video).not.toBeVisible(); expect(play).not.toHaveBeenCalled();
  expect(report.mock.calls.some(call => call[0].result?.type === "ready")).toBe(false);
  Object.defineProperty(video, "readyState", { value: 2 });
  await act(async () => { fireEvent.loadedData(video); });
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ result: { type: "ready", key } }));
  act(() => receive({ type: "start", key, timing: { startsAtEpochMs: 2800, endsAtEpochMs: 3800 } }));
  expect(screen.getByTestId(/^overlay-video-/)).toBe(video); expect(play).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(play).toHaveBeenCalledOnce(); expect(video.currentTime).toBe(0); expect(video.playbackRate).toBe(1);
  expect(video).toBeVisible();
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.queryByTestId(/^overlay-video-/)).toBeNull(); expect(dispose).toHaveBeenCalledOnce();
  controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});

it("forwards a rendered video's failure cause through private IPC and stays transparent", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const listeners = new Set<() => void>(); const report = vi.fn();
  const controller = new DesktopOverlayController({ report, changed: () => { for (const listener of listeners) listener(); }, prepareAsset: async () => ({ url: "blob:clip", dispose() {} }) });
  const receive = (command: unknown) => controller.receive({ protocolVersion: 1, generation: 1, requestId: crypto.randomUUID(), command });
  render(<DesktopOverlayApp controller={controller} subscribe={listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }} />);
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "failed-video", generation: 1 };
  await act(async () => {
    receive({ type: "configure", config: { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "monitor", opacity: 1, layers: [{ moduleId: "alerts", visible: true }] } });
    receive({ type: "prepare", batch: { key, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 4000 }, assets: [privateAsset("clip", "video/webm")], instructions: [
      { id: "video", moduleId: "alerts", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", durationMs: 3000, audio: null, text: null, tts: null,
        visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } }
    ] } });
  });
  act(() => receive({ type: "start", key }));
  const video = screen.getByTestId(/^overlay-video-/);
  Object.defineProperty(video, "error", { value: new Error("decoder fixture failed") });
  fireEvent.error(video);
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ result: { type: "error", key }, failure: expect.objectContaining({ stage: "source-load", exception: expect.objectContaining({ message: "decoder fixture failed" }) }) }));
  expect(screen.queryByTestId(/^overlay-video-/)).toBeNull();
  expect(document.body.textContent).not.toContain("decoder fixture failed");
  controller.dispose();
});

it("renders only active private occurrences and preserves their nodes on configuration changes", () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const listeners = new Set<() => void>();
  const report = vi.fn();
  const controller = new DesktopOverlayController({ report, changed: () => { for (const listener of listeners) listener(); },
    prepareAsset: vi.fn(async () => ({ url: "blob:test", dispose() {} })) });
  const receive = (command: unknown) => controller.receive({ protocolVersion: 1, generation: 1, requestId: crypto.randomUUID(), command });
  const config = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "monitor", opacity: 1,
    layers: [{ moduleId: "alerts", visible: true }] };
  const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "one", generation: 1 };
  const batch = { key, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 4000 }, assets: [], instructions: [
    { id: "shape", moduleId: "alerts", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", durationMs: 3000,
      visual: null, audio: null, text: null, tts: null, shape: { fill: "#FFFFFFFF", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 999999 } } }
  ] };
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  render(<DesktopOverlayApp controller={controller} subscribe={subscribe} />);
  act(() => { receive({ type: "configure", config }); receive({ type: "prepare", batch }); });
  expect(screen.queryByTestId(/^overlay-shape-/)).toBeNull();
  act(() => { receive({ type: "start", key }); });
  const shape = screen.getByTestId(/^overlay-shape-/);
  expect(shape).toBeVisible();
  act(() => { receive({ type: "configure", config: { ...config, layers: [{ moduleId: "alerts", visible: false }] } }); });
  expect(screen.getByTestId(/^overlay-shape-/)).toBe(shape);
  expect(shape).not.toBeVisible();
  act(() => { receive({ type: "configure", config: { ...config, enabled: false } }); });
  expect(screen.queryByTestId(/^overlay-shape-/)).toBeNull();
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ result: { type: "error", key } }));
  controller.dispose();
});

it("renders persistent timer module presentations and their prepared icons", async () => {
  const listeners = new Set<() => void>();
  const controller = new DesktopOverlayController({ report: vi.fn(), changed: () => { for (const listener of listeners) listener(); },
    prepareAsset: vi.fn(async () => ({ url: "blob:timer-icon", dispose() {} })) });
  const receive = (command: unknown) => controller.receive({ protocolVersion: 1, generation: 1, requestId: crypto.randomUUID(), command });
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  render(<DesktopOverlayApp controller={controller} subscribe={subscribe} />);
  receive({ type: "configure", config: { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "monitor", opacity: 1,
    layers: [{ moduleId: "timers", visible: true }] } });
  await act(async () => receive({ type: "sync-module", moduleId: "timers", revision: 1, presentation: { kind: "timer-stack", stack: {
    targetProfileId: "landscape", region: { layout: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 }, orientation: "vertical", maxVisible: 1 },
    cards: [{ definitionId: "mitts", generation: "g1", label: "Wear oven mitts", iconAssetId: "icon", iconVersion: "a".repeat(64), status: "paused", remainingMs: 5000,
      slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 } }], overflowCount: 0
  } }, assets: [privateAsset("icon", "image/png")] }));
  expect(screen.getByText("Wear oven mitts")).toBeVisible();
  expect(screen.getByRole("img", { name: "Wear oven mitts icon" })).toHaveAttribute("src", "blob:timer-icon");
  controller.dispose();
});

function privateAsset(assetId: string, mimeType: "video/webm" | "image/png"): import("@stream-jams/core").PrivateDesktopMediaAsset {
  return { assetId, reference: { protocolVersion: 1, handle: `private_${"a".repeat(43)}`, snapshot: { assetId, version: "a".repeat(64), mimeType, sizeBytes: 1, durationMs: mimeType === "image/png" ? null : 1000 } } };
}
