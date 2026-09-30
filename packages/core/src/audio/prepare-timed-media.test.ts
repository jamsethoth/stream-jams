import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareTimedMedia } from "./prepare-timed-media.js";

class Media extends EventTarget {
  readyState = 1;
  #position = 0;
  get currentTime() { return this.#position; }
  set currentTime(value: number) { this.#position = value; }
  seeking = false;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => vi.useRealTimers());
const timing = { startsAtEpochMs: 1100, endsAtEpochMs: 11100 };

it("accepts a real asynchronous seek without chasing every elapsed millisecond", async () => {
  class AsyncMedia extends Media {
    seeks = 0;
    override get currentTime() { return super.currentTime; }
    override set currentTime(value: number) {
      super.currentTime = value;
      this.seeks++;
      this.seeking = true;
      setTimeout(() => { this.seeking = false; this.dispatchEvent(new Event("seeked")); }, 50);
    }
  }
  vi.setSystemTime(3600);
  const media = new AsyncMedia();
  let ready = false;
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 }).then(() => { ready = true; });
  await vi.advanceTimersByTimeAsync(50);
  expect(ready).toBe(true);
  expect(media.seeks).toBe(1);
  await work;
});

it("waits for the shared start and does not play the element itself", async () => {
  const media = new Media();
  let ready = false;
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 }).then(() => { ready = true; });
  await vi.advanceTimersByTimeAsync(99);
  expect(ready).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await work;
  expect(media.currentTime).toBe(0);
});

it("waits for metadata then seeks to the current occurrence offset", async () => {
  const media = new Media();
  media.readyState = 0;
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 });
  await vi.advanceTimersByTimeAsync(2600);
  media.readyState = 1;
  media.dispatchEvent(new Event("loadedmetadata"));
  await work;
  expect(media.currentTime).toBe(2.5);
  expect(vi.getTimerCount()).toBe(0);
});

it("requires seek completion and corrects a delayed seek against the same clock", async () => {
  const media = new Media();
  vi.setSystemTime(3600);
  media.seeking = true;
  let ready = false;
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 }).then(() => { ready = true; });
  expect(media.currentTime).toBe(2.5);
  await vi.advanceTimersByTimeAsync(400);
  expect(ready).toBe(false);
  media.seeking = false;
  media.dispatchEvent(new Event("seeked"));
  await work;
  expect(media.currentTime).toBe(2.9);
});

it.each(["never-ready", "never-seeked"])("fails bounded %s preparation", async kind => {
  const media = new Media();
  media.readyState = kind === "never-ready" ? 0 : 1;
  media.seeking = kind === "never-seeked";
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 });
  const assertion = expect(work).rejects.toThrow(/deadline/);
  await vi.advanceTimersByTimeAsync(5000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels pending metadata without later seeking", async () => {
  const media = new Media();
  media.readyState = 0;
  const controller = new AbortController();
  const work = prepareTimedMedia(media, timing, { signal: controller.signal, deadlineMs: 6000 });
  controller.abort();
  await expect(work).rejects.toMatchObject({ name: "AbortError" });
  vi.setSystemTime(4000);
  media.readyState = 1;
  media.dispatchEvent(new Event("loadedmetadata"));
  expect(media.currentTime).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects expired occurrences and media errors", async () => {
  vi.setSystemTime(12000);
  await expect(prepareTimedMedia(new Media(), timing, { signal: new AbortController().signal, deadlineMs: 15000 })).rejects.toThrow(/expired/);
  vi.setSystemTime(1000);
  const media = new Media();
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 });
  media.dispatchEvent(new Event("error"));
  await expect(work).rejects.toThrow(/media/);
  expect(vi.getTimerCount()).toBe(0);
});

it("retains a currentTime assignment failure as a seek-stage cause", async () => {
  const cause = new DOMException("seek denied", "InvalidStateError");
  class ThrowingSeekMedia extends Media {
    override get currentTime() { return super.currentTime; }
    override set currentTime(_value: number) { throw cause; }
  }
  vi.setSystemTime(3600);

  await expect(prepareTimedMedia(new ThrowingSeekMedia(), timing, {
    signal: new AbortController().signal,
    deadlineMs: 6000
  })).rejects.toMatchObject({
    name: "TimedMediaPreparationError",
    stage: "seek",
    cause
  });
});

it("classifies metadata deadlines and media errors without discarding their causes", async () => {
  const metadataMedia = new Media();
  metadataMedia.readyState = 0;
  const metadataWork = prepareTimedMedia(metadataMedia, timing, {
    signal: new AbortController().signal,
    deadlineMs: 6000
  });
  const metadataAssertion = expect(metadataWork).rejects.toMatchObject({ stage: "metadata" });
  await vi.advanceTimersByTimeAsync(5000);
  await metadataAssertion;

  vi.setSystemTime(1000);
  const decodeMedia = new Media();
  const decodeWork = prepareTimedMedia(decodeMedia, timing, {
    signal: new AbortController().signal,
    deadlineMs: 6000
  });
  decodeMedia.dispatchEvent(new Event("error"));
  await expect(decodeWork).rejects.toMatchObject({ stage: "decode" });
});

it("rejects an elapsed non-looping clip before attempting an impossible seek", async () => {
  vi.setSystemTime(3600);
  const media = Object.assign(new Media(), { duration: 2, loop: false });
  await expect(prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 })).rejects.toThrow(/clip has expired.*offset=2.5.*duration=2/);
  expect(media.currentTime).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("retains bounded seeks and reports measured drift when slow seeks cannot catch up", async () => {
  class SlowMedia extends Media {
    seeks = 0;
    override get currentTime() { return super.currentTime; }
    override set currentTime(value: number) {
      super.currentTime = value; this.seeks++; this.seeking = true;
      setTimeout(() => { this.seeking = false; this.dispatchEvent(new Event("seeked")); }, 200);
    }
  }
  vi.setSystemTime(3600);
  const media = new SlowMedia();
  const work = prepareTimedMedia(media, timing, { signal: new AbortController().signal, deadlineMs: 6000 });
  const rejected = expect(work).rejects.toThrow(/timing target.*requested=2.7.*actual=2.7.*offset=2.9/);
  await vi.advanceTimersByTimeAsync(400);
  await rejected;
  expect(media.seeks).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});
