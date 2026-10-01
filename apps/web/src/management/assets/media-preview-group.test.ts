import { afterEach, expect, it, vi } from "vitest";
import { createTestMediaPreviewApi, previewDescriptor } from "../../test-support/media-preview-fixture.js";
import { createMediaPreviewGroup } from "./media-preview-group.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("shares one immutable source across visual and soundtrack consumers and detaches before release", async () => {
  const api = createTestMediaPreviewApi();
  const create = vi.spyOn(api, "createPreview");
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const group = createMediaPreviewGroup(api);
  await group.acquire(["video", "video"]);
  const video = document.createElement("video");
  const soundtrack = document.createElement("audio");
  const descriptor = group.getSnapshot().descriptors.video!;
  for (const element of [video, soundtrack]) {
    element.src = descriptor.url;
    group.registerElement(element, "video");
  }
  const release = vi.spyOn(api, "releasePreview").mockImplementation(async () => {
    expect(video.hasAttribute("src")).toBe(false);
    expect(soundtrack.hasAttribute("src")).toBe(false);
    expect(pause).toHaveBeenCalledTimes(2);
  });
  group.dispose(); group.dispose();
  expect(create).toHaveBeenCalledExactlyOnceWith("video");
  expect(release).toHaveBeenCalledExactlyOnceWith(descriptor.id);
});

it("preserves sources on renewal and detaches buffered media before failed renewal releases its grant", async () => {
  vi.useFakeTimers();
  const api = createTestMediaPreviewApi();
  const group = createMediaPreviewGroup(api);
  await group.acquire(["video"]);
  const element = document.createElement("video");
  const pause = vi.spyOn(element, "pause").mockImplementation(() => {});
  vi.spyOn(element, "load").mockImplementation(() => {});
  element.src = group.getSnapshot().descriptors.video!.url;
  group.registerElement(element, "video");
  await vi.advanceTimersByTimeAsync(60000);
  expect(pause).not.toHaveBeenCalled();
  expect(element.getAttribute("src")).toBe(group.getSnapshot().descriptors.video!.url);
  vi.spyOn(api, "renewPreview").mockRejectedValueOnce(new Error("Session expired"));
  const release = vi.spyOn(api, "releasePreview").mockImplementation(async () => {
    expect(pause).toHaveBeenCalledOnce();
    expect(element.hasAttribute("src")).toBe(false);
  });
  await vi.advanceTimersByTimeAsync(60000);
  expect(group.getSnapshot()).toEqual({ descriptors: {}, unavailable: true });
  expect(release).toHaveBeenCalledOnce();
  group.dispose();
});

it("releases partial and late acquisitions after an atomic group failure", async () => {
  let finish!: (value: ReturnType<typeof previewDescriptor>) => void;
  const api = createTestMediaPreviewApi(async id => {
    if (id === "missing") throw new Error("Asset missing");
    return new Promise(resolve => { finish = resolve; });
  });
  const release = vi.spyOn(api, "releasePreview");
  const group = createMediaPreviewGroup(api);
  await expect(group.acquire(["video", "missing"])).rejects.toThrow("missing");
  finish(previewDescriptor("video"));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(group.getSnapshot().unavailable).toBe(true);
  expect(release).toHaveBeenCalledExactlyOnceWith("preview-video");
  group.dispose();
});
