import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { TimerDefinition, TimerRunState } from "@stream-jams/core";
import { TimerDefinitionNotFoundError } from "../../modules/timers/timer-management-service.js";
import { createTimerAutomationSecurityPreHandler } from "../middleware/timer-automation-security.js";
import { LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { registerTimerAutomationRoutes } from "./timer-automation.js";

const token = "tmr_valid-generated-token_123456789012";
const definition: TimerDefinition = {
  id: "cat-paws", label: "Cat paws", durationMs: 300_000, iconAssetId: "private-icon",
  startAudioAssetId: "private-start", endAudioAssetId: "private-end",
  outputs: { browserSource: true, deviceRouteIds: ["private-device"] },
  createdAt: "2026-09-29T01:00:00.000Z", updatedAt: "2026-09-29T01:00:00.000Z"
};
const running: TimerRunState = {
  status: "running", definitionId: definition.id, generation: "generation-1",
  snapshot: { ...definition }, startedAtEpochMs: 1_000, endsAtEpochMs: 301_000
};

function fixture() {
  const definitions = { listDefinitions: vi.fn(() => [definition]), getDefinition: vi.fn(() => definition) };
  const result = { changed: true, state: running };
  const runtime = {
    getState: vi.fn(() => running), start: vi.fn(async () => result), pause: vi.fn(async () => result),
    resume: vi.fn(async () => result), stop: vi.fn(async () => ({ changed: true, state: null })), restart: vi.fn(async () => result)
  };
  const app = Fastify({ logger: false });
  registerTimerAutomationRoutes(app, {
    timerManagementService: definitions,
    timerRuntimeCoordinator: runtime,
    timerAutomationAuthPreHandler: createTimerAutomationSecurityPreHandler({
      credentials: { verify: candidate => candidate === token },
      limiter: new LocalManagementRateLimiter({ maxRequests: 100, windowMs: 60_000 })
    })
  });
  return { app, definitions, runtime };
}

describe("timer automation routes", () => {
  it("returns only allowlisted discovery/state fields and exact command results", async () => {
    const { app, runtime } = fixture();
    const headers = { authorization: `Bearer ${token}` };
    const list = await app.inject({ method: "GET", url: "/automation/timers", headers });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json()).toEqual([{ id: "cat-paws", label: "Cat paws", state: {
      status: "running", generation: "generation-1", startedAtEpochMs: 1_000, endsAtEpochMs: 301_000
    } }]);
    expect(list.body).not.toContain("private-");
    for (const command of ["start", "pause", "resume", "stop", "restart"] as const) {
      const response = await app.inject({ method: "POST", url: `/automation/timers/cat-paws/${command}`, headers, payload: {} });
      expect(response.statusCode, response.body).toBe(200);
      expect(runtime[command]).toHaveBeenCalledWith("cat-paws");
    }
    await app.close();
  });

  it("rejects management/overlay credentials, Origins, authoring bodies, invalid IDs, and unknown timers", async () => {
    const { app, definitions, runtime } = fixture();
    for (const authorization of ["Bearer mgmt-session", "Bearer ovl_overlay-key", undefined]) {
      const response = await app.inject({ method: "GET", url: "/automation/timers", ...(authorization === undefined ? {} : { headers: { authorization } }) });
      expect(response.statusCode).toBe(401);
    }
    expect((await app.inject({ method: "GET", url: "/automation/timers", headers: { authorization: `Bearer ${token}`, origin: "http://localhost" } })).statusCode).toBe(403);
    for (const payload of [{ durationMs: 1 }, { label: "Override" }, { routeId: "speaker" }, { assetId: "bell" }, []]) {
      const response = await app.inject({ method: "POST", url: "/automation/timers/cat-paws/start", headers: { authorization: `Bearer ${token}` }, payload });
      expect(response.statusCode).toBe(400);
    }
    expect(runtime.start).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/automation/timers/bad%20id/start", headers: { authorization: `Bearer ${token}` }, payload: {} })).statusCode).toBe(400);
    definitions.getDefinition.mockImplementationOnce(() => { throw new TimerDefinitionNotFoundError("missing"); });
    expect((await app.inject({ method: "POST", url: "/automation/timers/missing/start", headers: { authorization: `Bearer ${token}` }, payload: {} })).statusCode).toBe(404);
    await app.close();
  });
});
