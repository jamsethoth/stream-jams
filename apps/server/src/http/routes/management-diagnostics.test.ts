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
