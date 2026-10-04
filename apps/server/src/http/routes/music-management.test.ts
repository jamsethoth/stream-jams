import { describe, expect, it, vi } from "vitest";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { PearPairingService } from "../../modules/music/pear-pairing-service.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { registerMusicManagementRoutes } from "./music-management.js";
import { createRouteTestApp } from "./test-support/route-test-app.js";

const createApp = createRouteTestApp(registerMusicManagementRoutes);

describe("Music pairing management routes", () => {
  it("protects creation, polling and cancellation with management auth", async () => {
    const sessions = new LocalManagementSessionService({ generateId: () => "session-1", sessionTtlMs: 60_000 });
    const session = await sessions.createSession();
    const pairing = new PearPairingService({
      identityStore: { getSecret: async () => null, setSecret: async () => undefined },
      requestApproval: async () => ({ status: 200, body: { accessToken: "sentinel-secret" } }),
      generateId: () => "pair_opaque_1234567890", generateClientId: () => "stable-client"
    });
    const app = createApp({
      metadata: { appName: "stream-jams", version: "0.0.0" },
      pairing,
      preHandlers: [createTestManagementSecurity(sessions)]
    });
    const payload = { baseUrl: "http://127.0.0.1:26538", transport: "auto" };
    expect((await app.inject({ method: "POST", url: "/management/music/pairing", payload })).statusCode).toBe(401);
    const created = await app.inject({ method: "POST", url: "/management/music/pairing", headers: managementTestHeaders(session, "POST"), payload });
    expect(created.statusCode).toBe(202);
    expect(created.body).not.toContain("sentinel-secret");
    await vi.waitFor(() => expect(pairing.get(created.json().attemptId as string).status).toBe("approved"));
    const url = `/management/music/pairing/${created.json().attemptId as string}`;
    const polled = await app.inject({ method: "GET", url, headers: managementTestHeaders(session, "GET") });
    expect(polled.json()).toMatchObject({ status: "approved" });
    expect(polled.body).not.toContain("sentinel-secret");
    const cancelled = await app.inject({ method: "DELETE", url, headers: managementTestHeaders(session, "DELETE") });
    expect(cancelled.statusCode).toBe(204);
    expect(pairing.get(created.json().attemptId as string).status).toBe("cancelled");
    await app.close();
  });
});
