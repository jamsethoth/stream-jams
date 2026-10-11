import { describe, expect, it, vi } from "vitest";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { registerManagementDiagnosticsRoutes } from "./management-diagnostics.js";
import { createRouteTestApp } from "./test-support/route-test-app.js";

const createApp = createRouteTestApp(registerManagementDiagnosticsRoutes);

describe("management client exception route", () => {
  it("requires management auth and CSRF, validates strictly, and records one bounded report", async () => {
    const sessionService = new LocalManagementSessionService({
      clock: () => new Date("2026-09-28T04:00:00.000Z"),
      generateId: () => "mgmt_client_errors",
      sessionTtlMs: 60_000
    });
    const session = await sessionService.createSession();
    const reportClientException = vi.fn(async (input) => ({ referenceId: input.referenceId }));
    const app = createApp({
      metadata: { appName: "stream-jams", version: "0.0.0" },
      getDiagnosticsWorkspace: async () => ({ problems: [], events: [], rawLogs: [] }),
      getConfigurationBackupSummary: async () => ({
        dataDirectory: "C:/data", assetCount: 0, providerCount: 0, overlayKeyCount: 0,
        credentialsIncluded: false, overlayKeysIncluded: false
      } as never),
      openDataFolder: async () => ({ dataDirectory: "C:/data" }),
      clearOldLogs: async () => ({ deletedCount: 0 }),
      reportClientException,
      preHandlers: [createTestManagementSecurity(sessionService)]
    });
    const body = {
      referenceId: "err_client_route",
      source: "react",
      message: "The management interface stopped unexpectedly.",
      exception: {
        type: "TypeError", message: "render failed", stack: "TypeError: render failed", code: null, cause: null, thrownValue: null
      }
    };

    expect((await app.inject({ method: "POST", url: "/management/diagnostics/client-errors", payload: body })).statusCode).toBe(401);
    expect((await app.inject({
      method: "POST", url: "/management/diagnostics/client-errors",
      headers: managementTestHeaders(session, "GET"), payload: body
    })).statusCode).toBe(403);
    const malformed = await app.inject({
      method: "POST", url: "/management/diagnostics/client-errors",
      headers: managementTestHeaders(session, "POST"), payload: { ...body, extra: true }
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain("TypeError: render failed");

    const response = await app.inject({
      method: "POST", url: "/management/diagnostics/client-errors",
      headers: managementTestHeaders(session, "POST"), payload: body
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ referenceId: "err_client_route" });
    expect(reportClientException).toHaveBeenCalledExactlyOnceWith(body);
  });
});

describe("management event bus routes", () => {
  it("serves bus activity and validates the replay age behind management auth", async () => {
    const sessionService = new LocalManagementSessionService({
      clock: () => new Date("2026-10-08T12:00:00.000Z"),
      generateId: () => "mgmt_event_bus",
      sessionTtlMs: 60_000
    });
    const session = await sessionService.createSession();
    let settings = { replayAgeSeconds: 120 };
    const saveEventBusSettings = vi.fn((next: { replayAgeSeconds: number }) => { settings = next; return settings; });
    const activity = {
      events: [{
        id: 1, receivedAt: "2026-10-08T12:00:00.000Z", sourceKind: "twitch" as const, kind: "canonical" as const, eventType: "follow",
        outcome: "accepted" as const, referenceId: null, consumers: [{ consumerId: "alerts", outcome: "admitted" as const, referenceId: null }]
      }]
    };
    const app = createApp({
      metadata: { appName: "stream-jams", version: "0.0.0" },
      getDiagnosticsWorkspace: async () => ({ problems: [], events: [], rawLogs: [] }),
      getConfigurationBackupSummary: async () => ({} as never),
      openDataFolder: async () => ({ dataDirectory: "C:/data" }),
      clearOldLogs: async () => ({ deletedCount: 0 }),
      reportClientException: async (input) => ({ referenceId: input.referenceId }),
      getEventBusActivity: () => activity,
      getEventBusSettings: () => settings,
      saveEventBusSettings,
      preHandlers: [createTestManagementSecurity(sessionService)]
    });

    expect((await app.inject({ method: "GET", url: "/management/diagnostics/event-bus" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/management/settings/event-bus" })).statusCode).toBe(401);
    const read = await app.inject({ method: "GET", url: "/management/diagnostics/event-bus", headers: managementTestHeaders(session, "GET") });
    expect(read.json()).toEqual(activity);
    expect((await app.inject({ method: "GET", url: "/management/settings/event-bus", headers: managementTestHeaders(session, "GET") })).json())
      .toEqual({ replayAgeSeconds: 120 });

    for (const payload of [{ replayAgeSeconds: -1 }, { replayAgeSeconds: 1_801 }, { replayAgeSeconds: 1.5 }, { replayAgeSeconds: 60, extra: true }, {}]) {
      const rejected = await app.inject({ method: "PUT", url: "/management/settings/event-bus", headers: managementTestHeaders(session, "PUT"), payload });
      expect(rejected.statusCode, JSON.stringify(payload)).toBe(400);
      expect(rejected.json()).toMatchObject({ error: { code: "EVENT_BUS_SETTINGS_INVALID" } });
    }
    expect(saveEventBusSettings).not.toHaveBeenCalled();
    const saved = await app.inject({ method: "PUT", url: "/management/settings/event-bus", headers: managementTestHeaders(session, "PUT"), payload: { replayAgeSeconds: 0 } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ replayAgeSeconds: 0 });
  });
});
