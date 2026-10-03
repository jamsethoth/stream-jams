import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireAlertFont } from "./alert-font.js";
afterEach(() => vi.unstubAllGlobals());
describe("acquireAlertFont", () => {
  it("shares bytes by loader/version identity and releases after the last layer", async () => {
    const face = { load: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal("FontFace", class { load = face.load; });
    const add = vi.fn(); const remove = vi.fn();
    Object.defineProperty(document, "fonts", { configurable: true, value: { add, delete: remove } });
    const load = vi.fn(async () => ({ size: 20, arrayBuffer: async () => new ArrayBuffer(20) }) as Blob);
    const first = acquireAlertFont("font-1", load);
    const second = acquireAlertFont("font-1", load);
    expect(await first.ready).toBe(await second.ready);
    expect(load).toHaveBeenCalledOnce();
    first.release(); await Promise.resolve(); expect(remove).not.toHaveBeenCalled();
    second.release(); await Promise.resolve(); expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
  it("removes a font that finishes loading after its layer was removed", async () => {
    let finish: () => void = () => undefined;
    vi.stubGlobal("FontFace", class { load = () => new Promise<void>(resolve => { finish = resolve; }); });
    const remove = vi.fn();
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn(), delete: remove } });
    const font = acquireAlertFont("font-late", async () => ({ size: 20, arrayBuffer: async () => new ArrayBuffer(20) }) as Blob);
    await Promise.resolve(); await Promise.resolve();
    font.release(); finish(); await font.ready; await Promise.resolve();
    expect(remove).toHaveBeenCalledOnce();
  });
});
