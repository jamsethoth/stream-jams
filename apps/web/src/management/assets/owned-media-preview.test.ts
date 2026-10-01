import type { MediaPreviewDescriptor } from "@stream-jams/core";
import { afterEach, expect, it, vi } from "vitest";
import { acquireOwnedMediaPreview } from "./owned-media-preview.js";
import type { MediaPreviewApi } from "./media-preview-api.js";

const descriptor = (expiresAt = Date.now() + 300000): MediaPreviewDescriptor => ({
  id: "00000000-0000-4000-8000-000000000001", url: `/media/med_${"a".repeat(43)}`,
  snapshot: { assetId: "asset", version: "a".repeat(64), mimeType: "video/mp4", sizeBytes: 60000000, durationMs: 2000 }, expiresAt
});
function fixture() {
  const api = { createPreview: vi.fn(async () => descriptor()), renewPreview: vi.fn(async () => descriptor()), releasePreview: vi.fn(async () => {}) } satisfies MediaPreviewApi;
  return api;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("renews once a minute without fetching a body or changing the native URL/version", async () => {
  vi.useFakeTimers();
  const api = fixture();
  const resource = await acquireOwnedMediaPreview(api, "asset");
  const first = resource.getSnapshot().descriptor!;
  await vi.advanceTimersByTimeAsync(60000);
  expect(api.renewPreview).toHaveBeenCalledExactlyOnceWith(first.id);
  expect(resource.getSnapshot().descriptor).toEqual({ ...first, expiresAt: first.expiresAt + 60000 });
  resource.dispose(); resource.dispose();
  expect(api.releasePreview).toHaveBeenCalledExactlyOnceWith(first.id);
  expect(vi.getTimerCount()).toBe(0);
});
it("releases creation that settles after the owner is cancelled", async () => {
  const api = fixture();
  let finish!: (value: MediaPreviewDescriptor) => void;
  api.createPreview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const pending = acquireOwnedMediaPreview(api, "asset", { signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow();
  controller.abort(); finish(descriptor());
  await rejected;
  expect(api.releasePreview).toHaveBeenCalledOnce();
});
it("reports expiry locally and reacquires on focus without restarting a live output", async () => {
  vi.useFakeTimers();
  const api = fixture();
  api.renewPreview.mockRejectedValueOnce(new Error("Session expired"));
  const resource = await acquireOwnedMediaPreview(api, "asset");
  const changed = vi.fn(); resource.subscribe(changed);
  await vi.advanceTimersByTimeAsync(60000);
  expect(resource.getSnapshot()).toEqual({ descriptor: null, unavailable: true });
  expect(api.releasePreview).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event("focus"));
  await Promise.resolve(); await Promise.resolve();
  expect(api.createPreview).toHaveBeenCalledTimes(2);
  expect(resource.getSnapshot().unavailable).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  resource.dispose();
});
it("rejects renewal that changes content instead of attaching replacement bytes to old duration", async () => {
  vi.useFakeTimers();
  const api = fixture();
  api.renewPreview.mockImplementationOnce(async () => ({ ...descriptor(), snapshot: { ...descriptor().snapshot, version: "b".repeat(64), durationMs: 4000 } }));
  const resource = await acquireOwnedMediaPreview(api, "asset");
  await vi.advanceTimersByTimeAsync(60000);
  expect(resource.getSnapshot()).toEqual({ descriptor: null, unavailable: true });
  resource.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("detaches an expired source before a throttled tab's focus recovery settles", async () => {
  vi.useFakeTimers();
  let now = Date.now();
  const api = fixture();
  const resource = await acquireOwnedMediaPreview(api, "asset", { now: () => now });
  let finish!: (value: MediaPreviewDescriptor) => void;
  api.createPreview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  now += 300001;
  window.dispatchEvent(new Event("focus"));
  expect(resource.getSnapshot()).toEqual({ descriptor: null, unavailable: true });
  expect(api.releasePreview).toHaveBeenCalledOnce();
  finish(descriptor(now + 300000));
  await Promise.resolve(); await Promise.resolve();
  expect(resource.getSnapshot().unavailable).toBe(false);
  resource.dispose();
});
it("does not revive a disposed preview after an outstanding renewal settles", async () => {
  vi.useFakeTimers();
  const api = fixture();
  let finish!: (value: MediaPreviewDescriptor) => void;
  api.renewPreview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const resource = await acquireOwnedMediaPreview(api, "asset");
  const changed = vi.fn(); resource.subscribe(changed);
  await vi.advanceTimersByTimeAsync(60000);
  resource.dispose(); finish(descriptor());
  await Promise.resolve(); await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
