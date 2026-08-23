import {
  defaultModerationSettings,
  DefaultModerationService,
  type ModerationSettings,
  type ModerationSettingsRepository
} from "@stream-jams/core";
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

  it("returns stored normalized policy and persists a complete merged partial update", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();
    moderationService.updateSettings({
      renderedText: { maxLength: 320, blockedTerms: [" Stored "], stripUrls: true },
      ttsText: { maxLength: 120, blockedTerms: ["Speech"], stripUrls: false }
    });

    const getResponse = await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: authHeaders,
      payload: { renderedText: { maxLength: 80 } }
    });

    expect(getResponse.json()).toEqual({
      renderedText: { maxLength: 320, blockedTerms: ["Stored"], stripUrls: true },
      ttsText: { maxLength: 120, blockedTerms: ["Speech"], stripUrls: false }
    });
    expect(patchResponse.json()).toEqual({
      renderedText: { maxLength: 80, blockedTerms: ["Stored"], stripUrls: true },
      ttsText: { maxLength: 120, blockedTerms: ["Speech"], stripUrls: false }
    });
    expect(moderationService.repository.value).toEqual(patchResponse.json());
  });

  it("returns the standard 500 and retains active policy when persistence fails", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();
    const active = moderationService.getSettings();
    moderationService.repository.replaceError = new Error("database unavailable");

    const response = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: authHeaders,
      payload: { renderedText: { maxLength: 80 } }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        id: "err_moderation_update",
        message: "A server error occurred. Use the error ID to find details in backend logs."
      }
    });
    expect(moderationService.getSettings()).toEqual(active);
  });

  it("previews active and unsaved candidate settings without returning removed input", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();
    moderationService.updateSettings({ renderedText: { blockedTerms: ["Spoiler"], stripUrls: true } });

    const activePreview = await app.inject({
      method: "POST",
      url: "/moderation/preview",
      headers: authHeaders,
      payload: { target: "rendered", text: "Spoiler https://example.test" }
    });
    const candidatePreview = await app.inject({
      method: "POST",
      url: "/moderation/preview",
      headers: authHeaders,
      payload: {
        target: "rendered",
        text: "Spoiler https://example.test",
        settings: { maxLength: 100, blockedTerms: [" spoiler "], stripUrls: true }
      }
    });

    expect(activePreview.json()).toMatchObject({
      target: "rendered",
      text: "[moderated] [link removed]",
      actions: [
        { type: "url-stripped", count: 1 },
        { type: "blocked-term-replaced", count: 1 }
      ]
    });
    expect(candidatePreview.json()).toEqual({
      target: "rendered",
      settings: { maxLength: 100, blockedTerms: ["spoiler"], stripUrls: true },
      text: "[moderated] [link removed]",
      actions: [
        { type: "url-stripped", count: 1 },
        { type: "blocked-term-replaced", count: 1 }
      ]
    });
    expect(JSON.stringify(candidatePreview.json())).not.toContain("Spoiler");
    expect(moderationService.previewCount).toBe(2);
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

  it("returns 400 for invalid preview input without moderation work", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();

    const response = await app.inject({
      method: "POST",
      url: "/moderation/preview",
      headers: authHeaders,
      payload: {
        target: "rendered",
        text: "secret",
        settings: { maxLength: 0, blockedTerms: [], stripUrls: false }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_MODERATION_SETTINGS",
        message: "Invalid moderation settings"
      }
    });
    expect(moderationService.previewCount).toBe(0);
  });

  it("rejects missing management sessions and overlay keys before moderation settings or preview work", async () => {
    const { app, moderationService } = await createAppWithModeration();

    const missingSession = await app.inject({
      method: "GET",
      url: "/moderation/settings"
    });
    const missingSessionPatch = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      payload: { renderedText: { stripUrls: true } }
    });
    const overlayKeyGet = await app.inject({
      method: "GET",
      url: "/moderation/settings",
      headers: { authorization: "Bearer ovl_not-management" }
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
    const previewWithoutSession = await app.inject({
      method: "POST",
      url: "/moderation/preview",
      payload: { target: "rendered", text: "secret" }
    });
    const previewWithOverlayKey = await app.inject({
      method: "POST",
      url: "/moderation/preview",
      headers: { authorization: "Bearer ovl_not-management" },
      payload: { target: "rendered", text: "secret" }
    });

    expect(missingSession.statusCode).toBe(401);
    expect(missingSessionPatch.statusCode).toBe(401);
    expect(overlayKeyGet.statusCode).toBe(401);
    expect(overlayKey.statusCode).toBe(401);
    expect(previewWithoutSession.statusCode).toBe(401);
    expect(previewWithOverlayKey.statusCode).toBe(401);
    expect(moderationService.readCount).toBe(0);
    expect(moderationService.updateCount).toBe(0);
    expect(moderationService.previewCount).toBe(0);
  });

  it("rate limits repeated moderation settings reads before service work", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration({ maxManagementRequests: 2 });

    expect((await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders })).statusCode).toBe(200);
    const rejected = await app.inject({ method: "GET", url: "/moderation/settings", headers: authHeaders });

    expect(rejected.statusCode).toBe(429);
    expect(moderationService.readCount).toBe(2);
  });

  it("rate limits moderation preview before service work", async () => {
    const { app, authHeaders, moderationService } = await createAppWithModeration({ maxManagementRequests: 1 });

    expect((await app.inject({
      method: "POST",
      url: "/moderation/preview",
      headers: authHeaders,
      payload: { target: "rendered", text: "first" }
    })).statusCode).toBe(200);
    const rejected = await app.inject({
      method: "POST",
      url: "/moderation/preview",
      headers: authHeaders,
      payload: { target: "rendered", text: "secret" }
    });

    expect(rejected.statusCode).toBe(429);
    expect(moderationService.previewCount).toBe(1);
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
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    generateServerErrorId: () => "err_moderation_update"
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
  previewCount = 0;
  readonly repository: RecordingModerationSettingsRepository;

  constructor() {
    const repository = new RecordingModerationSettingsRepository(defaultModerationSettings);
    super({ repository });
    this.repository = repository;
  }

  override getSettings() {
    this.readCount += 1;
    return super.getSettings();
  }

  override updateSettings(input: Parameters<DefaultModerationService["updateSettings"]>[0]) {
    const settings = super.updateSettings(input);
    this.updateCount += 1;
    return settings;
  }

  override preview(input: Parameters<DefaultModerationService["preview"]>[0]) {
    this.previewCount += 1;
    return super.preview(input);
  }
}

class RecordingModerationSettingsRepository implements ModerationSettingsRepository {
  value: ModerationSettings | null;
  replaceError: Error | null = null;

  constructor(settings: ModerationSettings | null) {
    this.value = settings;
  }

  read(): ModerationSettings | null {
    return this.value;
  }

  replace(settings: ModerationSettings): void {
    if (this.replaceError !== null) {
      throw this.replaceError;
    }

    this.value = settings;
  }
}
