import { afterEach, expect, it, vi } from "vitest";
import { monitorMediaProgress } from "./media-progress.js";

afterEach(() => vi.useRealTimers());

it("fails sustained lack of progress and stops its timer", () => {
  vi.useFakeTimers(); const fail = vi.fn();
  monitorMediaProgress({ currentTime: 0 }, fail);
  vi.advanceTimersByTime(2000);
  expect(fail).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("accepts progress, loop wrap and transient buffering", () => {
  vi.useFakeTimers(); const fail = vi.fn(); const media = { currentTime: 0 };
  const monitor = monitorMediaProgress(media, fail);
  vi.advanceTimersByTime(1500); media.currentTime = 1; vi.advanceTimersByTime(250);
  media.currentTime = 0; vi.advanceTimersByTime(250);
  expect(monitor.finish()).toBe(true); expect(fail).not.toHaveBeenCalled();
});
it("rejects timer completion without observed progress", () => {
  vi.useFakeTimers(); const fail = vi.fn(); const monitor = monitorMediaProgress({ currentTime: 0 }, fail);
  vi.advanceTimersByTime(500); expect(monitor.finish()).toBe(false); expect(fail).toHaveBeenCalledOnce();
});
it("cleans up cancellation and natural completion without false stalls", () => {
  vi.useFakeTimers(); const fail = vi.fn(); const monitor = monitorMediaProgress({ currentTime: 0 }, fail);
  monitor.stop(); vi.advanceTimersByTime(10000); expect(fail).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
