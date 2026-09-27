import { expect, it, vi } from "vitest";
import type { DesktopOverlayStatus, Logger, SurfaceConfiguration } from "@stream-jams/core";
import { SurfaceSettingsService } from "./surface-settings-service.js";

function fixture() {
  let saved: SurfaceConfiguration = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null,
    displayLabel: null, autoFollowDisplayName: false, opacity: 1,
    layers: [{ moduleId: "alerts", visible: false }] };
  const surfaces = { list: vi.fn(async () => [saved]), save: vi.fn(async (value: SurfaceConfiguration) => { saved = value; }) };
  const host = { configure: vi.fn(async () => {}), retry: vi.fn(async () => {}), getStatus: vi.fn(async (): Promise<DesktopOverlayStatus> => ({ available: true,
    displays: [{ id: "monitor", label: "Monitor", bounds: { x: -1080, y: 0, width: 1080, height: 1920 }, scaleFactor: 1 }], state: "disabled" as const, message: null })) };
  const changed = vi.fn(async () => {});
  const logger: Logger = {
    debug: vi.fn(async () => {}), info: vi.fn(async () => {}), warn: vi.fn(async () => {}), error: vi.fn(async () => {})
  };
  const dependencies = { surfaces, host, moduleIds: () => ["alerts"], changed,
    runMutation: <T>(work: () => Promise<T>) => work(), logger, generateReferenceId: () => "ref-desktop-displays" };
  const service = new SurfaceSettingsService(dependencies);
  return { service, surfaces, host, changed, logger, value: () => saved };
}

it("logs desktop display detection and retry failures with their native causes", async () => {
  const { service, surfaces, host, logger, value } = fixture();
  await surfaces.save({ ...(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: true,
    displayId: "monitor", displayLabel: "Monitor" });
  host.getStatus.mockRejectedValue(new Error("screen API unavailable"));

  await expect(service.load()).resolves.toMatchObject({ desktop: { available: false, state: "unavailable" } });

  expect(logger.warn).toHaveBeenCalledWith("Desktop display detection failed.", {
    module: "overlay-surfaces",
    source: "desktop-overlay.displays.detection-failed",
    correlationId: "ref-desktop-displays",
    processingId: null,
    metadata: {
      errorName: "Error",
      errorMessage: "screen API unavailable",
      nextStep: "Restart the Windows desktop app and retry display detection."
    }
  });

  host.getStatus.mockResolvedValue({ available: true, displays: [{ id: "monitor", label: "Monitor",
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], state: "failed", message: "renderer unavailable" });
  host.retry.mockRejectedValueOnce(new Error("renderer window creation failed"));
  await service.retry();

  expect(logger.error).toHaveBeenCalledWith("Desktop overlay recovery failed.", {
    module: "overlay-surfaces",
    source: "desktop-overlay.retry.failed",
    correlationId: "ref-desktop-displays",
    processingId: null,
    metadata: {
      displayCount: 1,
      errorName: "Error",
      errorMessage: "renderer window creation failed",
      selectedDisplayAvailable: true,
      nextStep: "Check the selected display and retry. Interrupted content will not replay."
    }
  });
});

it("logs an unavailable display-detection state once while settings polling remains unchanged", async () => {
  const { service, host, logger } = fixture();
  host.getStatus.mockResolvedValue({ available: true, displays: [], state: "unavailable", message: "No displays were returned." });

  await service.load();
  await service.load();

  expect(logger.warn).toHaveBeenCalledOnce();
  expect(logger.warn).toHaveBeenCalledWith("Desktop display detection is unavailable.", {
    module: "overlay-surfaces",
    source: "desktop-overlay.displays.unavailable",
    correlationId: "ref-desktop-displays",
    processingId: null,
    metadata: {
      displayCount: 0,
      hostMessage: "No displays were returned.",
      hostState: "unavailable",
      nextStep: "Reconnect the display and retry. Restart the Windows desktop app if detection remains unavailable."
    }
  });
});

it("logs when desktop display detection recovers", async () => {
  const { service, host, logger } = fixture();
  host.getStatus.mockRejectedValue(new Error("screen API unavailable"));
  await service.load();

  host.getStatus.mockResolvedValue({ available: true, displays: [{ id: "monitor", label: "Monitor",
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], state: "disabled", message: null });
  await service.load();

  expect(logger.info).toHaveBeenCalledWith("Desktop display detection recovered.", {
    module: "overlay-surfaces",
    source: "desktop-overlay.displays.recovered",
    correlationId: "ref-desktop-displays",
    processingId: null,
    metadata: {
      displayCount: 1,
      hostState: "disabled",
      nextStep: "Test the desktop overlay to confirm playback on the restored display."
    }
  });
});

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

it("allows a disconnected legacy display without a saved label to be disabled", async () => {
  const { service, surfaces, host, value } = fixture();
  await surfaces.save({ ...(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: true, displayId: "legacy", displayLabel: null, autoFollowDisplayName: false });
  host.getStatus.mockResolvedValue({ available: true, displays: [], state: "unavailable", message: "disconnected" });

  await expect(service.save("desktop:primary", {
    ...editable(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: false
  })).resolves.toBeDefined();
  expect(value()).toMatchObject({ enabled: false, displayId: "legacy", displayLabel: null, autoFollowDisplayName: false });
});

it("reconciles one exact display name durably and reports ambiguity without fallback", async () => {
  const { service, surfaces, host, value } = fixture();
  await surfaces.save({ ...(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: true, displayId: "old", displayLabel: "VG27A", autoFollowDisplayName: true });
  host.getStatus.mockResolvedValue({ available: true, displays: [
    { id: "new", label: "VG27A", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ], state: "unavailable", message: null });

  await service.reconcileDesktopBinding();
  expect(surfaces.save).toHaveBeenLastCalledWith(expect.objectContaining({ displayId: "new", displayLabel: "VG27A" }));
  expect(host.configure).toHaveBeenLastCalledWith(expect.objectContaining({ displayId: "new" }));
  expect((await service.load()).desktopBindingState).toBe("rebound");

  await surfaces.save({ ...(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), displayId: "old", displayLabel: "VG27A", autoFollowDisplayName: true });
  host.getStatus.mockResolvedValue({ available: true, displays: [
    { id: "first", label: "VG27A", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: "second", label: "VG27A", bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ], state: "unavailable", message: null });
  host.configure.mockClear();
  await service.reconcileDesktopBinding();
  expect(host.configure).not.toHaveBeenCalled();
  expect((await service.load()).desktopBindingState).toBe("ambiguous");
});

it("reconciles a unique replacement discovered after startup during settings refresh", async () => {
  const { service, surfaces, host, value } = fixture();
  await surfaces.save({ ...(value() as Extract<SurfaceConfiguration, { kind: "desktop" }>), enabled: true, displayId: "old", displayLabel: "VG27A", autoFollowDisplayName: true });
  host.getStatus.mockResolvedValueOnce({ available: true, displays: [
    { id: "old", label: "VG27A", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ], state: "ready", message: null });
  await service.initializeDesktop();
  host.configure.mockClear();
  host.getStatus.mockResolvedValue({ available: true, displays: [
    { id: "new", label: "VG27A", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ], state: "unavailable", message: null });

  const refreshed = await service.load();

  expect(refreshed.desktopBindingState).toBe("rebound");
  expect(value()).toMatchObject({ displayId: "new", displayLabel: "VG27A" });
  expect(host.configure).toHaveBeenCalledWith(expect.objectContaining({ displayId: "new" }));
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
