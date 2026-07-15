import { describe, expect, it, vi } from "vitest";
import { createHttpManagementApi } from "./management-api.js";

describe("createHttpManagementApi", () => {
  it("loads runtime-validated UI refactor contracts through the existing client", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      const responses: Record<string, unknown> = {
        "/management/home": {
          readiness: [],
          activeAlertSet: null,
          actionableProblems: []
        },
        "/management/providers?capability=event-source": [
          {
            id: "provider-twitch-main",
            name: "Main Twitch",
            kind: "twitch",
            capability: "event-source",
            active: true,
            connectionState: "connected",
            intakeState: "active",
            validatedAt: "2026-07-15T05:00:00.000Z",
            error: null,
            usedByAlertCount: 4
          }
        ],
        "/management/providers/provider-twitch-main/activation-impact": {
          matchedAlertCount: 4,
          unmatchedAlertCount: 0,
          blockers: [],
          warnings: []
        },
        "/management/providers/provider-speakerbot/tts-safety": {
          defaultVoiceId: "voice-1",
          volume: 0.8,
          minimumRate: 0.5,
          maximumRate: 2,
          maximumTextLength: 240
        },
        "/management/alert-sets": [],
        "/management/alerts/alert-follow/editor": editorDocument(),
        "/management/assets/library": [],
        "/management/diagnostics/workspace": {
          problems: [],
          events: [],
          rawLogs: []
        },
        "/management/settings/backup-summary": {
          state: "ready",
          appVersion: "0.0.0",
          schemaVersion: 4,
          configurationRecordCount: 12,
          assetCount: 3,
          totalAssetBytes: 2048,
          secretExclusions: ["Provider credentials", "Overlay route keys"],
          blockers: []
        }
      };

      if (url in responses) {
        return jsonResponse(responses[url]);
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher }) as unknown as UiContractManagementApi;

    expect(api.getHomeSetupSummary).toBeTypeOf("function");
    expect(api.listRegisteredProviders).toBeTypeOf("function");
    expect(api.getProviderActivationImpact).toBeTypeOf("function");
    expect(api.getTtsProviderSafetySettings).toBeTypeOf("function");
    expect(api.listAlertSets).toBeTypeOf("function");
    expect(api.getAlertEditorDocument).toBeTypeOf("function");
    expect(api.listAssetLibraryItems).toBeTypeOf("function");
    expect(api.getDiagnosticsWorkspace).toBeTypeOf("function");
    expect(api.getConfigurationBackupSummary).toBeTypeOf("function");

    await expect(api.getHomeSetupSummary()).resolves.toMatchObject({ activeAlertSet: null });
    await expect(api.listRegisteredProviders("event-source")).resolves.toHaveLength(1);
    await expect(api.getProviderActivationImpact("provider-twitch-main")).resolves.toMatchObject({ matchedAlertCount: 4 });
    await expect(api.getTtsProviderSafetySettings("provider-speakerbot")).resolves.toMatchObject({ maximumTextLength: 240 });
    await expect(api.listAlertSets()).resolves.toEqual([]);
    await expect(api.getAlertEditorDocument("alert-follow")).resolves.toMatchObject({ id: "alert-follow" });
    await expect(api.listAssetLibraryItems()).resolves.toEqual([]);
    await expect(api.getDiagnosticsWorkspace()).resolves.toEqual({ problems: [], events: [], rawLogs: [] });
    await expect(api.getConfigurationBackupSummary()).resolves.toMatchObject({ state: "ready" });
  });

  it("rejects invalid UI refactor responses at the existing client boundary", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/management/settings/backup-summary") {
        return jsonResponse({ state: "ready", secretExclusions: [] });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher }) as unknown as UiContractManagementApi;

    expect(api.getConfigurationBackupSummary).toBeTypeOf("function");
    if (typeof api.getConfigurationBackupSummary !== "function") {
      return;
    }

    await expect(api.getConfigurationBackupSummary()).rejects.toThrow();
  });

  it("manages alert sets through runtime-validated commands", async () => {
    const overview = alertSetOverview();
    const detail = { overview, inventory: [alertInventoryRow()], browserSources: [] };
    const impact = alertSetActivationImpact();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/management/alert-sets/set-default" && init?.method === undefined) return jsonResponse(detail);
      if (url === "/management/alert-sets" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ name: "Seasonal" }));
        return jsonResponse({ ...overview, id: "set-seasonal", name: "Seasonal", active: false, starter: false });
      }
      if (url === "/management/alert-sets/set-default" && init?.method === "PATCH") {
        return jsonResponse({ ...overview, name: "Everyday" });
      }
      if (url === "/management/alert-sets/set-default/duplicate") {
        return jsonResponse({ ...overview, id: "set-copy", name: "Everyday copy", active: false, starter: false });
      }
      if (url === "/management/alert-sets/set-default/activation-impact") return jsonResponse(impact);
      if (url === "/management/alert-sets/set-default/activate") {
        expect(init?.body).toBe(JSON.stringify({ confirmWarnings: true }));
        return jsonResponse({ activeSet: overview, replacedSetId: null, impact });
      }
      if (url === "/management/alert-sets/set-default/starter-review") {
        return jsonResponse({ ...overview, starterReviewState: "complete" });
      }
      if (url === "/management/alerts/alert-follow/enabled") return jsonResponse(detail);
      if (url === "/management/alert-sets/set-seasonal" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getAlertSet("set-default")).resolves.toEqual(detail);
    await expect(api.createAlertSet({ name: "Seasonal" })).resolves.toMatchObject({ id: "set-seasonal" });
    await expect(api.renameAlertSet("set-default", { name: "Everyday" })).resolves.toMatchObject({ name: "Everyday" });
    await expect(api.duplicateAlertSet("set-default", { name: "Everyday copy" })).resolves.toMatchObject({ id: "set-copy" });
    await expect(api.getAlertSetActivationImpact("set-default")).resolves.toEqual(impact);
    await expect(api.activateAlertSet("set-default", true)).resolves.toMatchObject({ activeSet: { id: "set-default" } });
    await expect(api.markStarterAlertSetReviewComplete("set-default")).resolves.toMatchObject({ starterReviewState: "complete" });
    await expect(api.setManagedAlertEnabled("alert-follow", true)).resolves.toEqual(detail);
    await expect(api.deleteAlertSet("set-seasonal")).resolves.toBeUndefined();
  });

  it("manages provider registration and TTS safety through typed contracts", async () => {
    const setup = {
      name: "Studio Speaker.bot",
      kind: "speakerbot" as const,
      configuration: {
        protocol: "ws" as const,
        host: "127.0.0.1",
        port: 7680,
        endpoint: "/"
      }
    };
    const validation = {
      valid: true,
      connectionState: "connected",
      intakeState: null,
      validatedAt: "2026-07-15T05:00:00.000Z",
      availableVoices: [],
      error: null
    };
    const safety = {
      defaultVoiceId: null,
      volume: 0.8,
      minimumRate: 0.5,
      maximumRate: 2,
      maximumTextLength: 240
    };
    const provider = {
      provider: {
        id: "provider-speakerbot",
        name: setup.name,
        kind: setup.kind,
        capability: "tts",
        active: true,
        connectionState: "connected",
        intakeState: null,
        validatedAt: validation.validatedAt,
        error: null,
        usedByAlertCount: 2
      },
      configuration: setup.configuration,
      availableVoices: [],
      ttsSafety: safety
    };
    const impact = {
      matchedAlertCount: 2,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: []
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      expect(init?.headers).toMatchObject({
        authorization: "Bearer mgmt_session"
      });

      if (url === "/management/providers/validate") {
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify(setup) });
        return jsonResponse(validation);
      }
      if (url === "/management/providers") {
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify(setup) });
        return jsonResponse({ status: "registered", provider, validation });
      }
      if (url === "/management/providers/provider-speakerbot" && init?.method === undefined) {
        return jsonResponse(provider);
      }
      if (url === "/management/providers/provider-speakerbot/activate") {
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ confirmWarnings: true }) });
        return jsonResponse({ provider: provider.provider, replacedProviderId: null, impact });
      }
      if (url === "/management/providers/provider-speakerbot/tts-safety") {
        expect(init).toMatchObject({ method: "PUT", body: JSON.stringify(safety) });
        return jsonResponse(safety);
      }
      if (url === "/management/providers/provider-speakerbot/test-voice") {
        expect(init).toMatchObject({ method: "POST" });
        expect(init?.body).toBeUndefined();
        return jsonResponse({ delivered: true, error: null });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.validateProvider(setup)).resolves.toEqual(validation);
    await expect(api.registerProvider(setup)).resolves.toEqual({ status: "registered", provider, validation });
    await expect(api.getProvider("provider-speakerbot")).resolves.toEqual(provider);
    await expect(api.activateProvider("provider-speakerbot", true)).resolves.toEqual({
      provider: provider.provider,
      replacedProviderId: null,
      impact
    });
    await expect(api.updateTtsSafety("provider-speakerbot", safety)).resolves.toEqual(safety);
    await expect(api.testProviderVoice("provider-speakerbot")).resolves.toEqual({ delivered: true, error: null });
  });

  it("rejects invalid provider command responses", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }
      if (url === "/management/providers/provider-speakerbot/test-voice") {
        return jsonResponse({ delivered: "yes", error: null });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.testProviderVoice("provider-speakerbot")).rejects.toThrow();
  });

  it("creates one management session and sends bearer headers to protected routes", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/config/server") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse({ host: "127.0.0.1", port: 39187 });
      }

      if (url === "/playback") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse({
          current: null,
          queued: [],
          recent: [],
          paused: false,
          muted: false,
          doNotDisturb: false
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await api.getServerConfig();
    await api.getPlayback();

    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(1);
  });

  it("loads module definitions with config and updates module enabled state", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/overlay-modules") {
        return jsonResponse([
          {
            id: "alerts",
            displayName: "Alerts",
            version: "0.0.0",
            defaultEnabled: true,
            configSchemaVersion: 1,
            defaultConfig: {},
            wizard: {
              steps: []
            },
            renderer: {
              entryPoint: "overlay/modules/alerts",
              supportedOutputs: ["module", "unified"]
            }
          }
        ]);
      }

      if (url === "/overlay-modules/alerts/config") {
        return jsonResponse({
          moduleId: "alerts",
          enabled: true,
          config: {
            canvas: {
              width: 1920,
              height: 1080
            }
          },
          updatedAt: "2026-05-30T12:00:00.000Z"
        });
      }

      if (url === "/overlay-modules/alerts/enabled") {
        expect(init).toMatchObject({
          method: "PATCH",
          body: JSON.stringify({ enabled: false })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({
          moduleId: "alerts",
          enabled: false,
          config: {},
          updatedAt: "2026-05-30T12:00:00.000Z"
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.listModules()).resolves.toEqual([
      expect.objectContaining({
        id: "alerts",
        displayName: "Alerts",
        enabled: true
      })
    ]);
    await expect(api.setModuleEnabled("alerts", false)).resolves.toMatchObject({
      moduleId: "alerts",
      enabled: false
    });
  });


  it("loads and updates moderation settings with management headers", async () => {
    const settings = {
      renderedText: {
        maxLength: 240,
        blockedTerms: ["spoiler"],
        stripUrls: true
      },
      ttsText: {
        maxLength: 180,
        blockedTerms: ["spoiler"],
        stripUrls: false
      }
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/moderation/settings" && init?.method === undefined) {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse(settings);
      }

      if (url === "/moderation/settings") {
        expect(init).toMatchObject({
          method: "PATCH",
          body: JSON.stringify(settings)
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse(settings);
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getModerationSettings()).resolves.toEqual(settings);
    await expect(api.updateModerationSettings(settings)).resolves.toEqual(settings);
  });
  it("loads diagnostics and redacted exports with management headers and limits", async () => {
    const diagnostics = {
      eventLogs: [],
      alertMatchLogs: [],
      playbackLogs: [],
      providerErrors: [],
      runtimeLogging: null
    };
    const exported = {
      generatedAt: "2026-05-31T02:05:00.000Z",
      debugExport: false,
      rawEventLogs: [],
      ...diagnostics
    };
    const debugExported = {
      ...exported,
      debugExport: true,
      runtimeLogEntries: [],
      runtimeLogTruncated: false
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/diagnostics?limit=2") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse(diagnostics);
      }

      if (url === "/diagnostics/export?limit=2") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse(exported);
      }

      if (url === "/diagnostics/export/debug") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify({ limit: 2, runtimeLogLimit: 10, sinceHours: 1 })
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse(debugExported);
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getDiagnostics({ limit: 2 })).resolves.toEqual(diagnostics);
    await expect(api.exportDiagnostics({ limit: 2 })).resolves.toEqual(exported);
    await expect(api.exportDebugDiagnostics({ limit: 2, runtimeLogLimit: 10, sinceHours: 1 })).resolves.toEqual(debugExported);
  });

  it("updates asset metadata, previews replacement impact, and deletes through management headers", async () => {
    const item = {
      id: "asset-1",
      displayName: "Follower burst",
      originalFileName: "follow.png",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: 1024,
      width: null,
      height: null,
      durationMs: null,
      health: "available",
      tags: ["follow"],
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z",
      usage: { assetId: "asset-1", totalUsageCount: 0, usages: [] }
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      expect(init?.headers).toMatchObject({ authorization: "Bearer mgmt_session" });
      if (url === "/management/assets/asset-1") {
        expect(init?.headers).toMatchObject({ "x-stream-jams-csrf": "csrf_session" });
        if (init?.method === "PATCH") {
          expect(init.body).toBe(JSON.stringify({ displayName: "Updated", tags: ["follow", "seasonal"] }));
          return jsonResponse({ ...item, displayName: "Updated", tags: ["follow", "seasonal"] });
        }
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      }
      if (url === "/management/assets/asset-1/change-impact?candidateMediaType=audio") {
        return jsonResponse({ assetId: "asset-1", usage: item.usage, canDelete: true, requiresConfirmation: true, warnings: ["Media type changes from image to audio."] });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.updateAssetMetadata("asset-1", { displayName: "Updated", tags: ["follow", "seasonal"] })).resolves.toMatchObject({ displayName: "Updated" });
    await expect(api.getAssetChangeImpact("asset-1", "audio")).resolves.toMatchObject({ requiresConfirmation: true });
    await expect(api.deleteAsset("asset-1")).resolves.toBeUndefined();
  });

  it("manages overlay output keys with management headers", async () => {
    const keyRequest = {
      overlayId: "default",
      scope: "module" as const,
      moduleId: "alerts",
      purpose: "live" as const
    };
    const output = {
      id: "module:alerts:live",
      overlayId: "default",
      label: "Alerts Live",
      scope: "module",
      moduleId: "alerts",
      purpose: "live",
      enabled: true,
      keyId: "key-1",
      url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first",
      copyableUrlStatus: "available"
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/management/overlay-outputs/keys") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify(keyRequest)
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({
          keyId: "key-1",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_first",
          output
        });
      }

      if (url === "/management/overlay-outputs/keys/regenerate") {
        expect(init).toMatchObject({
          method: "POST",
          body: JSON.stringify(keyRequest)
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse({
          keyId: "key-2",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_second",
          output: {
            ...output,
            keyId: "key-2",
            url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_second"
          }
        });
      }

      if (url === "/management/overlay-outputs/keys/key-2") {
        expect(init).toMatchObject({
          method: "DELETE"
        });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "x-stream-jams-csrf": "csrf_session"
        });
        return new Response(null, { status: 204 });
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.createOverlayOutputKey(keyRequest)).resolves.toMatchObject({ keyId: "key-1" });
    await expect(api.regenerateOverlayOutputKey(keyRequest)).resolves.toMatchObject({ keyId: "key-2" });
    await expect(api.revokeOverlayOutputKey("key-2")).resolves.toBeUndefined();
  });

  it("loads Twitch EventSub status with management headers", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/twitch/eventsub/status") {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session"
        });
        return jsonResponse({
          state: "ready",
          acceptedCount: 3,
          duplicateCount: 1,
          rejectedCount: 0,
          lastEventAt: "2026-05-30T12:00:00.000Z",
          lastErrorAt: null,
          message: null
        });
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getTwitchEventSubStatus()).resolves.toEqual({
      state: "ready",
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      lastErrorAt: null,
      message: null
    });
  });

  it("includes backend error code and id in thrown messages", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") {
        return jsonResponse(managementSession());
      }

      if (url === "/config/server") {
        return jsonResponse(
          {
            error: {
              code: "WEB_BUILD_UNAVAILABLE",
              id: "err_reference",
              message: "Web build assets are unavailable."
            }
          },
          { status: 503 }
        );
      }

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getServerConfig()).rejects.toThrow(
      "Web build assets are unavailable. (WEB_BUILD_UNAVAILABLE, err_reference)"
    );
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

function managementSession(): { readonly id: string; readonly csrfToken: string } {
  return {
    id: "mgmt_session",
    csrfToken: "csrf_session"
  };
}

interface UiContractManagementApi {
  getHomeSetupSummary(): Promise<unknown>;
  listRegisteredProviders(capability: "event-source" | "tts"): Promise<readonly unknown[]>;
  getProviderActivationImpact(providerId: string): Promise<unknown>;
  getTtsProviderSafetySettings(providerId: string): Promise<unknown>;
  listAlertSets(): Promise<readonly unknown[]>;
  getAlertEditorDocument(alertId: string): Promise<unknown>;
  listAssetLibraryItems(): Promise<readonly unknown[]>;
  getDiagnosticsWorkspace(): Promise<unknown>;
  getConfigurationBackupSummary(): Promise<unknown>;
}

function editorDocument() {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    durationMs: 5000,
    layers: [],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "sample-normal", label: "Normal follower", kind: "built-in", payload: { userName: "viewer" } }]
  };
}

function alertSetOverview() {
  return {
    id: "set-default",
    name: "Default",
    active: true,
    starter: true,
    starterReviewState: "pending",
    enabledAlertCount: 0,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
}

function alertInventoryRow() {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    name: "New follower",
    kind: "default",
    enabled: false,
    reviewState: "needs-review",
    targetProfileIds: ["landscape"],
    previewText: "Thanks for following, {actor.displayName}!"
  };
}

function alertSetActivationImpact() {
  return {
    currentActiveSetId: "set-default",
    replacingActiveSetName: null,
    enabledAlertCount: 0,
    affectedTargetProfileIds: ["landscape"],
    affectedEventTypes: [],
    blockers: [],
    warnings: []
  };
}
