import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";

const now = new Date("2026-05-29T12:00:00.000Z");

describe("management session routes", () => {
  it("issues opaque expiring management sessions through a rate-limited local route", async () => {
    const app = createAppWithManagementSessions();

    const response = await app.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: "mgmt_route-session",
      createdAt: "2026-05-29T12:00:00.000Z",
      expiresAt: "2026-05-29T12:10:00.000Z",
      revokedAt: null
    });
    expect(response.body).not.toContain("ovl_");
  });

  it("rate limits repeated session issuance before creating additional sessions", async () => {
    const app = createAppWithManagementSessions({ maxManagementRequests: 1 });

    expect((await app.inject({ method: "POST", url: "/auth/management/sessions" })).statusCode).toBe(201);
    const rejected = await app.inject({
      method: "POST",
      url: "/auth/management/sessions"
    });

    expect(rejected.statusCode).toBe(429);
    expect(rejected.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_RATE_LIMITED"
      }
    });
  });
});

function createAppWithManagementSessions(options: { readonly maxManagementRequests?: number } = {}) {
  const managementSessionService = new LocalManagementSessionService({
    clock: () => now,
    generateId: () => "mgmt_route-session",
    sessionTtlMs: 10 * 60 * 1000
  });
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: options.maxManagementRequests ?? 100,
    windowMs: 60_000,
    clock: () => now
  });

  return createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    managementSessionService,
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });
}
