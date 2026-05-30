import { DefaultModerationService } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("moderation routes", () => {
  it("reads and updates management-protected moderation settings", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();

    const getResponse = await app.inject({
      method: "GET",
      url: "/moderation/settings",
      headers: authHeaders
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: authHeaders,
      payload: {
        renderedText: {
          blockedTerms: ["  Spoiler  ", "spoiler", "Hate"],
          stripUrls: true
        },
        ttsText: {
          maxLength: 64,
          stripUrls: true
        }
      }
    });

    expect(getResponse.statusCode).toBe(200);
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      renderedText: {
        blockedTerms: ["Spoiler", "Hate"],
        stripUrls: true
      },
      ttsText: {
        maxLength: 64,
        stripUrls: true
      }
    });
    expect(moderationService.updateCount).toBe(1);
  });

  it("returns 400 for invalid settings without mutating current settings", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();

    const response = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: authHeaders,
      payload: {
        renderedText: {
          maxLength: 0
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_MODERATION_SETTINGS",
        message: "Invalid moderation settings"
      }
    });
    expect(moderationService.updateCount).toBe(0);
  });

  it("rejects missing management sessions and overlay keys before moderation settings work", async () => {
    const { app, moderationService } = await createAppWithModeration();

    const missingSession = await app.inject({
      method: "GET",
      url: "/moderation/settings"
    });
    const overlayKey = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: {
        authorization: "Bearer ovl_not-management"
      },
      payload: {
        renderedText: {
          stripUrls: true
        }
      }
    });

    expect(missingSession.statusCode).toBe(401);
    expect(overlayKey.statusCode).toBe(401);
    expect(moderationService.readCount).toBe(0);
    expect(moderationService.updateCount).toBe(0);
  });

  it("rate limits repeated moderation settings reads before service work", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration({ maxManagementRequests: 2 });

    expect((await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders })).statusCode).toBe(200);
    const rejected = await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders });

    expect(rejected.statusCode).toBe(429);
    expect(moderationService.readCount).toBe(2);
  });
});

async function createAppWithModeration(options: { readonly maxManagementRequests?: number } = {}) {
  const moderationService = new RecordingModerationService();
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => "mgmt_moderation-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: options.maxManagementRequests ?? 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    moderationService,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    moderationService,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

class RecordingModerationService extends DefaultModerationService {
  readCount = 0;
  updateCount = 0;

  override getSettings() {
    this.readCount += 1;
    return super.getSettings();
  }

  override updateSettings(input: Parameters<DefaultModerationService["updateSettings"]>[0]) {
    const settings = super.updateSettings(input);
    this.updateCount += 1;
    return settings;
  }
}
