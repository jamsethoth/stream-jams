import { describe, expect, it, vi } from "vitest";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { PearPairingService } from "../../modules/music/pear-pairing-service.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { registerMusicManagementRoutes } from "./music-management.js";
import { createRouteTestApp } from "./test-support/route-test-app.js";
import { musicManagementStatusSchema, musicCredentialReplacementResultSchema } from "@stream-jams/core";

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

  it("accepts a reviewed Pear certificate only with management auth and the exact fingerprint", async () => {
    const sessions = new LocalManagementSessionService({ generateId: () => "session-cert", sessionTtlMs: 60_000 });
    const session = await sessions.createSession();
    const sha256 = Array.from({ length: 32 }, () => "AB").join(":");
    const pairing = new PearPairingService({
      identityStore: { getSecret: async () => "stable-client", setSecret: async () => undefined },
      inspectCertificate: async () => ({ pem: "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n", sha256, subject: "CN=localhost", issuer: "CN=localhost", validFrom: "a", validTo: "b", authorized: false }),
      requestApproval: async () => new Promise(() => {}),
      generateId: () => "pair_certificate_123456"
    });
    const app = createApp({ metadata: { appName: "stream-jams", version: "0.0.0" }, pairing, preHandlers: [createTestManagementSecurity(sessions)] });
    const created = await app.inject({ method: "POST", url: "/management/music/pairing", headers: managementTestHeaders(session, "POST"), payload: { baseUrl: "https://127.0.0.1:26538", transport: "auto" } });
    expect(created.json()).toMatchObject({ status: "certificate-review", certificate: { sha256 } });
    const url = "/management/music/pairing/pair_certificate_123456/certificate";
    expect((await app.inject({ method: "POST", url, payload: { sha256 } })).statusCode).toBe(401);
    const mismatched = await app.inject({ method: "POST", url, headers: managementTestHeaders(session, "POST"), payload: { sha256: sha256.replaceAll("AB", "CD") } });
    expect(mismatched.statusCode).toBe(409);
    const accepted = await app.inject({ method: "POST", url, headers: managementTestHeaders(session, "POST"), payload: { sha256 } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ status: "pending", certificate: null, configuration: { trustedCertificate: { sha256 } } });
    await pairing.dispose();
    await app.close();
  });

  it("keeps status, reconnect and credential replacement behind management authorization", async () => {
    const sessions = new LocalManagementSessionService({ generateId: () => "session-music", sessionTtlMs: 60_000 });
    const session = await sessions.createSession();
    const pairing = { begin: vi.fn(), get: vi.fn(), cancel: vi.fn(), acceptCertificate: vi.fn() };
    const status = musicManagementStatusSchema.parse({ enabled: true, selectedProviderId: "provider-1", status: { state: "auth-required", stale: false, diagnosticReference: "ref_1" }, missingAssetIds: { landscape: ["brand"], vertical: [] } });
    const replacement = musicCredentialReplacementResultSchema.parse({ validation: { valid: true, connectionState: "connected", intakeState: null, validatedAt: "2026-07-15T12:00:00.000Z", availableVoices: [], error: null }, runtimeReconcilePending: false, credentialRetirementPending: false });
    const management = { getStatus: vi.fn(async () => status), reconnect: vi.fn(async () => status) };
    const providers = { replaceMusicCredential: vi.fn(async () => replacement) };
    const app = createApp({ metadata: { appName: "stream-jams", version: "0.0.0" }, pairing, management, providers, preHandlers: [createTestManagementSecurity(sessions)] });
    for (const route of [
      { method: "GET" as const, url: "/management/music/status" },
      { method: "POST" as const, url: "/management/music/providers/provider-1/reconnect" },
      { method: "POST" as const, url: "/management/music/providers/provider-1/credential", payload: { configuration: {}, pairingAttemptId: "opaque" } }
    ]) {
      expect((await app.inject(route)).statusCode).toBe(401);
      expect((await app.inject({ ...route, headers: { authorization: "Bearer overlay-test-key" } })).statusCode).toBe(401);
    }
    const result = await app.inject({ method: "GET", url: "/management/music/status", headers: managementTestHeaders(session, "GET") });
    expect(result.statusCode).toBe(200);
    expect(musicManagementStatusSchema.parse(result.json())).toEqual(status);
    const reconnect = await app.inject({ method: "POST", url: "/management/music/providers/provider-1/reconnect", headers: managementTestHeaders(session, "POST") });
    expect(musicManagementStatusSchema.parse(reconnect.json())).toEqual(status);
    const replaced = await app.inject({ method: "POST", url: "/management/music/providers/provider-1/credential", headers: managementTestHeaders(session, "POST"), payload: { configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, pairingAttemptId: "opaque" } });
    expect(replaced.statusCode).toBe(200);
    expect(musicCredentialReplacementResultSchema.parse(replaced.json())).toEqual(replacement);
    expect(replaced.body).not.toMatch(/access-token|secretRef|Bearer/u);
    await app.close();
  });
});
