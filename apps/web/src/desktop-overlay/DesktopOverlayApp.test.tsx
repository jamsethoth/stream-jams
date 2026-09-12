import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopOverlayApp } from "./DesktopOverlayApp.js";
import { DesktopOverlayController } from "./desktop-overlay-controller.js";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("renders only active private occurrences and preserves their nodes on configuration changes", () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const listeners = new Set<() => void>();
  const report = vi.fn();
  const controller = new DesktopOverlayController({ report, changed: () => { for (const listener of listeners) listener(); },
    prepareAsset: vi.fn(async () => ({ url: "blob:test", dispose() {} })) });
  const receive = (command: unknown) => controller.receive({ generation: 1, requestId: crypto.randomUUID(), command });
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
