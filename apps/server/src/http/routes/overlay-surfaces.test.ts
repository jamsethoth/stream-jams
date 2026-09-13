import { afterEach, expect, it, vi } from "vitest";
import { createDefaultOverlayModuleRegistry } from "@stream-jams/core";
import { createServerApp } from "../../app.js";
import { SurfaceSettingsService } from "../../modules/overlay-surfaces/surface-settings-service.js";
import { SqliteSurfaceRepository } from "../../modules/overlay-surfaces/sqlite-surface-repository.js";
import { createInMemoryStreamJamsDatabase } from "../../modules/db/database.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createLocalManagementOriginPolicy, createManagementSecurityPreHandler } from "../middleware/management-security.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture(maxRequests = 100) {
  const db = createInMemoryStreamJamsDatabase(); cleanups.push(() => db.close());
  const registry = createDefaultOverlayModuleRegistry();
  const surfaces = new SqliteSurfaceRepository(db.connection, registry);
  const host = { configure: vi.fn(async () => {}), retry: vi.fn(async () => {}), getStatus: vi.fn(async () => ({ available: true,
    displays: [{ id: "one", label: "Display", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], state: "disabled" as const, message: null })) };
  const service = new SurfaceSettingsService({ surfaces, host, moduleIds: () => registry.listModules().map(module => module.id), changed: async () => {}, runMutation: async work => work() });
  const sessions = new LocalManagementSessionService();
  const app = createServerApp({ metadata: { appName: "stream-jams", version: "0.0.0" }, surfaceSettingsService: service,
    managementSessionService: sessions, serverErrorLogger: () => {},
    managementAuthPreHandler: createManagementSecurityPreHandler({ sessionService: sessions, originPolicy: createLocalManagementOriginPolicy({ host: "127.0.0.1", port: 39187, environment: {} }) }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: new LocalManagementRateLimiter({ maxRequests, windowMs: 60000 }) }) });
  cleanups.push(() => app.close());
  const session = (await app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  const value = (await surfaces.list())[0]!;
  return { app, host, surfaces, value, headers: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken } };
}

it("requires management auth, CSRF and trusted origin before any host access", async () => {
  const { app, host, headers, value } = await fixture();
  expect((await app.inject({ method: "GET", url: "/overlay-surfaces" })).statusCode).toBe(401);
  for (const [method, url, payload] of [["PUT", "/overlay-surfaces/desktop%3Aprimary", value], ["POST", "/overlay-surfaces/desktop/retry", {}]] as const) {
    for (const [requestHeaders, expected] of [[{}, 401], [{ authorization: headers.authorization }, 403], [{ ...headers, origin: "https://hostile.example" }, 403]] as const) {
      expect((await app.inject({ method, url, payload, headers: requestHeaders })).statusCode).toBe(expected);
    }
  }
  expect(host.getStatus).not.toHaveBeenCalled(); expect(host.configure).not.toHaveBeenCalled(); expect(host.retry).not.toHaveBeenCalled();
});

it("saves complete settings explicitly and rejects malformed identity/order/retry without changes", async () => {
  const { app, host, headers, value, surfaces } = await fixture();
  expect((await app.inject({ method: "GET", url: "/overlay-surfaces", headers })).statusCode).toBe(200);
  const enabled = { ...value, enabled: true, displayId: "one" };
  for (const payload of [{ ...enabled, id: "other" }, { ...enabled, layers: [] }, { ...enabled, layers: [{ moduleId: "alerts", visible: true }, { moduleId: "alerts", visible: false }] }]) {
    expect((await app.inject({ method: "PUT", url: "/overlay-surfaces/desktop%3Aprimary", headers, payload })).statusCode).toBe(400);
  }
  expect((await surfaces.list())[0]).toEqual(value);
  expect(host.configure).not.toHaveBeenCalled();
  const saved = await app.inject({ method: "PUT", url: "/overlay-surfaces/desktop%3Aprimary", headers, payload: enabled });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(host.configure).toHaveBeenCalledExactlyOnceWith(enabled);
  expect((await app.inject({ method: "POST", url: "/overlay-surfaces/desktop/retry", headers, payload: { play: true } })).statusCode).toBe(400);
  expect(host.retry).not.toHaveBeenCalled();
  expect((await app.inject({ method: "POST", url: "/overlay-surfaces/desktop/retry", headers })).statusCode).toBe(200);
  expect(host.retry).toHaveBeenCalledOnce();
});

it("rate-limits surface reads before querying the native host", async () => {
  const { app, host, headers } = await fixture(1);
  expect((await app.inject({ method: "GET", url: "/overlay-surfaces", headers })).statusCode).toBe(200);
  expect((await app.inject({ method: "GET", url: "/overlay-surfaces", headers })).statusCode).toBe(429);
  expect(host.getStatus).toHaveBeenCalledOnce();
});
