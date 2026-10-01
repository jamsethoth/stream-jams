import { afterEach, expect, it, vi } from "vitest";
import { prepareDesktopVisualAsset } from "./desktop-overlay-api.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("waits for image readiness and revokes its local URL exactly once", async () => {
  const element = document.createElement("img");
  vi.stubGlobal("Image", class { constructor() { return element; } });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const pending = prepareDesktopVisualAsset(privateAsset());
  expect(create).not.toHaveBeenCalled();
  element.dispatchEvent(new Event("load"));
  const asset = await pending;
  expect(asset.url).toBe(`stream-jams-overlay://surface/media/private_${"a".repeat(43)}`);
  asset.dispose(); asset.dispose();
  expect(revoke).not.toHaveBeenCalled();
  expect(element.hasAttribute("src")).toBe(false);
});

it("bounds failed media preparation and releases its URL", async () => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const pending = prepareDesktopVisualAsset(privateAsset());
  const failed = expect(pending).rejects.toThrow("could not be prepared");
  await vi.advanceTimersByTimeAsync(5000);
  await failed;
  expect(revoke).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

function privateAsset(): import("@stream-jams/core").PrivateDesktopMediaAsset {
  return { assetId: "image", reference: { protocolVersion: 1, handle: `private_${"a".repeat(43)}`, snapshot: { assetId: "image", version: "a".repeat(64), mimeType: "image/png", sizeBytes: 1, durationMs: null } } };
}
