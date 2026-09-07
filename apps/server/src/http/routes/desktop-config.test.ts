import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { DesktopConfigService } from "../../config/desktop-config-service.js";
import { createDefaultAppConfig } from "../../config/default-config.js";
import { FileConfigStore } from "../../config/file-config-store.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createLocalManagementOriginPolicy, createManagementSecurityPreHandler } from "../middleware/management-security.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture(available = true, maxRequests = 20) {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-config-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const store = new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: createDefaultAppConfig(root) });
  const applied: boolean[] = [];
  const service = new DesktopConfigService(store, available ? async (config) => {
    expect((await store.readConfig()).desktop).toEqual(config);
    applied.push(config.closeToTray);
  } : undefined);
  const sessions = new LocalManagementSessionService();
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "0.0.0" },
    desktopConfigService: service,
    managementSessionService: sessions,
    managementAuthPreHandler: createManagementSecurityPreHandler({ sessionService: sessions, originPolicy: createLocalManagementOriginPolicy({ host: "127.0.0.1", port: 39187, environment: {} }) }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: new LocalManagementRateLimiter({ maxRequests, windowMs: 60_000 }) })
  });
  cleanups.push(() => app.close());
  const session = (await app.inject({ method: "POST", url: "/auth/management/sessions" })).json() as { id: string; csrfToken: string };
  return { app, store, applied, headers: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken } };
}

it("persists the close policy before applying it and keeps runtime availability out of config", async () => {
  const { app, store, headers, applied } = await fixture();
  expect((await app.inject({ method: "GET", url: "/config/desktop", headers })).json()).toEqual({ available: true, closeToTray: true });
  const response = await app.inject({ method: "PATCH", url: "/config/desktop", headers, payload: { closeToTray: false } });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toEqual({ available: true, closeToTray: false });
  expect((await store.readConfig()).desktop).toEqual({ closeToTray: false });
  expect(applied).toEqual([false]);
});

it("requires a session, CSRF proof, and an approved origin before changing the preference", async () => {
  const { app, store, headers, applied } = await fixture();
  for (const [requestHeaders, status] of [
    [{}, 401],
    [{ authorization: headers.authorization }, 403],
    [{ ...headers, origin: "https://hostile.example" }, 403]
  ] as const) {
    const response = await app.inject({ method: "PATCH", url: "/config/desktop", headers: requestHeaders, payload: { closeToTray: false } });
    expect(response.statusCode, response.body).toBe(status);
  }
  expect((await store.readConfig()).desktop.closeToTray).toBe(true);
  expect(applied).toEqual([]);
});

it("rejects malformed and unknown fields and limits repeated config reads", async () => {
  const { app, headers } = await fixture(true, 4);
  for (const payload of [{ closeToTray: "false" }, { available: true }]) {
    expect((await app.inject({ method: "PATCH", url: "/config/desktop", headers, payload })).statusCode).toBe(400);
  }
  for (let request = 0; request < 4; request += 1) {
    expect((await app.inject({ method: "GET", url: "/config/desktop", headers })).statusCode).toBe(200);
  }
  expect((await app.inject({ method: "GET", url: "/config/desktop", headers })).statusCode).toBe(429);
});

it("preserves the preference but rejects desktop-only writes in CLI mode", async () => {
  const { app, headers, store } = await fixture(false);
  expect((await app.inject({ method: "GET", url: "/config/desktop", headers })).json()).toEqual({ available: false, closeToTray: true });
  expect((await app.inject({ method: "PATCH", url: "/config/desktop", headers, payload: { closeToTray: false } })).statusCode).toBe(409);
  expect((await store.readConfig()).desktop.closeToTray).toBe(true);
});
