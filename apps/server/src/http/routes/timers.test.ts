import { describe, expect, it, vi } from "vitest";
import type { TimerDefinition, TimerRunState } from "@stream-jams/core";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { ActiveTimerDefinitionError, TimerDefinitionNotFoundError } from "../../modules/timers/timer-management-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { createTimerRouteTestApp as createServerApp } from "./test-support/route-test-app.js";

const definition: TimerDefinition = {
  id: "cat-paws", label: "Cat paws", durationMs: 300_000, iconAssetId: null,
  startAudioAssetId: null, endAudioAssetId: null,
  outputs: { browserSource: true, deviceRouteIds: [] },
  createdAt: "2026-09-29T01:00:00.000Z", updatedAt: "2026-09-29T01:00:00.000Z"
};
const running: TimerRunState = {
  status: "running", definitionId: definition.id, generation: "generation-1",
  snapshot: { ...definition }, startedAtEpochMs: 1_000, endsAtEpochMs: 301_000
};

describe("timer management routes", () => {
  it("protects manual adjustments and rejects malformed bodies before mutation", async () => {
    const { app, headers, runtime } = await fixture();
    const payload = { action: "increment", amountMs: 60_000 };
    expect((await app.inject({ method: "POST", url: "/timers/cat-paws/adjust", payload })).statusCode).toBe(401);
    for (const invalid of [{ ...payload, extra: true }, { ...payload, amountMs: -1 }, { ...payload, amountMs: Number.MAX_SAFE_INTEGER }, { action: "restart", amountMs: 0 }]) {
      expect((await app.inject({ method: "POST", url: "/timers/cat-paws/adjust", headers, payload: invalid })).statusCode).toBe(400);
    }
    expect(runtime.adjust).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/timers/cat-paws/adjust", headers, payload })).statusCode).toBe(200);
    expect(runtime.adjust).toHaveBeenCalledWith("cat-paws", payload);
    await app.close();
  });
  it("protects CRUD, state, controls, and credential lifecycle", async () => {
    const { app, headers, definitions, runtime, credentials } = await fixture();
    expect((await app.inject({ method: "GET", url: "/timers" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/timers", headers: { authorization: "Bearer tmr_valid-generated-token_123456789012" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/timers", headers })).json()).toEqual([definition]);
    expect((await app.inject({ method: "GET", url: "/timers/state", headers })).json()).toEqual([running]);
    expect((await app.inject({ method: "GET", url: "/timers/browser-sources", headers })).json()).toEqual([
      expect.objectContaining({ moduleId: "timers", targetProfileId: "landscape", connectionState: "connected" })
    ]);
    expect((await app.inject({ method: "GET", url: "/timers/cat-paws", headers })).json()).toEqual(definition);

    const input = { label: "Oven mitts", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } };
    expect((await app.inject({ method: "POST", url: "/timers", headers, payload: input })).statusCode).toBe(201);
    expect(definitions.createDefinition).toHaveBeenCalledWith(input);
    expect((await app.inject({ method: "PUT", url: "/timers/cat-paws", headers, payload: input })).statusCode).toBe(200);
    expect(definitions.updateDefinition).toHaveBeenCalledWith("cat-paws", input);
    expect((await app.inject({ method: "DELETE", url: "/timers/cat-paws", headers })).statusCode).toBe(204);

    for (const command of ["start", "pause", "resume", "stop", "restart"] as const) {
      const response = await app.inject({ method: "POST", url: `/timers/cat-paws/${command}`, headers, payload: {} });
      expect(response.statusCode, response.body).toBe(200);
      expect(runtime[command]).toHaveBeenCalledWith("cat-paws");
    }

    expect((await app.inject({ method: "GET", url: "/timers/automation-credential", headers })).json()).toEqual({ configured: false, createdAt: null, rotatedAt: null });
    const issued = await app.inject({ method: "POST", url: "/timers/automation-credential/rotate", headers, payload: {} });
    expect(issued.statusCode).toBe(201);
    expect(issued.json()).toMatchObject({ configured: true, token: "tmr_returned-once_12345678901234567890" });
    expect((await app.inject({ method: "DELETE", url: "/timers/automation-credential", headers })).statusCode).toBe(204);
    expect(credentials.revoke).toHaveBeenCalledOnce();
    await app.close();
  });

  it("rejects unknown fields and maps not-found and active conflicts", async () => {
    const { app, headers, definitions } = await fixture();
    expect((await app.inject({ method: "POST", url: "/timers", headers, payload: { ...definition, id: "injected" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/timers/cat-paws/start", headers, payload: { durationMs: 1 } })).statusCode).toBe(400);
    definitions.getDefinition.mockImplementationOnce(() => { throw new TimerDefinitionNotFoundError("missing"); });
    expect((await app.inject({ method: "GET", url: "/timers/missing", headers })).statusCode).toBe(404);
    definitions.deleteDefinition.mockImplementationOnce(() => { throw new ActiveTimerDefinitionError("cat-paws"); });
    expect((await app.inject({ method: "DELETE", url: "/timers/cat-paws", headers })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: "/timers/bad%20id", headers })).statusCode).toBe(400);
    await app.close();
  });
});

async function fixture() {
  const definitions = {
    listDefinitions: vi.fn(() => [definition]), getDefinition: vi.fn(() => definition),
    createDefinition: vi.fn(() => definition), updateDefinition: vi.fn(() => definition), deleteDefinition: vi.fn()
  };
  const result = { changed: true, state: running };
  const runtime = {
    adjust: vi.fn(async () => result), listStates: vi.fn(() => [running]), start: vi.fn(async () => result), pause: vi.fn(async () => result),
    resume: vi.fn(async () => result), stop: vi.fn(async () => ({ changed: true, state: null })), restart: vi.fn(async () => result)
  };
  const credentials = {
    status: vi.fn(() => ({ configured: false, createdAt: null, rotatedAt: null })),
    createOrRotate: vi.fn(() => ({ configured: true, createdAt: "2026-09-29T01:00:00.000Z", rotatedAt: null, token: "tmr_returned-once_12345678901234567890" })),
    revoke: vi.fn()
  };
  const browserSources = {
    listTimerBrowserSources: vi.fn(async () => [{
      id: "module:timers:landscape:live", label: "Timers Landscape Live", purpose: "live", overlayId: "default",
      scope: "module", moduleId: "timers", targetProfileId: "landscape", enabled: true, keyId: "key-1",
      url: "http://127.0.0.1/overlay/modules/timers/live/secret?profile=landscape", copyableUrlStatus: "available",
      connectionState: "connected", lastConnectedAt: "2026-09-29T01:05:00.000Z"
    } as const])
  };
  const sessions = new LocalManagementSessionService({ generateId: () => "mgmt-timers", sessionTtlMs: 60_000 });
  const session = await sessions.createSession();
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "1.2.3" },
    timerManagementService: definitions,
    timerRuntimeCoordinator: runtime,
    timerAutomationCredentialService: credentials,
    outputReadinessService: browserSources,
    managementAuthPreHandler: createTestManagementSecurity(sessions),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: new LocalManagementRateLimiter({ maxRequests: 100, windowMs: 60_000 }) })
  });
  return { app, headers: managementTestHeaders(session, "POST"), definitions, runtime, credentials, browserSources };
}
