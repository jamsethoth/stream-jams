import { expect, it, vi } from "vitest";
import type { ResolvedAlertAudio } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, runInTransaction } from "../db/database.js";
import { RuntimeMaintenanceGate } from "../backup/runtime-maintenance-gate.js";
import { SqliteAudioOutputRouteRepository } from "./sqlite-audio-output-route-repository.js";
import { AudioOutputService } from "./audio-output-service.js";

function fixture(available = true) {
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
  const service = new AudioOutputService({
    routes, ...(available ? { host } : {}), isMuted: () => muted, generateId: () => `route-${++id}`,
    runMutation: work => gate.runConfigurationMutation(() => runInTransaction(db.connection, work)),
    runTest: work => gate.runIntake(work)
  });
  return { db, routes, gate, service, host, mute: () => { muted = true; }, [Symbol.dispose]: () => db.close() };
}

it("creates, renames, binds and unbinds using only an enumerated explicit device label", async () => {
  using f = fixture();
  const route = await f.service.createRoute({ name: " Me " });
  expect(route).toEqual({ id: "route-1", name: "Me", deviceId: null, deviceLabel: null });
  expect(await f.service.updateRoute(route.id, { deviceId: "a" })).toMatchObject({ deviceId: "a", deviceLabel: "Headphones" });
  f.host.listOutputDevices.mockResolvedValue([]);
  expect(await f.service.updateRoute(route.id, { name: "Monitor" })).toMatchObject({ name: "Monitor", deviceId: "a" });
  expect((await f.service.getStatus()).routes).toMatchObject([{ state: "missing-device" }]);
  expect(await f.service.updateRoute(route.id, { deviceId: null })).toMatchObject({ deviceId: null, deviceLabel: null });
  f.service.deleteRoute(route.id);
  expect(f.service.listRoutes()).toEqual([]);
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
    layers: [{ layerId: "one", assetId: "tone", volume: 0.5 }, { layerId: "two", assetId: "tone", volume: 0.25 }]
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
    layers: [{ layerId: "one", assetId: "tone", volume: 0.5 }, { layerId: "two", assetId: "tone", volume: 0.25 }]
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
