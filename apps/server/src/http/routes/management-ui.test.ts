import { describe, expect, it } from "vitest";
import { createServerApp, type ServerAppDependencies } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("management UI contract routes", () => {
  it("returns every validated Slice 1 view through protected routes", async () => {
    const { app, authHeaders } = await createApp();

    const requests = [
      ["/management/home", "GET"],
      ["/management/providers?capability=event-source", "GET"],
      ["/management/providers/provider-twitch-main/activation-impact", "GET"],
      ["/management/providers/provider-speakerbot/tts-safety", "GET"],
      ["/management/alert-sets", "GET"],
      ["/management/alerts/alert-follow/editor", "GET"],
      ["/management/assets/library", "GET"],
      ["/management/diagnostics/workspace", "GET"],
      ["/management/settings/backup-summary", "GET"]
    ] as const;

    const responses = await Promise.all(
      requests.map(([url, method]) => app.inject({ method, url, headers: authHeaders }))
    );

    expect(responses.map((response) => response.statusCode)).toEqual(requests.map(() => 200));
    expect(responses[0]?.json()).toEqual({ readiness: [], activeAlertSet: null, actionableProblems: [] });
    expect(responses[1]?.json()).toEqual([expect.objectContaining({ id: "provider-twitch-main" })]);
    expect(responses[4]?.json()).toEqual([]);
    expect(responses[5]?.json()).toEqual(expect.objectContaining({ id: "alert-follow" }));
    expect(responses[8]?.json()).toEqual(expect.objectContaining({ state: "ready" }));
  });

  it("rejects missing auth and unsupported provider capabilities", async () => {
    const { app, authHeaders } = await createApp();

    const unauthorized = await app.inject({ method: "GET", url: "/management/home" });
    const invalidCapability = await app.inject({
      method: "GET",
      url: "/management/providers?capability=video",
      headers: authHeaders
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(invalidCapability.statusCode).toBe(400);
    expect(invalidCapability.json()).toEqual({
      error: {
        code: "INVALID_PROVIDER_CAPABILITY",
        message: "Provider capability must be event-source or tts"
      }
    });
  });
});

async function createApp() {
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-07-15T05:00:00.000Z"),
    generateId: () => "mgmt_ui-contract-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-07-15T05:00:00.000Z")
  });
  const dependencies = {
    metadata: { appName: "stream-jams", version: "0.0.0" },
    managementUiQueryService: new StubManagementUiQueryService(),
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  } as ServerAppDependencies & { readonly managementUiQueryService: StubManagementUiQueryService };

  return {
    app: createServerApp(dependencies),
    authHeaders: { authorization: `Bearer ${session.id}` }
  };
}

class StubManagementUiQueryService {
  async getHomeSetupSummary() {
    return { readiness: [], activeAlertSet: null, actionableProblems: [] };
  }

  async listRegisteredProviders(capability: "event-source" | "tts") {
    return capability === "event-source"
      ? [
          {
            id: "provider-twitch-main",
            name: "Main Twitch",
            kind: "twitch" as const,
            capability,
            active: true,
            connectionState: "connected" as const,
            intakeState: "active" as const,
            validatedAt: "2026-07-15T05:00:00.000Z",
            error: null,
            usedByAlertCount: 4
          }
        ]
      : [];
  }

  async getProviderActivationImpact() {
    return { matchedAlertCount: 4, unmatchedAlertCount: 0, blockers: [], warnings: [] };
  }

  async getTtsProviderSafetySettings() {
    return { defaultVoiceId: "voice-1", volume: 0.8, minimumRate: 0.5, maximumRate: 2, maximumTextLength: 240 };
  }

  async listAlertSets() {
    return [];
  }

  async getAlertEditorDocument() {
    return {
      id: "alert-follow",
      setId: "set-default",
      providerKind: "twitch" as const,
      eventType: "follow" as const,
      kind: "default" as const,
      parentAlertId: null,
      name: "New follower",
      enabled: true,
      conditions: [],
      durationMs: 5000,
      layers: [],
      targetProfiles: [
        { id: "landscape" as const, enabled: true, reviewState: "ready" as const, layerLayouts: [] },
        { id: "vertical" as const, enabled: false, reviewState: "needs-review" as const, layerLayouts: [] }
      ],
      samplePayloads: [
        { id: "sample-normal", label: "Normal follower", kind: "built-in" as const, payload: { userName: "viewer" } }
      ]
    };
  }

  async listAssetLibraryItems() {
    return [];
  }

  async getDiagnosticsWorkspace() {
    return { problems: [], events: [], rawLogs: [] };
  }

  async getConfigurationBackupSummary() {
    return {
      state: "ready" as const,
      appVersion: "0.0.0",
      schemaVersion: 4,
      configurationRecordCount: 12,
      assetCount: 3,
      totalAssetBytes: 2048,
      secretExclusions: ["Provider credentials", "Overlay route keys"],
      blockers: []
    };
  }
}
