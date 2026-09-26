import { expect, it, vi } from "vitest";
import type { SurfaceConfiguration } from "@stream-jams/core";
import { SurfaceSettingsService } from "./surface-settings-service.js";

function fixture() {
  let saved: SurfaceConfiguration = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null,
    displayLabel: null, autoFollowDisplayName: false, opacity: 1,
    layers: [{ moduleId: "alerts", visible: false }] };
  const surfaces = { list: vi.fn(async () => [saved]), save: vi.fn(async (value: SurfaceConfiguration) => { saved = value; }) };
  const host = { configure: vi.fn(async () => {}), retry: vi.fn(async () => {}), getStatus: vi.fn(async () => ({ available: true,
    displays: [{ id: "monitor", label: "Monitor", bounds: { x: -1080, y: 0, width: 1080, height: 1920 }, scaleFactor: 1 }], state: "disabled" as const, message: null })) };
  const changed = vi.fn(async () => {});
  const service = new SurfaceSettingsService({ surfaces, host, moduleIds: () => ["alerts"], changed,
    runMutation: async work => work() });
  return { service, surfaces, host, changed, value: () => saved };
}

function editable(surface: Extract<SurfaceConfiguration, { kind: "desktop" }>) {
  return {
    id: surface.id, kind: surface.kind, enabled: surface.enabled, displayId: surface.displayId,
    autoFollowDisplayName: surface.autoFollowDisplayName, opacity: surface.opacity, layers: surface.layers
  };
}

it("rejects incomplete layers and stale display capability before persistence or host changes", async () => {
  const { service, surfaces, host, value } = fixture();
  const current = editable(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>);
  for (const candidate of [{ ...current, layers: [] }, { ...current, layers: [{ moduleId: "unknown", visible: true }] },
    { ...current, enabled: true, displayId: "missing" }]) {
    await expect(service.save("desktop:primary", candidate)).rejects.toThrow();
  }
  expect(surfaces.save).not.toHaveBeenCalled();
  expect(host.configure).not.toHaveBeenCalled();
});

it("derives trusted display labels, rejects browser labels, and clears consent with selection", async () => {
  const { service, value, host } = fixture();
  const selected = { ...editable(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: true, displayId: "monitor", autoFollowDisplayName: true };
  await expect(service.save("desktop:primary", { ...selected, displayLabel: "Pretend" })).rejects.toMatchObject({ statusCode: 400 });
  const saved = await service.save("desktop:primary", selected);
  expect(saved.surfaces[0]).toMatchObject({ displayId: "monitor", displayLabel: "Monitor", autoFollowDisplayName: true });
  host.getStatus.mockResolvedValueOnce({ available: false, displays: [], state: "unavailable", message: "offline" });
  await expect(service.save("desktop:primary", { ...selected, enabled: false })).resolves.toBeDefined();
  const cleared = await service.save("desktop:primary", { ...editable(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: false, displayId: null, autoFollowDisplayName: true });
  expect(cleared.surfaces[0]).toMatchObject({ displayId: null, displayLabel: null, autoFollowDisplayName: false });
});

it("reconciles one exact display name durably and reports ambiguity without fallback", async () => {
  const { service, surfaces, host, value } = fixture();
  await surfaces.save({ ...value(), enabled: true, displayId: "old", displayLabel: "VG27A", autoFollowDisplayName: true });
  host.getStatus.mockResolvedValue({ available: true, displays: [
    { id: "new", label: "VG27A", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ], state: "unavailable", message: null });

  await service.reconcileDesktopBinding();
  expect(surfaces.save).toHaveBeenLastCalledWith(expect.objectContaining({ displayId: "new", displayLabel: "VG27A" }));
  expect(host.configure).toHaveBeenLastCalledWith(expect.objectContaining({ displayId: "new" }));
  expect((await service.load()).desktopBindingState).toBe("rebound");

  await surfaces.save({ ...value(), displayId: "old", displayLabel: "VG27A", autoFollowDisplayName: true });
  host.getStatus.mockResolvedValue({ available: true, displays: [
    { id: "first", label: "VG27A", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: "second", label: "VG27A", bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ], state: "unavailable", message: null });
  host.configure.mockClear();
  await service.reconcileDesktopBinding();
  expect(host.configure).not.toHaveBeenCalled();
  expect((await service.load()).desktopBindingState).toBe("ambiguous");
});

it("applies only successfully persisted configuration and exposes failed runtime apply without undoing intent", async () => {
  const { service, surfaces, host, value } = fixture();
  const enabled = { ...editable(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: true, displayId: "monitor" };
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
