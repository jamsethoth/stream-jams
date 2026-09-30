import { afterEach, expect, it, vi } from "vitest";
import { prepareMediaAtStart } from "./prepare-media-at-start.js";

class Media extends EventTarget {
  readyState = 0;
  seeking = false;
  readonly currentTime = 0;
  readonly playbackRate = 1;
}
afterEach(() => vi.useRealTimers());

it("waits for decoded media without consuming or seeking past its beginning", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const media = new Media();
  let ready = false;
  const work = prepareMediaAtStart(media, { signal: new AbortController().signal, deadlineMs: 6000 }).then(() => { ready = true; });
  media.readyState = 1; media.dispatchEvent(new Event("loadedmetadata"));
  await vi.advanceTimersByTimeAsync(1700);
  expect(ready).toBe(false);
  media.readyState = 2; media.dispatchEvent(new Event("loadeddata"));
  await work;
  expect(media.currentTime).toBe(0); expect(media.playbackRate).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("releases listeners and deadline on cancellation, ignoring late readiness", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const media = new Media(); const controller = new AbortController();
  const remove = vi.spyOn(media, "removeEventListener");
  const work = prepareMediaAtStart(media, { signal: controller.signal, deadlineMs: 6000 });
  const failure = expect(work).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await failure;
  media.readyState = 4; media.dispatchEvent(new Event("canplay"));
  expect(remove).toHaveBeenCalledWith("loadeddata", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it.each([0, 1])("classifies a stalled preparation at readyState %i", async readyState => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const media = new Media(); media.readyState = readyState;
  const work = prepareMediaAtStart(media, { signal: new AbortController().signal, deadlineMs: 6000 });
  const failure = expect(work).rejects.toMatchObject({ stage: readyState === 0 ? "metadata" : "decode" });
  await vi.advanceTimersByTimeAsync(5000); await failure;
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects decode failures but allows a subsequent fresh element to prepare", async () => {
  const failed = new Media();
  const work = prepareMediaAtStart(failed, { signal: new AbortController().signal, deadlineMs: Date.now() + 5000 });
  failed.dispatchEvent(new Event("error"));
  await expect(work).rejects.toMatchObject({ stage: "decode" });
  const next = new Media(); next.readyState = 3;
  await expect(prepareMediaAtStart(next, { signal: new AbortController().signal, deadlineMs: Date.now() + 5000 })).resolves.toBeUndefined();
});
