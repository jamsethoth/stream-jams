import {
  defaultModerationSettings,
  DefaultModerationService,
  type ModerationSettings,
  type ModerationSettingsRepository
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { RuntimeMaintenanceGate } from "../../modules/backup/runtime-maintenance-gate.js";
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

  it("returns a generic 500, retains active policy, and preserves a safe diagnostic cause when persistence fails", async () => {
    const { app, authHeaders, moderationService, serverErrors } = await createAppWithModeration();
    const active = moderationService.updateSettings({ renderedText: { blockedTerms: ["active-policy-secret"] } });
    const repositoryError = new Error("SQLITE_READONLY: database is read-only");
    moderationService.repository.replaceError = repositoryError;

    const response = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: authHeaders,
      payload: { renderedText: { maxLength: 80, blockedTerms: ["candidate-policy-secret"] } }
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
    expect(serverErrors).toHaveLength(1);
    expect(serverErrors[0]?.error).toBe(repositoryError);
    expect((serverErrors[0]?.error as Error).message).toBe("SQLITE_READONLY: database is read-only");
    expect(JSON.stringify(response.json())).not.toContain("policy-secret");
    expect((serverErrors[0]?.error as Error).message).not.toContain("policy-secret");
  });

  it("rejects a settings update while configuration restore owns the maintenance gate", async () => {
    const maintenanceGate = new RuntimeMaintenanceGate();
    let release!: () => void;
    const pending = maintenanceGate.runMaintenance(
      () => new Promise<void>((resolve) => { release = resolve; })
    );
    const { app, authHeaders, moderationService } = await createAppWithModeration({ mutationGate: maintenanceGate });

    try {
      const response = await app.inject({
        method: "PATCH",
        url: "/moderation/settings",
        headers: authHeaders,
        payload: { renderedText: { blockedTerms: ["candidate"] } }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: "CONFIGURATION_MAINTENANCE_ACTIVE",
          message: "Configuration restore is active. Wait for it to finish, then save again."
        }
      });
      expect(moderationService.updateCount).toBe(0);
    } finally {
      release();
      await pending;
    }
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

  it.each([
    ["maxLength", null],
    ["maxLength", "80"],
    ["blockedTerms", null],
    ["blockedTerms", "spoiler"],
    ["stripUrls", null],
    ["stripUrls", "true"]
  ] as const)("rejects present invalid %s value %j at the PATCH boundary", async (field, value) => {
    const { app, authHeaders, moderationService } = await createAppWithModeration();

    const response = await app.inject({
      method: "PATCH",
      url: "/moderation/settings",
      headers: authHeaders,
      payload: { renderedText: { [field]: value } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_MODERATION_SETTINGS",
        message: "Invalid moderation settings"
      }
    });
    expect(moderationService.updateAttemptCount).toBe(0);
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

async function createAppWithModeration(options: {
  readonly maxManagementRequests?: number;
  readonly mutationGate?: {
    runConfigurationMutation<T>(work: () => T): T;
  };
} = {}) {
  const moderationService = new RecordingModerationService();
  const serverErrors: Parameters<NonNullable<Parameters<typeof createServerApp>[0]["serverErrorLogger"]>>[0][] = [];
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
  const dependencies: Parameters<typeof createServerApp>[0] = {
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    moderationService,
    runConfigurationMutation: <T>(work: () => T) => options.mutationGate?.runConfigurationMutation(work) ?? work(),
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    generateServerErrorId: () => "err_moderation_update",
    serverErrorLogger: (entry) => serverErrors.push(entry)
  };
  const app = createServerApp(dependencies);

  return {
    app,
    moderationService,
    serverErrors,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

class RecordingModerationService extends DefaultModerationService {
  readCount = 0;
  updateAttemptCount = 0;
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
    this.updateAttemptCount += 1;
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
