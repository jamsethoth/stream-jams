import { afterEach, expect, it, vi } from "vitest";
import { prepareDesktopVisualAsset } from "./desktop-overlay-api.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("waits for image readiness and revokes its local URL exactly once", async () => {
  const element = document.createElement("img");
  vi.stubGlobal("Image", class { constructor() { return element; } });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const pending = prepareDesktopVisualAsset({ assetId: "image", mimeType: "image/png", bytes: new Uint8Array([1]) });
  expect(create).toHaveBeenCalledOnce();
  element.dispatchEvent(new Event("load"));
  const asset = await pending;
  expect(asset.url).toBe("blob:test");
  asset.dispose(); asset.dispose();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test");
  expect(element.hasAttribute("src")).toBe(false);
});

it("bounds failed media preparation and releases its URL", async () => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const pending = prepareDesktopVisualAsset({ assetId: "image", mimeType: "image/png", bytes: new Uint8Array([1]) });
  const failed = expect(pending).rejects.toThrow("could not be prepared");
  await vi.advanceTimersByTimeAsync(5000);
  await failed;
  expect(revoke).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
