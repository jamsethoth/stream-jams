import { afterEach, expect, it, vi } from "vitest";
import { createServerApp } from "../../app.js";
import { AudioOutputService } from "../../modules/audio/audio-output-service.js";
import { SqliteAudioOutputRouteRepository } from "../../modules/audio/sqlite-audio-output-route-repository.js";
import { createInMemoryStreamJamsDatabase, runInTransaction } from "../../modules/db/database.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { RuntimeMaintenanceGate } from "../../modules/backup/runtime-maintenance-gate.js";
import { createLocalManagementOriginPolicy, createManagementSecurityPreHandler } from "../middleware/management-security.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture(available = true, maxRequests = 100) {
  const db = createInMemoryStreamJamsDatabase();
  cleanups.push(() => db.close());
  const routes = new SqliteAudioOutputRouteRepository(db.connection);
  const gate = new RuntimeMaintenanceGate();
  const host = {
    listOutputDevices: vi.fn(async () => [{ deviceId: "headphones", label: "Headphones" }]),
    testOutput: vi.fn(async () => {}),
    retry: vi.fn(async () => {})
  };
  const service = new AudioOutputService({
    routes, ...(available ? { host } : {}), isMuted: () => false, generateId: () => "route-a",
    runMutation: work => gate.runConfigurationMutation(() => runInTransaction(db.connection, work)), runTest: work => gate.runIntake(work)
  });
  const sessions = new LocalManagementSessionService();
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "0.0.0" }, audioOutputService: service,
    managementSessionService: sessions,
    managementAuthPreHandler: createManagementSecurityPreHandler({ sessionService: sessions, originPolicy: createLocalManagementOriginPolicy({ host: "127.0.0.1", port: 39187, environment: {} }) }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: new LocalManagementRateLimiter({ maxRequests, windowMs: 60_000 }) })
  });
  cleanups.push(() => app.close());
  const session = (await app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  return { app, db, service, routes, gate, host, headers: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken } };
}

it("serves protected CRUD, device/status and explicit test APIs", async () => {
  const { app, headers, host } = await fixture();
  expect((await app.inject({ method: "GET", url: "/audio/routes", headers })).json()).toEqual({ routes: [] });
  const created = await app.inject({ method: "POST", url: "/audio/routes", headers, payload: { name: " Me ", deviceId: "headphones" } });
  expect(created.statusCode, created.body).toBe(201);
  expect(created.json()).toMatchObject({ id: "route-a", name: "Me", deviceLabel: "Headphones" });
  expect((await app.inject({ method: "GET", url: "/audio/devices", headers })).json()).toMatchObject({ available: true, devices: [{ deviceId: "headphones" }] });
  expect((await app.inject({ method: "GET", url: "/audio/status", headers })).json()).toMatchObject({ muted: false, routes: [{ route: { id: "route-a" }, state: "ready" }] });
  expect((await app.inject({ method: "POST", url: "/audio/routes/route-a/test", headers })).json()).toEqual({ routeId: "route-a", muted: false });
  expect(host.testOutput).toHaveBeenCalledExactlyOnceWith("headphones");
  expect((await app.inject({ method: "POST", url: "/audio/retry", headers })).statusCode).toBe(204);
  expect(host.retry).toHaveBeenCalledTimes(1);
  expect((await app.inject({ method: "PATCH", url: "/audio/routes/route-a", headers, payload: { name: "Monitor", deviceId: null } })).json()).toMatchObject({ name: "Monitor", deviceId: null, deviceLabel: null });
  expect((await app.inject({ method: "DELETE", url: "/audio/routes/route-a", headers })).statusCode).toBe(204);
});

it("requires authentication on every route, and CSRF plus trusted origin for every mutation", async () => {
  const { app, headers, host, routes } = await fixture();
  routes.save({ id: "route-a", name: "Me", deviceId: "headphones", deviceLabel: "Headphones" });
  for (const url of ["/audio/routes", "/audio/devices", "/audio/status"]) {
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  }
  for (const [method, url, payload] of [
    ["POST", "/audio/routes", { name: "New" }],
    ["PATCH", "/audio/routes/route-a", { deviceId: null }],
    ["DELETE", "/audio/routes/route-a", undefined],
    ["POST", "/audio/routes/route-a/test", {}],
    ["POST", "/audio/retry", {}]
  ] as const) {
    for (const [requestHeaders, status] of [[{}, 401], [{ authorization: headers.authorization }, 403], [{ ...headers, origin: "https://hostile.example" }, 403]] as const) {
      const result = await app.inject({ method, url, headers: requestHeaders, ...(payload === undefined ? {} : { payload }) });
      expect(result.statusCode, result.body).toBe(status);
    }
  }
  expect(routes.list()).toHaveLength(1);
  expect(host.listOutputDevices).not.toHaveBeenCalled();
  expect(host.testOutput).not.toHaveBeenCalled();
});

it("rejects malformed/unknown fields and throttles explicit tests before the sink", async () => {
  const { app, headers, host, routes } = await fixture(true, 3);
  routes.save({ id: "route-a", name: "Me", deviceId: "headphones", deviceLabel: "Headphones" });
  for (const payload of [{ deviceId: "default" }, { volume: 1 }, { confirmLiveImpact: true }]) {
    expect((await app.inject({ method: "POST", url: "/audio/routes/route-a/test", headers, payload })).statusCode).toBe(400);
  }
  expect((await app.inject({ method: "POST", url: "/audio/routes/route-a/test", headers })).statusCode).toBe(429);
  expect(host.testOutput).not.toHaveBeenCalled();
  expect(host.listOutputDevices).not.toHaveBeenCalled();
});

it("rejects unsupported retry fields before reaching the desktop host", async () => {
  const { app, headers, host } = await fixture();
  expect((await app.inject({ method: "POST", url: "/audio/retry", headers, payload: { force: true } })).statusCode).toBe(400);
  expect(host.retry).not.toHaveBeenCalled();
});

it("returns safe reference conflicts and requires confirmation before rebinding used routes", async () => {
  const { app, headers, routes, db, host } = await fixture();
  routes.save({ id: "route-a", name: "Me", deviceId: "headphones", deviceLabel: "Headphones" });
  db.connection.exec("INSERT INTO alert_rules VALUES ('alert-a', 'Follow', 'follow', 0, 0, 0)");
  db.connection.prepare("INSERT INTO alert_editor_documents VALUES (?, ?, ?)").run("alert-a", JSON.stringify({ name: "Follow", outputs: { browserSource: false, deviceRouteIds: ["route-a"] } }), "2026-09-05");
  const deleted = await app.inject({ method: "DELETE", url: "/audio/routes/route-a", headers });
  expect(deleted.statusCode, deleted.body).toBe(409);
  expect(deleted.json()).toMatchObject({ error: { code: "AUDIO_ROUTE_REFERENCED", references: [{ alertId: "alert-a", name: "Follow" }], nextStep: expect.any(String) } });
  expect((await app.inject({ method: "PATCH", url: "/audio/routes/route-a", headers, payload: { deviceId: null } })).statusCode).toBe(409);
  expect((await app.inject({ method: "PATCH", url: "/audio/routes/route-a", headers, payload: { deviceId: null, confirmLiveImpact: true } })).statusCode).toBe(200);
  expect(host.testOutput).not.toHaveBeenCalled();
});

it("fails closed when desktop is unavailable or maintenance owns configuration", async () => {
  const { app, headers, routes, gate, host } = await fixture(false);
  routes.save({ id: "route-a", name: "Me", deviceId: "headphones", deviceLabel: "Headphones" });
  expect((await app.inject({ method: "GET", url: "/audio/devices", headers })).json()).toMatchObject({ available: false, devices: [] });
  expect((await app.inject({ method: "POST", url: "/audio/routes/route-a/test", headers })).statusCode).toBe(503);
  await gate.runMaintenance(async () => {
    expect((await app.inject({ method: "DELETE", url: "/audio/routes/route-a", headers })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/audio/routes/route-a/test", headers })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/audio/retry", headers })).statusCode).toBe(409);
  });
  expect(routes.findById("route-a")).not.toBeNull();
  expect(host.testOutput).not.toHaveBeenCalled();
  expect(host.retry).not.toHaveBeenCalled();
});
