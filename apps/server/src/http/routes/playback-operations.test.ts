import type { MergedOperationsSnapshot } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  PlaybackOperationsConflictError,
  UnknownPlaybackOwnerError
} from "../../modules/playback/playback-operations-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

const snapshot: MergedOperationsSnapshot = {
  revision: 3,
  owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
  current: [],
  queued: [],
  recent: [],
  paused: false,
  muted: false,
  doNotDisturb: false
};

describe("playback operations routes", () => {
  it("returns the protected merged snapshot and delegates qualified commands", async () => {
    const { app, authHeaders, service } = await createApp();
    expect((await app.inject({ method: "GET", url: "/playback/operations", headers: authHeaders })).json()).toEqual(snapshot);

    await app.inject({ method: "POST", url: "/playback/operations/screen-effects/effect-1/skip", headers: authHeaders });
    await app.inject({ method: "POST", url: "/playback/operations/alerts/alert-1/remove", headers: authHeaders });
    await app.inject({ method: "POST", url: "/playback/operations/alerts/alert-2/replay", headers: authHeaders });
    await app.inject({ method: "POST", url: "/playback/operations/screen-effects/clear", headers: authHeaders, payload: { expectedPendingCount: 2, observedRevision: 3 } });
    await app.inject({ method: "POST", url: "/playback/operations/screen-effects/pause", headers: authHeaders, payload: { paused: true } });

    expect(service.calls).toEqual([
      "skip:screen-effects:effect-1",
      "remove:alerts:alert-1",
      "replay:alerts:alert-2",
      "clear:screen-effects:2:3",
      "pause:screen-effects:true"
    ]);
  });

  it("returns a fresh snapshot for conflicts and rejects unknown modules", async () => {
    const { app, authHeaders, service } = await createApp();
    service.skip.mockRejectedValueOnce(new PlaybackOperationsConflictError("Playback changed.", snapshot));
    service.remove.mockRejectedValueOnce(new UnknownPlaybackOwnerError("unknown"));

    const conflict = await app.inject({ method: "POST", url: "/playback/operations/alerts/old/skip", headers: authHeaders });
    const missing = await app.inject({ method: "POST", url: "/playback/operations/unknown/one/remove", headers: authHeaders });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: { code: "PLAYBACK_OPERATION_CONFLICT", message: "Playback changed." }, snapshot });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: "PLAYBACK_MODULE_NOT_FOUND", moduleId: "unknown" } });
  });

  it("rejects invalid payloads and unauthenticated mutations before dispatch", async () => {
    const { app, authHeaders, service } = await createApp();
    expect((await app.inject({ method: "POST", url: "/playback/operations/alerts/clear", headers: authHeaders, payload: { expectedPendingCount: -1, observedRevision: 0 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/playback/operations/alerts/pause", headers: authHeaders, payload: { paused: "yes" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/playback/operations/alerts/one/skip" })).statusCode).toBe(401);
    expect(service.calls).toEqual([]);
  });
});

async function createApp() {
  const service = new RecordingOperationsService();
  const sessions = new LocalManagementSessionService({
    clock: () => new Date("2026-09-13T12:00:00.000Z"),
    generateId: () => "mgmt_operations",
    sessionTtlMs: 60_000
  });
  const session = await sessions.createSession();
  const limiter = new LocalManagementRateLimiter({ maxRequests: 100, windowMs: 60_000 });
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "1.2.3" },
    playbackOperationsService: service,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: sessions }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter })
  });
  return { app, service, authHeaders: { authorization: `Bearer ${session.id}` } };
}

class RecordingOperationsService {
  calls: string[] = [];
  getSnapshot = vi.fn(() => snapshot);
  skip = vi.fn(async (moduleId: string, occurrenceId: string) => { this.calls.push(`skip:${moduleId}:${occurrenceId}`); return snapshot; });
  remove = vi.fn(async (moduleId: string, occurrenceId: string) => { this.calls.push(`remove:${moduleId}:${occurrenceId}`); return snapshot; });
  replay = vi.fn(async (moduleId: string, occurrenceId: string) => { this.calls.push(`replay:${moduleId}:${occurrenceId}`); return snapshot; });
  clear = vi.fn(async (moduleId: string, count: number, revision: number) => { this.calls.push(`clear:${moduleId}:${count}:${revision}`); return snapshot; });
  setModulePaused = vi.fn(async (moduleId: string, paused: boolean) => { this.calls.push(`pause:${moduleId}:${paused}`); return snapshot; });
}
