import { compatibilityAlertTextBoxStyle, compatibilityAlertTextStyle, createDefaultTextWarp } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
vi.mock("pixi.js/unsafe-eval", () => ({}));
const fake = vi.hoisted(() => ({ renderer: { canvas: {}, resize: vi.fn(), render: vi.fn(), destroy: vi.fn() }, created: vi.fn() }));
vi.mock("pixi.js", () => ({
  autoDetectRenderer: () => { fake.created(); return Promise.resolve(fake.renderer); },
  Texture: { from: () => ({ destroy: vi.fn() }) },
  MeshPlane: class { geometry = { getBuffer: () => ({ data: new Float32Array(32 * 32 * 2), update: vi.fn() }) }; },
  Container: class { addChild() {} destroy() {} }
}));
import { getAlertTextRasterBounds, rasterizeAlertText, renderWarpedText } from "./alert-text-renderer.js";
describe("warp rendering geometry (mock GPU boundary)", () => {
  it("retains overflow coordinates and reuses one GPU renderer after invalid geometry", async () => {
    const target = { style: {}, getContext: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }) } as unknown as HTMLCanvasElement;
    const source = { width: 200, height: 100 } as HTMLCanvasElement;
    const original = createDefaultTextWarp();
    const warp = { ...original, points: original.points.map(point => ({ x: point.x - .25, y: point.y + .5 })) };
    const bounds = await renderWarpedText(target, source, { ...compatibilityAlertTextStyle, warp }, 100, 50);
    // Outward pixel rounding may add one physical sample at floating-point boundaries.
    expect(bounds!.left).toBeLessThanOrEqual(-25);
    expect(bounds!.left).toBeGreaterThanOrEqual(-25.5);
    expect(bounds!.width).toBeGreaterThanOrEqual(125);
    expect(bounds!.width).toBeLessThanOrEqual(125.5);
    expect(bounds!.height).toBeGreaterThanOrEqual(75);
    expect(bounds!.height).toBeLessThanOrEqual(75.5);
    expect(bounds!.top).toBe(0);
    const invalid = { ...warp, points: warp.points.map(point => ({ ...point, x: 100 })) };
    await expect(renderWarpedText(target, source, { ...compatibilityAlertTextStyle, warp: invalid }, 100, 50)).rejects.toThrow("bounds");
    await renderWarpedText(target, source, { ...compatibilityAlertTextStyle, warp }, 100, 50);
    expect(fake.created).toHaveBeenCalledOnce();
  });
  it("skips canceled queued work", async () => {
    const target = {} as HTMLCanvasElement;
    const source = vi.fn(() => ({} as HTMLCanvasElement));
    expect(await renderWarpedText(target, source, { ...compatibilityAlertTextStyle, warp: createDefaultTextWarp() }, 100, 50, () => false)).toBeNull();
    expect(source).not.toHaveBeenCalled();
  });
  it("releases the GPU after CPU text preparation fails", async () => {
    vi.useFakeTimers();
    try {
      await expect(renderWarpedText({} as HTMLCanvasElement, () => { throw new Error("raster failed"); }, { ...compatibilityAlertTextStyle, warp: createDefaultTextWarp() }, 100, 50)).rejects.toThrow("raster failed");
      await vi.advanceTimersByTimeAsync(1000);
      expect(fake.renderer.destroy).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("preserves outline, shadow and wrapped vertical overflow through an identity grid", async () => {
    const context = {
      measureText: (value: string) => ({ width: value.length * 10, actualBoundingBoxLeft: 4, actualBoundingBoxRight: value.length * 10 + 4, actualBoundingBoxAscent: 25, actualBoundingBoxDescent: 8, fontBoundingBoxAscent: 25, fontBoundingBoxDescent: 8 }),
      scale: vi.fn(), translate: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn()
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => context) as unknown as HTMLCanvasElement["getContext"]);
    try {
      const style = { ...compatibilityAlertTextStyle, fontSizePx: 32, verticalAlign: "top" as const, horizontalAlign: "left" as const, outline: { color: "#000000FF", widthPx: 12 }, shadow: { offsetX: -8, offsetY: 10, blur: 6, color: "#000000FF" }, warp: createDefaultTextWarp() };
      const source = rasterizeAlertText("one two three four five", style, { ...compatibilityAlertTextBoxStyle, paddingPx: 0 }, "sans-serif", 80, 40, 1);
      const raster = getAlertTextRasterBounds(source)!;
      expect(raster.left).toBeLessThan(-20);
      expect(raster.top).toBeLessThan(0);
      expect(raster.height).toBeGreaterThan(150);
      expect(context.translate).toHaveBeenCalledWith(-raster.left, -raster.top);
      expect(context.fillText).toHaveBeenCalledTimes(4);
      const target = document.createElement("canvas");
      const output = (await renderWarpedText(target, source, style, 80, 40))!;
      expect(Math.abs(output.left - raster.left)).toBeLessThanOrEqual(1 / raster.sampling);
      expect(Math.abs(output.top - raster.top)).toBeLessThanOrEqual(1 / raster.sampling);
      expect(output.width).toBeGreaterThanOrEqual(raster.width);
      expect(output.height).toBeGreaterThanOrEqual(raster.height);
      expect(target.width).toBeLessThanOrEqual(4096);
      expect(target.height).toBeLessThanOrEqual(4096);
    } finally { getContext.mockRestore(); }
  });
});
