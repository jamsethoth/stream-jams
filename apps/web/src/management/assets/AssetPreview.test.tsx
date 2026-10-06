import { renderManagement as render } from "../../test-support/render-management.js";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";
import { createTestMediaPreviewApi } from "../../test-support/media-preview-fixture.js";
import { AssetPreview } from "./AssetPreview.js";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(["image", "audio", "video"] as const)("releases a successfully acquired %s preview after native body failure without retrying", async mediaType => {
  const api = createTestMediaPreviewApi();
  const create = vi.spyOn(api, "createPreview");
  const renew = vi.spyOn(api, "renewPreview");
  const item = { ...storyAssetLibraryItems[0]!, id: mediaType, displayName: "Media", mediaType };
  const { unmount } = render(<AssetPreview assetApi={api} item={item} />);
  const element = mediaType === "image" ? await screen.findByRole("img", { name: "Media preview" }) : await screen.findByLabelText("Media preview");
  const release = vi.spyOn(api, "releasePreview").mockImplementation(async () => {
    expect(element).not.toHaveAttribute("src");
  });
  vi.useFakeTimers();
  fireEvent.error(element);
  expect(screen.getByText("Preview unavailable")).toHaveAttribute("title", `Retry by reselecting the asset. Reference: asset-preview-${mediaType}`);
  expect(element).not.toBeInTheDocument();
  expect(release).toHaveBeenCalledExactlyOnceWith(`preview-${mediaType}`);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(120000);
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(renew).not.toHaveBeenCalled();
  unmount();
  expect(release).toHaveBeenCalledTimes(1);
});

it.each(["asset", "revision"] as const)("resets native failure when the %s changes", async change => {
  const api = createTestMediaPreviewApi();
  const create = vi.spyOn(api, "createPreview");
  const item = { ...storyAssetLibraryItems[0]!, id: "image", displayName: "Media" };
  const { rerender } = render(<AssetPreview assetApi={api} item={item} />);
  fireEvent.error(await screen.findByRole("img", { name: "Media preview" }));
  expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  rerender(<AssetPreview assetApi={api} item={{ ...item, ...(change === "asset" ? { id: "new-image" } : { updatedAt: "2026-10-01T12:00:00.000Z" }) }} />);
  expect(await screen.findByRole("img", { name: "Media preview" })).toHaveAttribute("src");
  expect(screen.queryByText("Preview unavailable")).not.toBeInTheDocument();
  expect(create).toHaveBeenCalledTimes(2);
});

it("previews fonts as text and removes the loaded FontFace on unmount", async () => {
  const add = vi.fn(), remove = vi.fn();
  const fonts = document.fonts;
  Object.defineProperty(document, "fonts", { configurable: true, value: { add, delete: remove } });
  class Face { load() { return Promise.resolve(this); } }
  vi.stubGlobal("FontFace", Face);
  try {
    const item = { ...storyAssetLibraryItems[0]!, mediaType: "font" as const, mimeType: "font/ttf", displayName: "My font" };
    const { unmount } = render(<AssetPreview assetApi={createTestMediaPreviewApi()} item={item} />);
    expect(await screen.findByText("Aa Bb 123")).toHaveAttribute("aria-label", "My font preview");
    expect(screen.queryByRole("img")).toBeNull(); expect(add).toHaveBeenCalledOnce();
    unmount(); expect(remove).toHaveBeenCalledOnce();
  } finally { Object.defineProperty(document, "fonts", { configurable: true, value: fonts }); }
});
