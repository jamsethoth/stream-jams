import { describe, expect, it, vi } from "vitest";
import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle
} from "@stream-jams/core";
import { createServerApp, type ServerAppDependencies } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";
import { AlertEditorLiveImpactConfirmationRequiredError } from "../../modules/alerts/alert-editor-service.js";

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
    expect(responses[4]?.json()).toEqual([expect.objectContaining({ id: "set-default" })]);
    expect(responses[5]?.json()).toEqual(expect.objectContaining({ id: "alert-follow" }));
    expect(responses[8]?.json()).toEqual(expect.objectContaining({ state: "ready" }));
  });

  it("records a sanitized alert-editor client error through the protected management boundary", async () => {
    const { app, authHeaders, service } = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/editor/errors",
      headers: authHeaders,
      payload: {
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
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ referenceId: "err_editor_save" });
    expect(service.editorCommands).toContainEqual([
      "report-error",
      "alert-follow",
      "set-default",
      "err_editor_save"
    ]);
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

  it("runs protected local settings maintenance commands", async () => {
    const { app, authHeaders, service } = await createApp();

    const opened = await app.inject({ method: "POST", url: "/management/settings/open-data-folder", headers: authHeaders });
    const cleared = await app.inject({ method: "POST", url: "/management/settings/clear-old-logs", headers: authHeaders });

    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toEqual({ dataDirectory: "C:/Users/James/.stream-jams/data" });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual({ deletedCount: 3 });
    expect(service.maintenanceCommands).toEqual(["open-data-folder", "clear-old-logs"]);
  });

  it("returns a reference ID when retained-log cleanup fails", async () => {
    const { app, authHeaders, service } = await createApp();
    service.failLogCleanup = true;

    const response = await app.inject({ method: "POST", url: "/management/settings/clear-old-logs", headers: authHeaders });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        id: "err_settings_maintenance",
        message: "A server error occurred. Use the error ID to find details in backend logs."
      }
    });
  });

  it("updates asset metadata, reports candidate replacement impact, and deletes unused assets", async () => {
    const { app, authHeaders, service } = await createApp();

    const updated = await app.inject({
      method: "PATCH",
      url: "/management/assets/asset-image",
      headers: authHeaders,
      payload: { displayName: "Winter follower", tags: ["Winter", "follow"] }
    });
    const impact = await app.inject({
      method: "GET",
      url: "/management/assets/asset-image/change-impact?candidateMediaType=audio",
      headers: authHeaders
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: "/management/assets/asset-image",
      headers: authHeaders
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ displayName: "Winter follower", tags: ["winter", "follow"] });
    expect(impact.statusCode).toBe(200);
    expect(impact.json()).toMatchObject({ assetId: "asset-image" });
    expect(deleted.statusCode).toBe(204);
    expect(service.assetCommands).toEqual([
      ["metadata", "asset-image", { displayName: "Winter follower", tags: ["winter", "follow"] }],
      ["impact", "asset-image", "audio"],
      ["delete", "asset-image"]
    ]);
  });

  it("loads, saves, and sends an alert editor document through distinct commands", async () => {
    const { app, authHeaders, service } = await createApp();
    const loaded = await app.inject({
      method: "GET",
      url: "/management/alerts/alert-follow/editor",
      headers: authHeaders
    });
    const document = loaded.json();
    expect(document.layers[0]).toMatchObject({
      textStyle: compatibilityAlertTextStyle,
      boxStyle: compatibilityAlertTextBoxStyle
    });
    const saved = await app.inject({
      method: "PUT",
      url: "/management/alerts/alert-follow/editor",
      headers: authHeaders,
      payload: { document: { ...document, name: "Follower welcome" }, confirmLiveImpact: true }
    });
    const sent = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/editor/test",
      headers: authHeaders,
      payload: {
        document,
        targetProfileId: "landscape",
        samplePayload: { userName: "James" },
        includeAudio: false,
        includeTts: false
      }
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ name: "Follower welcome" });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toEqual({ status: "queued", targetProfileId: "landscape", referenceId: "ref-editor-test", test: true });
    expect(service.editorCommands).toEqual([
      ["save", "alert-follow", "Follower welcome", true],
      ["test", "alert-follow", "landscape"]
    ]);
  });

  it("rejects an unknown alert font before calling the save command", async () => {
    const { app, authHeaders, service } = await createApp();
    const document = (await app.inject({
      method: "GET",
      url: "/management/alerts/alert-follow/editor",
      headers: authHeaders
    })).json();

    const response = await app.inject({
      method: "PUT",
      url: "/management/alerts/alert-follow/editor",
      headers: authHeaders,
      payload: {
        confirmLiveImpact: true,
        document: {
          ...document,
          layers: [{
            id: "layer-text",
            name: "Message",
            type: "text",
            visible: true,
            order: 0,
            template: "Welcome, {userName}!",
            textStyle: {
              fontPreset: "https://fonts.invalid/custom.woff2",
              fontSizePx: 32,
              fontWeight: 800,
              lineHeight: 1.15,
              horizontalAlign: "center",
              verticalAlign: "center",
              color: "#FFFFFFFF",
              shadow: null
            },
            boxStyle: {
              backgroundColor: "#00000000",
              paddingPx: 0,
              cornerRadiusPx: 0,
              shadow: null
            },
            animation: {
              mode: "preset",
              entrance: "fade",
              exit: "fade",
              durationMs: 300,
              delayMs: 0,
              easing: "ease-out"
            }
          }]
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_ALERT_EDITOR_DOCUMENT"
      }
    });
    expect(service.editorCommands).not.toContainEqual(expect.arrayContaining(["save"]));
  });

  it("requires explicit confirmation when an editor save can change live output", async () => {
    const { app, authHeaders } = await createApp();
    const document = (await app.inject({
      method: "GET",
      url: "/management/alerts/alert-follow/editor",
      headers: authHeaders
    })).json();

    const response = await app.inject({
      method: "PUT",
      url: "/management/alerts/alert-follow/editor",
      headers: authHeaders,
      payload: { document: { ...document, name: "Unconfirmed change" } }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "ALERT_EDITOR_LIVE_IMPACT_CONFIRMATION_REQUIRED",
        message: expect.stringContaining("confirm")
      }
    });
  });

  it("validates and registers providers without combining the two operations", async () => {
    const { app, authHeaders, service } = await createApp();
    const setup = {
      name: "Primary Streamer.bot",
      kind: "streamerbot",
      configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" },
      credential: "secret"
    };

    const validation = await app.inject({
      method: "POST",
      url: "/management/providers/validate",
      headers: authHeaders,
      payload: setup
    });
    expect(validation.statusCode).toBe(200);
    expect(validation.json()).toEqual(expect.objectContaining({ valid: true }));
    expect(service.registeredSetups).toEqual([]);

    const registration = await app.inject({
      method: "POST",
      url: "/management/providers",
      headers: authHeaders,
      payload: setup
    });
    expect(registration.statusCode).toBe(201);
    expect(registration.json()).toEqual(expect.objectContaining({ status: "registered" }));
    expect(service.registeredSetups).toEqual([setup]);
  });

  it("deactivates a registered provider through an explicit command", async () => {
    const { app, authHeaders, service } = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/management/providers/provider-twitch-main/deactivate",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "provider-twitch-main", active: false, intakeState: "inactive" });
    expect(service.deactivationRequests).toEqual(["provider-twitch-main"]);
  });

  it("returns provider details and applies activation, safety, and voice-test commands", async () => {
    const { app, authHeaders, service } = await createApp();
    const detail = await app.inject({
      method: "GET",
      url: "/management/providers/provider-speakerbot",
      headers: authHeaders
    });
    const activation = await app.inject({
      method: "POST",
      url: "/management/providers/provider-twitch-main/activate",
      headers: authHeaders,
      payload: { confirmWarnings: true }
    });
    const safety = await app.inject({
      method: "PUT",
      url: "/management/providers/provider-speakerbot/tts-safety",
      headers: authHeaders,
      payload: { defaultVoiceId: "voice-2", volume: 0.7, minimumRate: 0.75, maximumRate: 1.5, maximumTextLength: 180 }
    });
    const voice = await app.inject({
      method: "POST",
      url: "/management/providers/provider-speakerbot/test-voice",
      headers: authHeaders
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual(expect.objectContaining({ provider: expect.objectContaining({ id: "provider-speakerbot" }) }));
    expect(activation.statusCode).toBe(200);
    expect(service.activationRequests).toEqual([{ providerId: "provider-twitch-main", confirmWarnings: true }]);
    expect(safety.statusCode).toBe(200);
    expect(voice.statusCode).toBe(200);
    expect(voice.json()).toEqual({ delivered: true, error: null });
  });

  it("manages alert sets without routing commands through the legacy collection API", async () => {
    const { app, authHeaders, service } = await createApp();

    const detail = await app.inject({ method: "GET", url: "/management/alert-sets/set-default", headers: authHeaders });
    const created = await app.inject({
      method: "POST",
      url: "/management/alert-sets",
      headers: authHeaders,
      payload: { name: "Spooky season" }
    });
    const renamed = await app.inject({
      method: "PATCH",
      url: "/management/alert-sets/set-default",
      headers: authHeaders,
      payload: { name: "Everyday" }
    });
    const duplicated = await app.inject({
      method: "POST",
      url: "/management/alert-sets/set-default/duplicate",
      headers: authHeaders,
      payload: { name: "Everyday copy" }
    });
    const impact = await app.inject({
      method: "GET",
      url: "/management/alert-sets/set-default/activation-impact",
      headers: authHeaders
    });
    const activated = await app.inject({
      method: "POST",
      url: "/management/alert-sets/set-default/activate",
      headers: authHeaders,
      payload: { confirmWarnings: true }
    });
    const reviewed = await app.inject({
      method: "POST",
      url: "/management/alert-sets/set-default/starter-review",
      headers: authHeaders
    });
    const alertCreated = await app.inject({
      method: "POST",
      url: "/management/alert-sets/set-default/alerts",
      headers: authHeaders,
      payload: { eventType: "cheer", name: "Big cheer" }
    });
    const enabled = await app.inject({
      method: "PATCH",
      url: "/management/alerts/alert-follow/enabled",
      headers: authHeaders,
      payload: { enabled: true }
    });
    const variation = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/variations",
      headers: authHeaders,
      payload: { name: "VIP follower" }
    });
    const alertCopy = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/duplicate",
      headers: authHeaders
    });
    const resetAlert = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/reset",
      headers: authHeaders,
      payload: { confirmLiveImpact: true }
    });
    const deletedAlert = await app.inject({
      method: "DELETE",
      url: "/management/alerts/variant-vip",
      headers: authHeaders,
      payload: { confirmLiveImpact: true }
    });
    const deleted = await app.inject({ method: "DELETE", url: "/management/alert-sets/set-seasonal", headers: authHeaders });

    expect([detail, created, renamed, duplicated, impact, activated, reviewed, alertCreated, enabled, variation, alertCopy, resetAlert].map((response) => response.statusCode)).toEqual([
      200,
      201,
      200,
      201,
      200,
      200,
      200,
      201,
      200,
      201,
      201,
      200
    ]);
    expect(deletedAlert.statusCode).toBe(204);
    expect(deleted.statusCode).toBe(204);
    expect(service.alertSetCommands).toEqual([
      ["create", "Spooky season"],
      ["rename", "set-default", "Everyday"],
      ["duplicate", "set-default", "Everyday copy"],
      ["activate", "set-default", true],
      ["review", "set-default"],
      ["create-alert", "set-default", "cheer", "Big cheer"],
      ["enable-alert", "alert-follow", true],
      ["create-variation", "alert-follow", "VIP follower"],
      ["duplicate-alert", "alert-follow"],
      ["reset-alert", "alert-follow", true],
      ["delete-alert", "variant-vip", true],
      ["delete", "set-seasonal"]
    ]);
  });

  it("rejects malformed alert-set command input with actionable client errors", async () => {
    const { app, authHeaders } = await createApp();
    const invalidName = await app.inject({
      method: "POST",
      url: "/management/alert-sets",
      headers: authHeaders,
      payload: { name: " " }
    });
    const invalidEnabled = await app.inject({
      method: "PATCH",
      url: "/management/alerts/alert-follow/enabled",
      headers: authHeaders,
      payload: { enabled: "yes" }
    });
    const invalidVariation = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/variations",
      headers: authHeaders,
      payload: { name: "" }
    });
    const invalidReset = await app.inject({
      method: "POST",
      url: "/management/alerts/alert-follow/reset",
      headers: authHeaders,
      payload: { confirmLiveImpact: "yes" }
    });

    expect(invalidName.statusCode).toBe(400);
    expect(invalidVariation.statusCode).toBe(400);
    expect(invalidReset.statusCode).toBe(400);
    expect(invalidName.json()).toEqual({
      error: {
        code: "INVALID_ALERT_SET_NAME",
        message: "Enter an alert set name between 1 and 120 characters."
      }
    });
    expect(invalidEnabled.statusCode).toBe(400);
    expect(invalidEnabled.json()).toEqual({
      error: {
        code: "INVALID_ALERT_ENABLED_STATE",
        message: "enabled must be true or false"
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
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    generateServerErrorId: () => "err_settings_maintenance",
    serverErrorLogger: vi.fn()
  } as unknown as ServerAppDependencies & { readonly managementUiQueryService: StubManagementUiQueryService };

  return {
    app: createServerApp(dependencies),
    authHeaders: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken },
    service: dependencies.managementUiQueryService
  };
}

class StubManagementUiQueryService {
  readonly registeredSetups: unknown[] = [];
  readonly activationRequests: Array<{ readonly providerId: string; readonly confirmWarnings: boolean }> = [];
  readonly deactivationRequests: string[] = [];
  readonly alertSetCommands: unknown[][] = [];
  readonly assetCommands: unknown[][] = [];
  readonly editorCommands: unknown[][] = [];
  readonly maintenanceCommands: string[] = [];
  failLogCleanup = false;

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

  async getRegisteredProvider(providerId: string) {
    return {
      provider: {
        id: providerId,
        name: "Speaker.bot",
        kind: "speakerbot" as const,
        capability: "tts" as const,
        active: true,
        connectionState: "connected" as const,
        intakeState: null,
        validatedAt: "2026-07-15T05:00:00.000Z",
        error: null,
        usedByAlertCount: 2
      },
      configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" },
      availableVoices: [{ id: "voice-1", label: "Default" }],
      ttsSafety: { defaultVoiceId: "voice-1", volume: 0.8, minimumRate: 0.5, maximumRate: 2, maximumTextLength: 240 }
    };
  }

  async validateProviderSetup() {
    return {
      valid: true,
      connectionState: "connected" as const,
      intakeState: "inactive" as const,
      validatedAt: "2026-07-15T05:00:00.000Z",
      availableVoices: [],
      error: null
    };
  }

  async registerProvider(input: unknown) {
    this.registeredSetups.push(input);
    return {
      status: "registered" as const,
      provider: await this.getRegisteredProvider("provider-streamerbot"),
      validation: await this.validateProviderSetup()
    };
  }

  async activateProvider(providerId: string, confirmWarnings: boolean) {
    this.activationRequests.push({ providerId, confirmWarnings });
    return {
      provider: (await this.getRegisteredProvider(providerId)).provider,
      replacedProviderId: null,
      impact: await this.getProviderActivationImpact()
    };
  }

  async deactivateProvider(providerId: string) {
    this.deactivationRequests.push(providerId);
    return {
      ...(await this.getRegisteredProvider(providerId)).provider,
      capability: "event-source" as const,
      kind: "twitch" as const,
      active: false,
      intakeState: "inactive" as const
    };
  }

  async updateTtsProviderSafetySettings(_providerId: string, settings: unknown) {
    return settings;
  }

  async testProviderVoice() {
    return { delivered: true, error: null };
  }

  async getTtsProviderSafetySettings() {
    return { defaultVoiceId: "voice-1", volume: 0.8, minimumRate: 0.5, maximumRate: 2, maximumTextLength: 240 };
  }

  async listAlertSets() {
    return [alertSetOverview()];
  }

  async getAlertSet() {
    return { overview: alertSetOverview(), inventory: [alertInventoryRow()], browserSources: [] };
  }

  async createAlertSet(input: { readonly name: string }) {
    this.alertSetCommands.push(["create", input.name]);
    return { ...alertSetOverview(), id: "set-seasonal", name: input.name, active: false, starter: false };
  }

  async createAlert(setId: string, input: { readonly eventType: "cheer"; readonly name: string }) {
    this.alertSetCommands.push(["create-alert", setId, input.eventType, input.name]);
    return {
      ...alertInventoryRow(),
      id: "alert-cheer",
      setId,
      eventType: input.eventType,
      name: input.name,
      previewText: "Thanks for the cheer, {actor.displayName}!"
    };
  }

  async renameAlertSet(setId: string, input: { readonly name: string }) {
    this.alertSetCommands.push(["rename", setId, input.name]);
    return { ...alertSetOverview(), id: setId, name: input.name };
  }

  async duplicateAlertSet(setId: string, input: { readonly name: string }) {
    this.alertSetCommands.push(["duplicate", setId, input.name]);
    return { ...alertSetOverview(), id: "set-copy", name: input.name, active: false, starter: false };
  }

  async getAlertSetActivationImpact() {
    return alertSetActivationImpact();
  }

  async activateAlertSet(setId: string, confirmWarnings: boolean) {
    this.alertSetCommands.push(["activate", setId, confirmWarnings]);
    return { activeSet: alertSetOverview(), replacedSetId: null, impact: alertSetActivationImpact() };
  }

  async markStarterAlertSetReviewComplete(setId: string) {
    this.alertSetCommands.push(["review", setId]);
    return { ...alertSetOverview(), starterReviewState: "complete" as const };
  }

  async setManagedAlertEnabled(alertId: string, enabled: boolean) {
    this.alertSetCommands.push(["enable-alert", alertId, enabled]);
    return { overview: alertSetOverview(), inventory: [{ ...alertInventoryRow(), enabled }], browserSources: [] };
  }

  async createAlertVariation(alertId: string, input: { readonly name: string }) {
    this.alertSetCommands.push(["create-variation", alertId, input.name]);
    return {
      ...alertInventoryRow(),
      id: "variant-vip",
      parentAlertId: alertId,
      kind: "variation" as const,
      name: input.name
    };
  }

  async duplicateManagedAlert(alertId: string) {
    this.alertSetCommands.push(["duplicate-alert", alertId]);
    return { ...alertInventoryRow(), id: "alert-follow-copy", name: "New follower copy" };
  }

  async resetManagedAlert(alertId: string, confirmLiveImpact: boolean) {
    this.alertSetCommands.push(["reset-alert", alertId, confirmLiveImpact]);
    return alertInventoryRow();
  }

  async deleteManagedAlert(alertId: string, confirmLiveImpact: boolean) {
    this.alertSetCommands.push(["delete-alert", alertId, confirmLiveImpact]);
  }

  async deleteAlertSet(setId: string) {
    this.alertSetCommands.push(["delete", setId]);
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
      variantConditions: [],
      weight: 1,
      priority: null,
      cooldownSeconds: 0,
      rulePriority: 0,
      durationMs: 5000,
      layers: [{
        id: "layer-text",
        name: "Message",
        type: "text" as const,
        visible: true,
        order: 0,
        template: "Thanks, {userName}!",
        animation: {
          mode: "preset" as const,
          entrance: "fade",
          exit: "fade",
          durationMs: 300,
          delayMs: 0,
          easing: "ease-out"
        }
      }],
      targetProfiles: [
        { id: "landscape" as const, enabled: true, reviewState: "ready" as const, layerLayouts: [] },
        { id: "vertical" as const, enabled: false, reviewState: "needs-review" as const, layerLayouts: [] }
      ],
      samplePayloads: [
        { id: "sample-normal", label: "Normal follower", kind: "built-in" as const, payload: { userName: "viewer" } }
      ]
    };
  }

  async saveAlertEditorDocument(
    alertId: string,
    document: Awaited<ReturnType<StubManagementUiQueryService["getAlertEditorDocument"]>>,
    confirmLiveImpact: boolean
  ) {
    if (!confirmLiveImpact) throw new AlertEditorLiveImpactConfirmationRequiredError(["landscape"]);
    this.editorCommands.push(["save", alertId, document.name, confirmLiveImpact]);
    return document;
  }

  async sendAlertEditorTest(alertId: string, request: { readonly targetProfileId: "landscape" | "vertical" }) {
    this.editorCommands.push(["test", alertId, request.targetProfileId]);
    return { status: "queued" as const, targetProfileId: request.targetProfileId, referenceId: "ref-editor-test", test: true as const };
  }

  async reportAlertEditorError(alertId: string, input: { readonly setId: string | null; readonly error: { readonly referenceId: string | null } }) {
    this.editorCommands.push(["report-error", alertId, input.setId, input.error.referenceId]);
    return { referenceId: input.error.referenceId ?? "ui_editor_fallback" };
  }

  async listAssetLibraryItems() {
    return [];
  }

  async updateAssetMetadata(assetId: string, input: { readonly displayName: string; readonly tags: readonly string[] }) {
    this.assetCommands.push(["metadata", assetId, input]);
    return {
      id: assetId,
      originalFileName: "asset.png",
      mediaType: "image" as const,
      mimeType: "image/png",
      sizeBytes: 1,
      width: null,
      height: null,
      durationMs: null,
      health: "available" as const,
      createdAt: "2026-07-15T05:00:00.000Z",
      updatedAt: "2026-07-15T05:00:00.000Z",
      usage: { assetId, totalUsageCount: 0, usages: [] },
      ...input
    };
  }

  async getAssetChangeImpact(assetId: string, candidateMediaType?: "image" | "gif" | "video" | "audio") {
    this.assetCommands.push(["impact", assetId, candidateMediaType]);
    return {
      assetId,
      usage: { assetId, totalUsageCount: 0, usages: [] },
      canDelete: true,
      requiresConfirmation: false,
      warnings: []
    };
  }

  async deleteAsset(assetId: string) { this.assetCommands.push(["delete", assetId]); }

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
      dataDirectory: "C:/Users/James/.stream-jams/data",
      assetDirectory: "C:/Users/James/.stream-jams/assets",
      logLevel: "INFO",
      logRetentionHours: 48,
      secretExclusions: ["Provider credentials", "Overlay route keys"],
      blockers: []
    };
  }

  async openDataFolder() {
    this.maintenanceCommands.push("open-data-folder");
    return { dataDirectory: "C:/Users/James/.stream-jams/data" };
  }

  async clearOldLogs() {
    this.maintenanceCommands.push("clear-old-logs");
    if (this.failLogCleanup) throw new Error("Log directory permission denied");
    return { deletedCount: 3 };
  }
}

function alertSetOverview() {
  return {
    id: "set-default",
    name: "Default",
    active: true,
    starter: true,
    starterReviewState: "pending" as const,
    enabledAlertCount: 0,
    targetProfiles: [
      { id: "landscape" as const, enabled: true, reviewState: "ready" as const, blockerCount: 0, warningCount: 0 },
      { id: "vertical" as const, enabled: false, reviewState: "needs-review" as const, blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
}

function alertInventoryRow() {
  return {
    id: "alert-follow",
    parentAlertId: null,
    setId: "set-default",
    providerKind: "twitch" as const,
    eventType: "follow" as const,
    name: "New follower",
    kind: "default" as const,
    enabled: false,
    reviewState: "needs-review" as const,
    targetProfileIds: ["landscape" as const],
    previewText: "Thanks for following, {actor.displayName}!"
  };
}

function alertSetActivationImpact() {
  return {
    currentActiveSetId: "set-default",
    replacingActiveSetName: null,
    enabledAlertCount: 0,
    affectedTargetProfileIds: ["landscape" as const],
    affectedEventTypes: [],
    blockers: [],
    warnings: []
  };
}
