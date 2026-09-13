import { expect, it, vi } from "vitest";
import type { SurfaceConfiguration } from "@stream-jams/core";
import { SurfaceSettingsService } from "./surface-settings-service.js";

function fixture() {
  let saved: SurfaceConfiguration = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, opacity: 1,
    layers: [{ moduleId: "alerts", visible: false }] };
  const surfaces = { list: vi.fn(async () => [saved]), save: vi.fn(async (value: SurfaceConfiguration) => { saved = value; }) };
  const host = { configure: vi.fn(async () => {}), retry: vi.fn(async () => {}), getStatus: vi.fn(async () => ({ available: true,
    displays: [{ id: "monitor", label: "Monitor", bounds: { x: -1080, y: 0, width: 1080, height: 1920 }, scaleFactor: 1 }], state: "disabled" as const, message: null })) };
  const changed = vi.fn(async () => {});
  const service = new SurfaceSettingsService({ surfaces, host, moduleIds: () => ["alerts"], changed,
    runMutation: async work => work() });
  return { service, surfaces, host, changed, value: () => saved };
}

it("rejects incomplete layers and stale display capability before persistence or host changes", async () => {
  const { service, surfaces, host, value } = fixture();
  for (const candidate of [{ ...value(), layers: [] }, { ...value(), layers: [{ moduleId: "unknown", visible: true }] },
    { ...value(), enabled: true, displayId: "missing" }]) {
    await expect(service.save("desktop:primary", candidate)).rejects.toThrow();
  }
  expect(surfaces.save).not.toHaveBeenCalled();
  expect(host.configure).not.toHaveBeenCalled();
});

it("applies only successfully persisted configuration and exposes failed runtime apply without undoing intent", async () => {
  const { service, surfaces, host, value } = fixture();
  const enabled = { ...value(), enabled: true, displayId: "monitor" };
  surfaces.save.mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(service.save("desktop:primary", enabled)).rejects.toThrow();
  expect(host.configure).not.toHaveBeenCalled();
  expect(value()).toMatchObject({ enabled: false, displayId: null });
  host.configure.mockRejectedValueOnce(new Error("renderer unavailable"));
  const view = await service.save("desktop:primary", enabled);
  expect(view.surfaces[0]).toMatchObject(enabled);
  expect(view.desktop.state).toBe("failed");
  expect(view.desktop.message).toMatch(/retry/i);
  expect(host.retry).not.toHaveBeenCalled();
  await service.retry();
  expect(host.retry).toHaveBeenCalledOnce();
});

it("reports CLI as unavailable and never substitutes a desktop host", async () => {
  const { surfaces } = fixture();
  const service = new SurfaceSettingsService({ surfaces, moduleIds: () => ["alerts"], changed: async () => {}, runMutation: async work => work() });
  expect((await service.load()).desktop).toMatchObject({ available: false, displays: [], state: "unavailable" });
  await expect(service.retry()).rejects.toThrow();
});

it("does not report a browser-layer broadcast failure as a desktop host failure", async () => {
  const { surfaces, host, changed } = fixture();
  const unified: SurfaceConfiguration = { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "alerts", visible: true }] };
  surfaces.list.mockResolvedValue([unified]);
  changed.mockRejectedValueOnce(new Error("socket unavailable"));
  const service = new SurfaceSettingsService({ surfaces, host, changed, moduleIds: () => ["alerts"], runMutation: work => work() });
  await expect(service.save(unified.id, unified)).rejects.toThrow(/saved.*browser/i);
  expect((await service.load()).desktop.state).toBe("disabled");
});
