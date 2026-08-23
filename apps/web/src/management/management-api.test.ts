import { describe, expect, it, vi } from "vitest";
import { alertEditorDocumentSchema } from "@stream-jams/core";
import { createHttpManagementApi } from "./management-api.js";

describe("createHttpManagementApi", () => {
  it("loads and validates encoded variation sibling context URLs", async () => {
    const context = variationAuthoringContext();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/management/alerts/alert%2Ffollow/editor/variation-context") return jsonResponse(context);
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getAlertVariationAuthoringContext("alert/follow")).resolves.toEqual(context);
    expect(fetcher).toHaveBeenCalledWith(
      "/management/alerts/alert%2Ffollow/editor/variation-context",
      expect.objectContaining({ headers: { authorization: "Bearer mgmt_session" } })
    );
  });

  it("rejects an invalid variation sibling context response", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/auth/management/sessions") return jsonResponse(managementSession());
      return jsonResponse({ ...variationAuthoringContext(), candidates: [] });
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getAlertVariationAuthoringContext("alert-follow")).rejects.toThrow();
  });

  it("sends complete sibling priority assignments through the existing editor save request", async () => {
    const document = alertEditorDocumentSchema.parse(editorDocument());
    const assignments = [
      { variationId: "variant-vip", priority: 3 },
      { variationId: "variant-raid", priority: 2 }
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/management/alerts/alert-follow/editor") {
        expect(init).toMatchObject({
          method: "PUT",
          body: JSON.stringify({ document, confirmLiveImpact: true, priorityAssignments: assignments })
        });
        return jsonResponse(document);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.saveAlertEditorDocument("alert-follow", document, true, assignments)).resolves.toMatchObject(document);
  });

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
        "/management/alerts/alert-follow/editor/test": {
          status: "queued",
          targetProfileId: "landscape",
          referenceId: "ref-editor-test",
          test: true
        },
        "/management/alerts/alert-follow/editor/errors": {
          referenceId: "err_editor_save"
        },
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
          dataDirectory: "C:/Users/James/.stream-jams/data",
          assetDirectory: "C:/Users/James/.stream-jams/assets",
          logLevel: "INFO",
          logRetentionHours: 48,
          secretExclusions: ["Provider credentials", "Overlay route keys"],
          blockers: []
        },
        "/management/settings/backup": backupArchive(),
        "/management/settings/backup/preflight": backupPreflight(),
        "/management/settings/backup/restore": backupRestoreResult(),
        "/management/settings/open-data-folder": { dataDirectory: "C:/Users/James/.stream-jams/data" },
        "/management/settings/clear-old-logs": { deletedCount: 3 }
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
    expect(api.saveAlertEditorDocument).toBeTypeOf("function");
    expect(api.sendAlertEditorTest).toBeTypeOf("function");
    expect(api.reportAlertEditorError).toBeTypeOf("function");
    expect(api.listAssetLibraryItems).toBeTypeOf("function");
    expect(api.getDiagnosticsWorkspace).toBeTypeOf("function");
    expect(api.getConfigurationBackupSummary).toBeTypeOf("function");
    expect(api.exportConfigurationBackup).toBeTypeOf("function");
    expect(api.preflightConfigurationRestore).toBeTypeOf("function");
    expect(api.restoreConfiguration).toBeTypeOf("function");
    expect(api.openDataFolder).toBeTypeOf("function");
    expect(api.clearOldLogs).toBeTypeOf("function");

    await expect(api.getHomeSetupSummary()).resolves.toMatchObject({ activeAlertSet: null });
    await expect(api.listRegisteredProviders("event-source")).resolves.toHaveLength(1);
    await expect(api.getProviderActivationImpact("provider-twitch-main")).resolves.toMatchObject({ matchedAlertCount: 4 });
    await expect(api.getTtsProviderSafetySettings("provider-speakerbot")).resolves.toMatchObject({ maximumTextLength: 240 });
    await expect(api.listAlertSets()).resolves.toEqual([]);
    await expect(api.getAlertEditorDocument("alert-follow")).resolves.toMatchObject({ id: "alert-follow" });
    await expect(api.saveAlertEditorDocument("alert-follow", editorDocument())).resolves.toMatchObject({ id: "alert-follow" });
    await expect(
      api.sendAlertEditorTest("alert-follow", {
        document: editorDocument(),
        targetProfileId: "landscape",
        samplePayload: { userName: "James" },
        includeAudio: false,
        includeTts: false
      })
    ).resolves.toMatchObject({ status: "queued", referenceId: "ref-editor-test" });
    await expect(api.reportAlertEditorError("alert-follow", {
      setId: "set-default",
      error: {
        summary: "The alert was not saved",
        cause: "Database write failed.",
        nextStep: "Review the selected profile and try again.",
        severity: "error",
        occurredAt: "2026-07-19T18:00:00.000Z",
        referenceId: "err_editor_save",
        correction: null
      }
    })).resolves.toEqual({ referenceId: "err_editor_save" });
    await expect(api.listAssetLibraryItems()).resolves.toEqual([]);
    await expect(api.getDiagnosticsWorkspace()).resolves.toEqual({ problems: [], events: [], rawLogs: [] });
    await expect(api.getConfigurationBackupSummary()).resolves.toMatchObject({ state: "ready" });
    const archive = backupArchive();
    await expect(api.exportConfigurationBackup()).resolves.toMatchObject({ manifest: { archiveVersion: 2 } });
    await expect(api.preflightConfigurationRestore(archive)).resolves.toMatchObject({ state: "valid" });
    await expect(api.restoreConfiguration({ archive, archiveId: backupPreflight().archiveId, confirmation: "RESTORE", regenerateRouteKeys: true })).resolves.toMatchObject({ state: "completed" });
    await expect(api.openDataFolder()).resolves.toEqual({ dataDirectory: "C:/Users/James/.stream-jams/data" });
    await expect(api.clearOldLogs()).resolves.toEqual({ deletedCount: 3 });
    expect(fetcher).toHaveBeenCalledWith(
      "/management/settings/open-data-folder",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/management/settings/clear-old-logs",
      expect.objectContaining({ method: "POST" })
    );
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
      if (url === "/management/alert-sets/set-default/alerts" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ eventType: "cheer", name: "Big cheer" }));
        return jsonResponse({ ...alertInventoryRow(), id: "alert-cheer", eventType: "cheer", name: "Big cheer" });
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
    await expect(api.createAlert("set-default", { eventType: "cheer", name: "Big cheer" })).resolves.toMatchObject({
      id: "alert-cheer",
      enabled: false,
      reviewState: "needs-review"
    });
    await expect(api.renameAlertSet("set-default", { name: "Everyday" })).resolves.toMatchObject({ name: "Everyday" });
    await expect(api.duplicateAlertSet("set-default", { name: "Everyday copy" })).resolves.toMatchObject({ id: "set-copy" });
    await expect(api.getAlertSetActivationImpact("set-default")).resolves.toEqual(impact);
    await expect(api.activateAlertSet("set-default", true)).resolves.toMatchObject({ activeSet: { id: "set-default" } });
    await expect(api.markStarterAlertSetReviewComplete("set-default")).resolves.toMatchObject({ starterReviewState: "complete" });
    await expect(api.setManagedAlertEnabled("alert-follow", true)).resolves.toEqual(detail);
    await expect(api.deleteAlertSet("set-seasonal")).resolves.toBeUndefined();
  });

  it("manages alert variations through typed commands", async () => {
    const variation = {
      ...alertInventoryRow(),
      id: "variation-vip",
      kind: "variation" as const,
      parentAlertId: "alert/follow",
      name: "VIP follower"
    };
    const duplicate = { ...variation, id: "variation-copy", name: "VIP follower copy" };
    const reset = { ...variation, reviewState: "needs-review" as const };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/management/alerts/alert%2Ffollow/variations") {
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ name: "VIP follower" }) });
        return jsonResponse(variation, { status: 201 });
      }
      if (url === "/management/alerts/variation-vip/duplicate") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeUndefined();
        return jsonResponse(duplicate, { status: 201 });
      }
      if (url === "/management/alerts/variation-vip/reset") {
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ confirmLiveImpact: true }) });
        return jsonResponse(reset);
      }
      if (url === "/management/alerts/variation-vip" && init?.method === "DELETE") {
        expect(init.body).toBe(JSON.stringify({ confirmLiveImpact: true }));
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.createAlertVariation("alert/follow", { name: "VIP follower" })).resolves.toEqual(variation);
    await expect(api.duplicateManagedAlert("variation-vip")).resolves.toEqual(duplicate);
    await expect(api.resetManagedAlert("variation-vip", true)).resolves.toEqual(reset);
    await expect(api.deleteManagedAlert("variation-vip", true)).resolves.toBeUndefined();
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
      if (url === "/management/providers/provider-speakerbot/deactivate") {
        expect(init).toMatchObject({ method: "POST" });
        return jsonResponse({ ...provider.provider, active: false });
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
    await expect(api.deactivateProvider("provider-speakerbot")).resolves.toEqual({
      ...provider.provider,
      active: false
    });
    await expect(api.updateTtsSafety("provider-speakerbot", safety)).resolves.toEqual(safety);
    await expect(api.testProviderVoice("provider-speakerbot")).resolves.toEqual({ delivered: true, error: null });
  });

  it("loads Twitch status and runtime-validates Device Code start and poll responses", async () => {
    const status = {
      connected: true as const,
      authorizationState: "ready" as const,
      missingScopes: [],
      account: {
        accountId: "account-1",
        login: "jamsethoth",
        displayName: "Jamsethoth",
        scopes: ["user:read:chat"],
        connectedAt: "2026-07-15T05:00:00.000Z",
        updatedAt: "2026-07-15T05:00:00.000Z"
      }
    };
    const started = {
      authorizationId: "auth-123",
      verificationUri: "https://www.twitch.tv/activate?device-code=ABCD-EFGH",
      userCode: "ABCD-EFGH",
      expiresAt: "2026-07-16T18:00:00.000Z",
      intervalSeconds: 5,
      scopes: ["user:read:chat"]
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/status") return jsonResponse(status);
      if (url === "/twitch/auth/start") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeUndefined();
        return jsonResponse(started);
      }
      if (url === "/twitch/auth/poll") {
        const authorizationId = JSON.parse(String(init?.body)).authorizationId;
        if (authorizationId === "auth-pending") return jsonResponse({ status: "pending" });
        if (authorizationId === "auth-denied") {
          return jsonResponse({ status: "failed", code: "TWITCH_OAUTH_DENIED", message: "Twitch authorization was denied" });
        }
        if (authorizationId === "auth-expired") {
          return jsonResponse({ status: "failed", code: "TWITCH_OAUTH_EXPIRED", message: "Twitch authorization expired" });
        }
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ authorizationId: "auth-123" }) });
        return jsonResponse({ status: "connected", connection: status });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getTwitchStatus()).resolves.toEqual(status);
    await expect(api.startTwitchAuth()).resolves.toEqual(started);
    await expect(api.pollTwitchAuth({ authorizationId: "auth-pending" })).resolves.toEqual({ status: "pending" });
    await expect(api.pollTwitchAuth({ authorizationId: "auth-denied" })).resolves.toEqual({
      status: "failed", code: "TWITCH_OAUTH_DENIED", message: "Twitch authorization was denied"
    });
    await expect(api.pollTwitchAuth({ authorizationId: "auth-expired" })).resolves.toEqual({
      status: "failed", code: "TWITCH_OAUTH_EXPIRED", message: "Twitch authorization expired"
    });
    await expect(api.pollTwitchAuth({ authorizationId: "auth-123" })).resolves.toEqual({ status: "connected", connection: status });
  });

  it("rejects malformed Device Code responses, unsafe Twitch URLs, leaked device codes, and unknown poll states", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/status") return jsonResponse({ connected: true, account: null });
      if (url === "/twitch/auth/start") {
        return jsonResponse({
          authorizationId: "auth-unsafe",
          verificationUri: "https://id.twitch.tv/activate",
          userCode: "ABCD-EFGH",
          expiresAt: "invalid",
          intervalSeconds: 0,
          scopes: [],
          deviceCode: "must-never-reach-the-browser"
        });
      }
      if (url === "/twitch/auth/poll") {
        expect(init?.body).toBe(JSON.stringify({ authorizationId: "auth-unsafe" }));
        return jsonResponse({ status: "unknown" });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getTwitchStatus()).rejects.toThrow("Invalid Twitch connection status response");
    await expect(api.startTwitchAuth()).rejects.toThrow("Invalid Twitch authorization response");
    await expect(api.pollTwitchAuth({ authorizationId: "auth-unsafe" })).rejects.toThrow("Invalid Twitch authorization response");
  });

  it("rejects unknown Device Code response fields and forwards only authorizationId when polling", async () => {
    const status = connectedTwitchStatus();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/start") {
        return jsonResponse({ ...deviceAuthorizationStart(), unexpected: true });
      }
      if (url === "/twitch/auth/poll") {
        expect(init?.body).toBe(JSON.stringify({ authorizationId: "only-this" }));
        return jsonResponse({ status: "pending", unexpected: true });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });
    const pollInput = { authorizationId: "only-this", deviceCode: "never-send" };

    await expect(api.startTwitchAuth()).rejects.toThrow("Invalid Twitch authorization response");
    await expect(api.pollTwitchAuth(pollInput)).rejects.toThrow("Invalid Twitch authorization response");
    expect(status.connected).toBe(true);
  });

  it("rejects unknown fields on connected and failed polls and non-canonical ISO timestamps", async () => {
    const responses = [
      { status: "connected", connection: connectedTwitchStatus(), unexpected: true },
      { status: "failed", code: "TWITCH_OAUTH_DENIED", message: "Denied", unexpected: true }
    ];
    const invalidTimes = ["2026-02-30T00:00:00.000Z", "2026-07-16T18:00:00Z", "2026-07-16T18:00:00.000+00:00"];
    let startIndex = 0;
    let pollIndex = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/start") {
        const expiresAt = invalidTimes[startIndex++]!;
        return jsonResponse({ ...deviceAuthorizationStart(), expiresAt });
      }
      if (url === "/twitch/auth/poll") return jsonResponse(responses[pollIndex++]!);
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    for (const authorizationId of ["connected", "failed"]) {
      await expect(api.pollTwitchAuth({ authorizationId })).rejects.toThrow("Invalid Twitch authorization response");
    }
    for (let index = 0; index < invalidTimes.length; index += 1) {
      await expect(api.startTwitchAuth()).rejects.toThrow("Invalid Twitch authorization response");
    }
  });

  it("rejects extra fields inside connected poll connection and account objects", async () => {
    const connection = connectedTwitchStatus();
    const responses = [
      { status: "connected", connection: { ...connection, deviceCode: "must-not-sanitize" } },
      { status: "connected", connection: { ...connection, account: { ...connection.account, unexpected: true } } }
    ];
    let index = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/poll") return jsonResponse(responses[index++]!);
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.pollTwitchAuth({ authorizationId: "connection-extra" })).rejects.toThrow("Invalid Twitch connection status response");
    await expect(api.pollTwitchAuth({ authorizationId: "account-extra" })).rejects.toThrow("Invalid Twitch connection status response");
  });

  it("rejects contradictory Twitch authorization readiness states", async () => {
    const readyWithMissingScopes = { ...connectedTwitchStatus(), missingScopes: ["channel:read:polls"] };
    const updateWithoutMissingScopes = { ...connectedTwitchStatus(), authorizationState: "update-required", missingScopes: [] };
    const responses = [readyWithMissingScopes, updateWithoutMissingScopes];
    let index = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/status") return jsonResponse(responses[index++]!);
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.getTwitchStatus()).rejects.toThrow("Invalid Twitch connection status response");
    await expect(api.getTwitchStatus()).rejects.toThrow("Invalid Twitch connection status response");
  });

  it("rejects Twitch activation URLs with non-default ports", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/start") {
        return jsonResponse({ ...deviceAuthorizationStart(), verificationUri: "https://www.twitch.tv:444/activate" });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.startTwitchAuth()).rejects.toThrow("Invalid Twitch authorization response");
  });

  it("allows only documented Twitch activation query parameters for the returned user code", async () => {
    const verificationUris = [
      "https://www.twitch.tv/activate?public=true&device-code=TEST-CODE",
      "https://www.twitch.tv/activate?device-code=OTHER-CODE",
      "https://www.twitch.tv/activate?device-code=TEST-CODE&device-code=TEST-CODE",
      "https://www.twitch.tv/activate?device-code=TEST-CODE&redirect=https://example.com"
    ];
    let responseIndex = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/twitch/auth/start") {
        return jsonResponse({ ...deviceAuthorizationStart(), verificationUri: verificationUris[responseIndex++] });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.startTwitchAuth()).resolves.toEqual({
      ...deviceAuthorizationStart(),
      verificationUri: verificationUris[0]
    });
    for (let index = 1; index < verificationUris.length; index += 1) {
      await expect(api.startTwitchAuth()).rejects.toThrow("Invalid Twitch authorization response");
    }
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

      throw new Error(`Unexpected request ${url}`);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await api.getServerConfig();

    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/auth/management/sessions")).toHaveLength(1);
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

  it("previews moderation with management authentication and CSRF headers", async () => {
    const input = {
      target: "rendered" as const,
      text: "Spoiler https://example.test",
      settings: { maxLength: 100, blockedTerms: [" spoiler "], stripUrls: true }
    };
    const result = {
      target: "rendered" as const,
      settings: { maxLength: 100, blockedTerms: ["spoiler"], stripUrls: true },
      text: "[moderated] [link removed]",
      actions: [
        { type: "url-stripped" as const, count: 1 },
        { type: "blocked-term-replaced" as const, count: 1 }
      ]
    };
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/moderation/preview") {
        expect(init).toMatchObject({ method: "POST", body: JSON.stringify(input) });
        expect(init?.headers).toMatchObject({
          authorization: "Bearer mgmt_session",
          "content-type": "application/json",
          "x-stream-jams-csrf": "csrf_session"
        });
        return jsonResponse(result);
      }
      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.previewModeration(input)).resolves.toEqual(result);
  });

  it("rejects a truncation action that disagrees with the preview policy", async () => {
    const fetcher = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url === "/auth/management/sessions") return jsonResponse(managementSession());
      if (url === "/moderation/preview") {
        return jsonResponse({
          target: "rendered",
          settings: { maxLength: 100, blockedTerms: [], stripUrls: false },
          text: "safe",
          actions: [{ type: "max-length-truncated", maxLength: 101 }]
        });
      }
      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.previewModeration({ target: "rendered", text: "safe" })).rejects.toThrow(
      "Invalid moderation preview response"
    );
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

  it("creates and regenerates overlay output keys with management headers", async () => {
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

      throw new Error("Unexpected request " + url);
    });
    const api = createHttpManagementApi({ fetch: fetcher });

    await expect(api.createOverlayOutputKey(keyRequest)).resolves.toMatchObject({ keyId: "key-1" });
    await expect(api.regenerateOverlayOutputKey(keyRequest)).resolves.toMatchObject({ keyId: "key-2" });
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

function deviceAuthorizationStart() {
  return {
    authorizationId: "auth-test",
    verificationUri: "https://www.twitch.tv/activate",
    userCode: "TEST-CODE",
    expiresAt: "2026-07-16T18:00:00.000Z",
    intervalSeconds: 5,
    scopes: ["user:read:chat"]
  };
}

function connectedTwitchStatus() {
  return {
    connected: true as const,
    authorizationState: "ready" as const,
    missingScopes: [],
    account: {
      accountId: "account-1",
      login: "jamsethoth",
      displayName: "Jamsethoth",
      scopes: ["user:read:chat"],
      connectedAt: "2026-07-15T05:00:00.000Z",
      updatedAt: "2026-07-15T05:00:00.000Z"
    }
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

function variationAuthoringContext() {
  return {
    ruleId: "alert-follow",
    eventType: "follow" as const,
    candidates: [
      {
        editorId: "alert-follow",
        variantId: "variant-follow",
        kind: "default" as const,
        name: "New follower",
        enabled: true,
        conditions: [],
        weight: 1,
        priority: null
      },
      {
        editorId: "variant-vip",
        variantId: "variant-vip",
        kind: "variation" as const,
        name: "VIP follower",
        enabled: false,
        conditions: [{ field: "actor.displayName", operator: "equals" as const, value: "James" }],
        weight: 3,
        priority: 7
      }
    ]
  };
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
  saveAlertEditorDocument(
    alertId: string,
    document: ReturnType<typeof editorDocument>,
    confirmLiveImpact?: boolean,
    priorityAssignments?: readonly { readonly variationId: string; readonly priority: number }[]
  ): Promise<unknown>;
  sendAlertEditorTest(alertId: string, request: {
    readonly document: ReturnType<typeof editorDocument>;
    readonly targetProfileId: "landscape" | "vertical";
    readonly samplePayload: Record<string, unknown>;
    readonly includeAudio: boolean;
    readonly includeTts: boolean;
  }): Promise<unknown>;
  reportAlertEditorError(alertId: string, input: unknown): Promise<unknown>;
  listAssetLibraryItems(): Promise<readonly unknown[]>;
  getDiagnosticsWorkspace(): Promise<unknown>;
  getConfigurationBackupSummary(): Promise<unknown>;
  exportConfigurationBackup(): Promise<unknown>;
  preflightConfigurationRestore(archive: ReturnType<typeof backupArchive>): Promise<unknown>;
  restoreConfiguration(input: unknown): Promise<unknown>;
  openDataFolder(): Promise<unknown>;
  clearOldLogs(): Promise<unknown>;
}

function backupArchive() {
  return {
    manifest: { format: "stream-jams-backup", archiveVersion: 2, appVersion: "0.0.0", schemaVersion: 9, createdAt: "2026-07-15T05:00:00.000Z", configurationChecksum: `sha256:${"a".repeat(64)}`, configurationRecordCount: 0, assetCount: 0, totalAssetBytes: 0 },
    configuration: { appConfig: {}, tables: {}, providerReconnectMetadata: [], overlayOutputs: [] },
    assets: []
  } as const;
}

function backupPreflight() {
  return {
    state: "valid" as const,
    archiveId: `sha256:${"b".repeat(64)}`,
    appVersion: "0.0.0",
    schemaVersion: 9,
    createdAt: "2026-07-15T05:00:00.000Z",
    impact: { configurationRecords: 0, providers: 0, alertSets: 0, assets: 0, preferences: 1, browserOutputs: 0 },
    runtime: { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
    blockers: [],
    warnings: []
  };
}

function backupRestoreResult() {
  return { state: "completed" as const, safetyBackupPath: "C:/safe/pre-restore.streamjams-backup", restored: backupPreflight().impact, regeneratedOutputs: [], reconnectProviders: [], warnings: [] };
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
    parentAlertId: null,
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
