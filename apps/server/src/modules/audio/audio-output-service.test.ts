import { expect, it, vi } from "vitest";
import type { Logger, ResolvedAlertAudio } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, runInTransaction } from "../db/database.js";
import { RuntimeMaintenanceGate } from "../backup/runtime-maintenance-gate.js";
import { SqliteAudioOutputRouteRepository } from "./sqlite-audio-output-route-repository.js";
import { AudioOutputService } from "./audio-output-service.js";

function fixture(available = true, onRoutesChanged?: () => void) {
  const db = createInMemoryStreamJamsDatabase();
  const routes = new SqliteAudioOutputRouteRepository(db.connection);
  const gate = new RuntimeMaintenanceGate();
  let muted = false;
  let id = 0;
  const host = {
    listOutputDevices: vi.fn(async () => [{ deviceId: "a", label: "Headphones" }, { deviceId: "default", label: "Default" }]),
    testOutput: vi.fn<(deviceId: string) => Promise<void>>(async () => {}),
    retry: vi.fn(async () => {})
  };
  const logger: Logger = {
    debug: vi.fn(async () => {}),
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {})
  };
  const dependencies = {
    routes, ...(available ? { host } : {}), isMuted: () => muted, generateId: () => `route-${++id}`,
    runMutation: <T>(work: () => T) => gate.runConfigurationMutation(() => runInTransaction(db.connection, work)),
    runTest: <T>(work: () => Promise<T>) => gate.runIntake(work), logger, generateReferenceId: () => "ref-audio-devices",
    ...(onRoutesChanged === undefined ? {} : { onRoutesChanged })
  };
  const service = new AudioOutputService(dependencies);
  return { db, routes, gate, service, host, logger, mute: () => { muted = true; }, [Symbol.dispose]: () => db.close() };
}

it("logs the native cause when audio device detection and explicit recovery fail", async () => {
  using f = fixture();
  const detectionError = new Error("renderer channel closed");
  const retryError = new Error("audio renderer did not initialize");
  f.host.listOutputDevices.mockRejectedValueOnce(detectionError);
  f.host.retry.mockRejectedValueOnce(retryError);

  await expect(f.service.getDevices()).resolves.toMatchObject({ available: false, reason: "enumeration-failed" });
  await expect(f.service.retry()).rejects.toMatchObject({ code: "AUDIO_RETRY_FAILED" });

  expect(f.logger.error).toHaveBeenCalledWith("Audio output device detection failed.", {
    module: "audio-output",
    source: "audio-output.devices.enumeration-failed",
    correlationId: "ref-audio-devices",
    processingId: null,
    metadata: {
      errorName: "Error",
      errorMessage: "renderer channel closed",
      nextStep: "Reconnect the output device and retry. Restart the desktop app if device discovery remains unavailable."
    }
  }, detectionError);
  expect(f.logger.error).toHaveBeenCalledWith("Desktop audio recovery failed.", {
    module: "audio-output",
    source: "audio-output.retry.failed",
    correlationId: "ref-audio-devices",
    processingId: null,
    metadata: {
      errorName: "Error",
      errorMessage: "audio renderer did not initialize",
      nextStep: "Restart the desktop app if retry continues to fail."
    }
  }, retryError);
});

it("logs a transition to zero detected audio outputs without repeating it on status polling", async () => {
  using f = fixture();
  f.host.listOutputDevices.mockResolvedValue([]);

  await f.service.getDevices();
  await f.service.getDevices();

  expect(f.logger.warn).toHaveBeenCalledOnce();
  expect(f.logger.warn).toHaveBeenCalledWith("No explicit audio output devices were detected.", {
    module: "audio-output",
    source: "audio-output.devices.none-detected",
    correlationId: "ref-audio-devices",
    processingId: null,
    metadata: { deviceCount: 0, nextStep: "Reconnect the output device, then retry detection from Audio outputs." }
  });
});

it("logs when audio output device detection recovers", async () => {
  using f = fixture();
  f.host.listOutputDevices.mockRejectedValue(new Error("renderer channel closed"));

  await f.service.getDevices();
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "a", label: "Headphones" }]);
  await f.service.getDevices();

  expect(f.logger.info).toHaveBeenCalledWith("Audio output device detection recovered.", {
    module: "audio-output",
    source: "audio-output.devices.recovered",
    correlationId: "ref-audio-devices",
    processingId: null,
    metadata: {
      deviceCount: 1,
      nextStep: "Test an audio output to confirm playback on the restored device."
    }
  });
});

it("logs missing saved audio bindings once when other output devices are still detected", async () => {
  using f = fixture();
  f.routes.save({ id: "route-saved", name: "Speakers", deviceId: "disconnected", deviceLabel: "Speakers", autoFollowDeviceName: true });
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "headphones", label: "Headphones" }]);

  await f.service.getStatus();
  await f.service.getStatus();

  expect(f.logger.warn).toHaveBeenCalledOnce();
  expect(f.logger.warn).toHaveBeenCalledWith("Saved audio output bindings are unavailable.", {
    module: "audio-output",
    source: "audio-output.routes.missing-device",
    correlationId: "ref-audio-devices",
    processingId: null,
    metadata: {
      ambiguousMatchCount: 0,
      autoFollowDisabledCount: 0,
      detectedDeviceCount: 1,
      missingRouteCount: 1,
      noMatchCount: 1,
      nextStep: "Reconnect the saved device or bind each unavailable route to a detected output."
    }
  });
});

it("logs when missing saved audio bindings recover", async () => {
  using f = fixture();
  f.routes.save({ id: "route-saved", name: "Speakers", deviceId: "disconnected", deviceLabel: "Speakers", autoFollowDeviceName: false });
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "headphones", label: "Headphones" }]);
  await f.service.getStatus();

  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "disconnected", label: "Speakers" }]);
  await f.service.getStatus();

  expect(f.logger.info).toHaveBeenCalledWith("Saved audio output bindings recovered.", {
    module: "audio-output",
    source: "audio-output.routes.recovered",
    correlationId: "ref-audio-devices",
    processingId: null,
    metadata: {
      detectedDeviceCount: 1,
      recoveredRouteCount: 1,
      nextStep: "Test the recovered audio output route to confirm playback."
    }
  });
});

it("does not report missing bindings recovered while device enumeration is unavailable", async () => {
  using f = fixture();
  f.routes.save({ id: "route-saved", name: "Speakers", deviceId: "disconnected", deviceLabel: "Speakers", autoFollowDeviceName: false });
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "headphones", label: "Headphones" }]);
  await f.service.getStatus();

  f.host.listOutputDevices.mockRejectedValue(new Error("renderer channel closed"));
  await f.service.getStatus();
  expect(f.logger.info).not.toHaveBeenCalledWith("Saved audio output bindings recovered.", expect.anything());

  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "disconnected", label: "Speakers" }]);
  await f.service.getStatus();
  expect(f.logger.info).toHaveBeenCalledWith("Saved audio output bindings recovered.", expect.objectContaining({
    source: "audio-output.routes.recovered"
  }));
});

it("creates, renames, binds and unbinds using only an enumerated explicit device label", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: " Me " });
  expect(route).toEqual({ id: "route-1", name: "Me", deviceId: null, deviceLabel: null, autoFollowDeviceName: false });
  expect(await f.service.updateRoute(route.id, { deviceId: "a" })).toMatchObject({ deviceId: "a", deviceLabel: "Headphones" });
  expect(await f.service.updateRoute(route.id, { autoFollowDeviceName: true })).toMatchObject({ autoFollowDeviceName: true });
  f.host.listOutputDevices.mockResolvedValue([]);
  expect(await f.service.updateRoute(route.id, { name: "Monitor" })).toMatchObject({ name: "Monitor", deviceId: "a" });
  expect((await f.service.getStatus()).routes).toMatchObject([{ state: "missing-device" }]);
  expect(await f.service.updateRoute(route.id, { deviceId: null })).toMatchObject({ deviceId: null, deviceLabel: null, autoFollowDeviceName: false });
  f.service.deleteRoute(route.id);
  expect(f.service.listRoutes()).toEqual([]);
});

it("reconciles only an opted-in unique exact label and reports other outcomes", async () => {
  using f = fixture();
  const optedOut = await f.service.createRoute({ name: "Opted out", deviceId: "a" });
  const unique = await f.service.createRoute({ name: "Unique", deviceId: "a", autoFollowDeviceName: true });
  const caseMismatch = await f.service.createRoute({ name: "Case", deviceId: "a", autoFollowDeviceName: true });
  const ambiguous = await f.service.createRoute({ name: "Ambiguous", deviceId: "a", autoFollowDeviceName: true });
  f.routes.save({ ...caseMismatch, deviceLabel: "HEADPHONES" });
  f.host.listOutputDevices.mockResolvedValue([
    { deviceId: "new-a", label: "Headphones" },
    { deviceId: "new-b", label: "Headphones" }
  ]);

  let status = await f.service.getStatus();
  expect(status.routes.find(item => item.route.id === optedOut.id)).toMatchObject({ state: "missing-device", automaticBindingState: "disabled" });
  expect(status.routes.find(item => item.route.id === caseMismatch.id)).toMatchObject({ state: "missing-device", automaticBindingState: "no-match" });
  expect(status.routes.find(item => item.route.id === ambiguous.id)).toMatchObject({ state: "missing-device", automaticBindingState: "ambiguous" });
  expect(status.routes.find(item => item.route.id === unique.id)).toMatchObject({ state: "missing-device", automaticBindingState: "ambiguous" });

  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "new-a", label: "Headphones" }]);
  await f.service.reconcileBindings();
  status = await f.service.getStatus();
  expect(status.routes.find(item => item.route.id === unique.id)).toMatchObject({
    state: "ready",
    automaticBindingState: "rebound",
    route: { deviceId: "new-a", deviceLabel: "Headphones", name: "Unique", autoFollowDeviceName: true }
  });
  expect(f.routes.findById(optedOut.id)?.deviceId).toBe("a");
});

it("does not overwrite a same-label manual rebind or resurrect deletion while reconciliation is pending", async () => {
  using f = fixture();
  const manual = await f.service.createRoute({ name: "Manual", deviceId: "a", autoFollowDeviceName: true });
  const deleted = await f.service.createRoute({ name: "Deleted", deviceId: "a", autoFollowDeviceName: true });
  const devices = deferred<Array<{ deviceId: string; label: string }>>();
  f.host.listOutputDevices.mockReturnValue(devices.promise);
  const pending = f.service.reconcileBindings();
  f.routes.save({ ...manual, deviceId: "chosen", deviceLabel: "Headphones" });
  f.routes.delete(deleted.id);
  devices.resolve([{ deviceId: "new", label: "Headphones" }]);
  await pending;

  expect(f.routes.findById(manual.id)).toMatchObject({ deviceId: "chosen", deviceLabel: "Headphones" });
  expect(f.routes.findById(deleted.id)).toBeNull();
});

it("keeps the saved ID authoritative when automatic persistence fails", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: "Private", deviceId: "a", autoFollowDeviceName: true });
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "new", label: "Headphones" }]);
  f.db.connection.exec("CREATE TRIGGER fail_rebind BEFORE UPDATE ON audio_output_routes BEGIN SELECT RAISE(ABORT, 'save failed'); END");

  await expect(f.service.reconcileBindings()).rejects.toThrow("save failed");
  expect(f.routes.findById(route.id)?.deviceId).toBe("a");
  await expect(f.service.preparePlayback("failed", [{
    documentId: "alert", durationMs: 1000,
    outputs: { browserSource: false, deviceRouteIds: [route.id] },
    layers: [{ sourceKind: "audio", layerId: "sound", assetId: "tone", volume: 1 }]
  }])).resolves.toEqual({ batches: [], unavailableRouteIds: [route.id] });
});

it("persists discovery-triggered recovery for only the next occurrence", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: "Private", deviceId: "a", autoFollowDeviceName: true });
  const audio: ResolvedAlertAudio[] = [{
    documentId: "alert", durationMs: 1000,
    outputs: { browserSource: false, deviceRouteIds: [route.id] },
    layers: [{ sourceKind: "audio", layerId: "sound", assetId: "tone", volume: 1 }]
  }];
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "new", label: "Headphones" }]);

  expect(await f.service.preparePlayback("trigger", audio)).toEqual({ batches: [], unavailableRouteIds: [route.id] });
  expect(f.routes.findById(route.id)?.deviceId).toBe("new");
  expect(await f.service.preparePlayback("later", audio)).toMatchObject({
    unavailableRouteIds: [],
    batches: [{ destinations: [{ deviceId: "new", routeIds: [route.id] }] }]
  });
});

it("rejects invalid fields, unavailable devices and missing routes before touching playback", async () => {
  using f = fixture();
  for (const deviceId of ["default", "communications", "missing", ""]) {
    await expect(f.service.createRoute({ name: "Me", deviceId })).rejects.toBeDefined();
  }
  await expect(f.service.updateRoute("missing", { name: "Renamed" })).rejects.toMatchObject({ statusCode: 404 });
  await expect(f.service.testRoute("missing", {})).rejects.toMatchObject({ statusCode: 404 });
  expect(f.host.testOutput).not.toHaveBeenCalled();
  expect(f.service.listRoutes()).toEqual([]);
});

it("keeps named routes usable in CLI mode but reports device capability as unavailable", async () => {
  using f = fixture(false);
  const route = await f.service.createRoute({ name: "Stream" });
  expect(await f.service.getDevices()).toMatchObject({ available: false, devices: [], reason: "desktop-unavailable" });
  await expect(f.service.updateRoute(route.id, { deviceId: "a" })).rejects.toMatchObject({ code: "AUDIO_DEVICES_UNAVAILABLE" });
  f.routes.save({ ...route, deviceId: "a", deviceLabel: "Headphones" });
  expect(await f.service.getStatus()).toMatchObject({ routes: [{ state: "unavailable", route: { deviceId: "a" } }] });
  await expect(f.service.testRoute(route.id, {})).rejects.toMatchObject({ code: "AUDIO_DEVICES_UNAVAILABLE" });
  expect(f.host.testOutput).not.toHaveBeenCalled();
});

it("sanitizes enumeration/playback failures and never substitutes another device", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: "Me", deviceId: "a" });
  f.host.listOutputDevices.mockRejectedValue(new Error("private native failure"));
  expect(await f.service.getDevices()).toMatchObject({ available: false, reason: "enumeration-failed" });
  await expect(f.service.testRoute(route.id, {})).rejects.toMatchObject({ code: "AUDIO_DEVICES_UNAVAILABLE" });
  expect(f.host.testOutput).not.toHaveBeenCalled();
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "a", label: "Headphones" }]);
  f.host.testOutput.mockRejectedValue(new Error("private native failure"));
  await expect(f.service.testRoute(route.id, {})).rejects.toMatchObject({ code: "AUDIO_ROUTE_TEST_FAILED", routeIds: [route.id] });
  expect(f.host.testOutput).toHaveBeenCalledWith("a");
});

it("rechecks mute after enumeration and holds the maintenance gate until the test ends", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: "Me", deviceId: "a" });
  const completion = deferred<void>();
  f.host.testOutput.mockReturnValue(completion.promise);
  const pending = f.service.testRoute(route.id, {});
  await vi.waitFor(() => expect(f.host.testOutput).toHaveBeenCalledTimes(1));
  await expect(f.gate.runMaintenance(async () => {})).rejects.toThrow(/intake/);
  await expect(f.service.testRoute(route.id, {})).rejects.toMatchObject({ code: "AUDIO_TEST_BUSY" });
  completion.resolve(undefined);
  expect(await pending).toEqual({ routeId: route.id, muted: false });
  f.host.listOutputDevices.mockImplementation(async () => { f.mute(); return [{ deviceId: "a", label: "Headphones" }]; });
  expect(await f.service.testRoute(route.id, {})).toEqual({ routeId: route.id, muted: true });
  expect(f.host.testOutput).toHaveBeenCalledTimes(1);
  await f.gate.runMaintenance(async () => {
    await expect(f.service.createRoute({ name: "Blocked" })).rejects.toThrow(/maintenance/);
    await expect(f.service.testRoute(route.id, {})).rejects.toThrow(/maintenance/);
  });
});

it("retries the desktop audio host through the maintenance intake gate", async () => {
  using f = fixture();

  await expect(f.service.retry()).resolves.toBeUndefined();
  expect(f.host.retry).toHaveBeenCalledTimes(1);
  await f.gate.runMaintenance(async () => {
    await expect(f.service.retry()).rejects.toThrow(/maintenance/);
  });
  expect(f.host.retry).toHaveBeenCalledTimes(1);
});

it("returns safe retry failures when the desktop host is absent or cannot recover", async () => {
  using unavailable = fixture(false);
  await expect(unavailable.service.retry()).rejects.toMatchObject({ code: "AUDIO_RETRY_UNAVAILABLE" });
  expect(unavailable.host.retry).not.toHaveBeenCalled();

  using failed = fixture();
  failed.host.retry.mockRejectedValueOnce(new Error("private renderer failure"));
  await expect(failed.service.retry()).rejects.toMatchObject({ code: "AUDIO_RETRY_FAILED", statusCode: 503 });
});

it("does not resurrect a route deleted while binding enumeration was pending", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: "Me" });
  const devices = deferred<Array<{ deviceId: string; label: string }>>();
  f.host.listOutputDevices.mockReturnValue(devices.promise);
  const update = f.service.updateRoute(route.id, { deviceId: "a" });
  f.service.deleteRoute(route.id);
  devices.resolve([{ deviceId: "a", label: "Headphones" }]);
  await expect(update).rejects.toMatchObject({ statusCode: 404 });
  expect(f.service.listRoutes()).toEqual([]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it("snapshots bindings before asynchronous discovery and uses fresh bindings on the next occurrence", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: "Personal", deviceId: "a" });
  const audio: ResolvedAlertAudio[] = [{
    documentId: "alert", durationMs: 3000,
    outputs: { browserSource: false, deviceRouteIds: [route.id] },
    layers: [{ sourceKind: "audio", layerId: "one", assetId: "tone", volume: 0.5 }, { sourceKind: "audio", layerId: "two", assetId: "tone", volume: 0.25 }]
  }];
  expect(f.service).toHaveProperty("preparePlayback");
  const devices = deferred<Array<{ deviceId: string; label: string }>>();
  f.host.listOutputDevices.mockReturnValueOnce(devices.promise);
  const preparing = f.service.preparePlayback("first", audio);
  f.routes.save({ ...route, deviceId: "b", deviceLabel: "Stream" });
  devices.resolve([{ deviceId: "a", label: "Headphones" }, { deviceId: "b", label: "Stream" }]);
  const prepared = await preparing;
  expect(prepared).toMatchObject({ unavailableRouteIds: [], batches: [{
    playbackId: "first", layers: audio[0]!.layers,
    destinations: [{ deviceId: "a", routeIds: [route.id] }]
  }] });
  f.host.listOutputDevices.mockResolvedValue([{ deviceId: "b", label: "Stream" }]);
  f.mute();
  expect(await f.service.preparePlayback("replay", audio)).toMatchObject({ batches: [{
    playbackId: "replay", muted: true, destinations: [{ deviceId: "b", routeIds: [route.id] }]
  }] });
  expect(prepared.batches[0]?.destinations[0]?.deviceId).toBe("a");
});

it("reports missing/unbound routes without fallback while retaining healthy destinations and distinct layers", async () => {
  using f = fixture();
  const healthy = await f.service.createRoute({ name: "Personal", deviceId: "a" });
  const alias = await f.service.createRoute({ name: "Alias", deviceId: "a" });
  const unbound = await f.service.createRoute({ name: "Unbound" });
  expect(f.service).toHaveProperty("preparePlayback");
  const audio: ResolvedAlertAudio[] = [{
    documentId: "alert", durationMs: 3000,
    outputs: { browserSource: true, deviceRouteIds: [healthy.id, alias.id, unbound.id, "deleted"] },
    layers: [{ sourceKind: "audio", layerId: "one", assetId: "tone", volume: 0.5 }, { sourceKind: "audio", layerId: "two", assetId: "tone", volume: 0.25 }]
  }];
  expect(await f.service.preparePlayback("first", audio)).toEqual({
    unavailableRouteIds: [unbound.id, "deleted"],
    batches: [{ playbackId: "first", documentId: "alert", durationMs: 3000, muted: false,
      layers: audio[0]!.layers, destinations: [{ deviceId: "a", routeIds: [healthy.id, alias.id] }] }]
  });
  f.host.listOutputDevices.mockRejectedValue(new Error("private error"));
  expect(await f.service.preparePlayback("next", audio)).toEqual({
    unavailableRouteIds: audio[0]!.outputs.deviceRouteIds, batches: []
  });
});

it("tells route consumers after a route is rebound or deleted, but not after a failed change", async () => {
  const changed = vi.fn();
  using f = fixture(true, changed);
  const route = await f.service.createRoute({ name: "Stream" });
  expect(changed).not.toHaveBeenCalled();
  await f.service.updateRoute(route.id, { deviceId: "a" });
  expect(changed).toHaveBeenCalledTimes(1);
  await expect(f.service.updateRoute(route.id, { name: "" })).rejects.toBeDefined();
  expect(changed).toHaveBeenCalledTimes(1);
  f.service.deleteRoute(route.id);
  expect(changed).toHaveBeenCalledTimes(2);
});
