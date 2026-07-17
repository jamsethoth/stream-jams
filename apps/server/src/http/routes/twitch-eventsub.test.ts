import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("twitch eventsub routes", () => {
  it("reads provider status for management sessions", async () => {
    const { app, authHeaders } = await createAppWithEventSubStatus();

    const response = await app.inject({
      method: "GET",
      url: "/twitch/eventsub/status",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      state: "connected",
      connectionState: "connected",
      sessionId: "session-1",
      connectedAt: "2026-05-30T11:59:59.000Z",
      lastMessageAt: "2026-05-30T12:00:00.000Z",
      subscriptionTypes: ["channel.follow"],
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      lastErrorAt: null,
      message: null,
      referenceId: null
    });
  });

  it("rejects missing management sessions", async () => {
    const { app, service } = await createAppWithEventSubStatus();

    const response = await app.inject({
      method: "GET",
      url: "/twitch/eventsub/status"
    });

    expect(response.statusCode).toBe(401);
    expect(service.statusReads).toBe(0);
  });
});

async function createAppWithEventSubStatus() {
  const service = new RecordingEventSubStatusService();
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => "mgmt_eventsub-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    twitchEventSubStatusService: service,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    },
    service
  };
}

class RecordingEventSubStatusService {
  statusReads = 0;

  getStatus() {
    this.statusReads += 1;
    return {
      state: "connected" as const,
      connectionState: "connected" as const,
      sessionId: "session-1",
      connectedAt: "2026-05-30T11:59:59.000Z",
      lastMessageAt: "2026-05-30T12:00:00.000Z",
      subscriptionTypes: ["channel.follow"],
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      lastErrorAt: null,
      message: null,
      referenceId: null
    };
  }
}
