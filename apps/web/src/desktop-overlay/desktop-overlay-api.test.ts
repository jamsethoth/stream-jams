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

it.each(["font/woff2", "font/woff", "font/ttf", "font/otf"] as const)("decodes %s without an image readiness probe", async mimeType => {
  let loaded = false;
  const load = vi.fn(async () => { loaded = true; return {} as FontFace; });
  const constructor = vi.fn();
  vi.stubGlobal("FontFace", class { constructor(family: string, source: string) { constructor(family, source); } load = load; });
  const image = vi.fn(); vi.stubGlobal("Image", image);
  const resource = await prepareDesktopVisualAsset(privateAsset(mimeType));
  expect(loaded).toBe(true); expect(image).not.toHaveBeenCalled();
  expect(constructor).toHaveBeenCalledWith("stream-jams-private-font-preflight", `url("${resource.url}")`);
  resource.dispose(); resource.dispose();
});

it("fails safely on font decode failure and bounds stalled font readiness", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("FontFace", class { load = () => Promise.reject(new Error("Font decode failed")); });
  await expect(prepareDesktopVisualAsset(privateAsset("font/woff2"))).rejects.toThrow("could not be prepared");
  vi.stubGlobal("FontFace", class { load = () => new Promise<FontFace>(() => {}); });
  const failed = expect(prepareDesktopVisualAsset(privateAsset("font/woff2"))).rejects.toThrow("could not be prepared");
  await vi.advanceTimersByTimeAsync(5000); await failed;
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores late font decoding after the preparation deadline", async () => {
  vi.useFakeTimers();
  let resolveFont: ((face: FontFace) => void) | undefined;
  const load = new Promise<FontFace>(resolve => { resolveFont = resolve; });
  vi.stubGlobal("FontFace", class { load = () => load; });
  const ready = vi.fn();
  const prepared = prepareDesktopVisualAsset(privateAsset("font/woff2")).then(ready);
  const rejected = expect(prepared).rejects.toThrow("could not be prepared");
  await vi.advanceTimersByTimeAsync(5000); await rejected;
  resolveFont!({} as FontFace); await Promise.resolve();
  expect(ready).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

function privateAsset(mimeType: import("@stream-jams/core").PrivateDesktopMediaAsset["reference"]["snapshot"]["mimeType"] = "image/png"): import("@stream-jams/core").PrivateDesktopMediaAsset {
  return { assetId: "image", reference: { protocolVersion: 1, handle: `private_${"a".repeat(43)}`, snapshot: { assetId: "image", version: "a".repeat(64), mimeType, sizeBytes: 1, durationMs: null } } };
}
