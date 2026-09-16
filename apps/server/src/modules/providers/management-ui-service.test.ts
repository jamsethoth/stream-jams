import type {
  AlertEditorDocument,
  AlertSetDetail,
  AlertVariationAuthoringContext,
  AlertSetOverview,
  AssetLibraryItem,
  ConfigurationBackupSummary,
  DiagnosticsWorkspaceView,
  ProviderCapability,
  ProviderKind,
  ProviderLiveStatus,
  RegisteredProviderView
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { ManagementUiService, type ManagementUiServiceOptions } from "./management-ui-service.js";

describe("ManagementUiService", () => {
  it("reports first-run setup actions without treating OBS verification as readiness", async () => {
    const service = createService([]);

    await expect(service.getHomeSetupSummary()).resolves.toEqual({
      readiness: [
        expect.objectContaining({ id: "event-source", state: "action-required", actionRoute: "/manage/event-sources?setup=add" }),
        expect.objectContaining({ id: "tts-provider", state: "action-required", actionRoute: "/manage/tts-providers?setup=add" }),
        expect.objectContaining({ id: "starter-alert-set", state: "action-required" }),
        expect.objectContaining({ id: "browser-output", state: "action-required" })
      ],
      activeAlertSet: null,
      alertConfiguration: { state: "no-active-set", enabledAlertCount: 0, items: [] },
      actionableProblems: []
    });
  });

  it("separates event-source connection from intake readiness and surfaces provider errors", async () => {
    const providerError = {
      summary: "Streamer.bot intake stopped",
      cause: "The WebSocket closed.",
      nextStep: "Restart Streamer.bot and validate the connection.",
      severity: "error" as const,
      occurredAt: "2026-07-15T05:00:00.000Z",
      referenceId: "ref-provider",
      correction: { label: "Open event sources", route: "/manage/event-sources" }
    };
    const service = createService([
      provider("event", "streamerbot", "event-source", true, "connected", "error", providerError),
      provider("speech", "browser-speech", "tts", true, "connected", null, null)
    ]);

    const summary = await service.getHomeSetupSummary();

    expect(summary.readiness[0]).toEqual(expect.objectContaining({ state: "blocked" }));
    expect(summary.readiness[1]).toEqual(expect.objectContaining({ state: "complete" }));
    expect(summary.actionableProblems).toEqual([providerError]);
  });

  it("projects live runtime status onto event-source views and Home readiness", async () => {
    const active = provider("event", "streamerbot", "event-source", true, "connected", "active", null);
    const inactive = provider("backup", "twitch", "event-source", false, "connected", "inactive", null);
    const getEventSourceRuntimeView = vi.fn((candidate: RegisteredProviderView) => ({
      liveStatus: candidate.active ? "healthy" as const : "not-running" as const,
      error: null
    }));
    const service = createService([active, inactive], null, getEventSourceRuntimeView);

    await expect(service.listRegisteredProviders("event-source")).resolves.toEqual([
      expect.objectContaining({ id: "event", liveStatus: "healthy" }),
      expect.objectContaining({ id: "backup", liveStatus: "not-running" })
    ]);
    await expect(service.getHomeSetupSummary()).resolves.toMatchObject({
      readiness: expect.arrayContaining([expect.objectContaining({ id: "event-source", state: "complete" })])
    });
    expect(getEventSourceRuntimeView).toHaveBeenCalledWith(active);
  });

  it("projects the current runtime error onto event-source list and detail views", async () => {
    const active = provider("event", "twitch", "event-source", true, "connected", "active", null);
    const runtimeError = {
      summary: "Twitch EventSub live status error",
      cause: "Twitch EventSub WebSocket error",
      nextStep: "Review the provider connection and reconnect it before retrying.",
      severity: "error" as const,
      occurredAt: "2026-07-17T12:00:00.000Z",
      referenceId: "ref-twitch-1",
      correction: {
        label: "Open diagnostics",
        route: "/manage/diagnostics?reference=ref-twitch-1"
      }
    };
    const service = createService([active], null, () => ({ liveStatus: "error", error: runtimeError }));

    await expect(service.listRegisteredProviders("event-source")).resolves.toEqual([
      expect.objectContaining({ id: "event", liveStatus: "error", error: runtimeError })
    ]);
    await expect(service.getRegisteredProvider("event")).resolves.toMatchObject({
      provider: { id: "event", liveStatus: "error", error: runtimeError }
    });
  });

  it("projects Twitch authorization readiness onto inactive source list and detail views", async () => {
    const inactive = provider("twitch", "twitch", "event-source", false, "connected", "inactive", null);
    const twitchAuthorization = {
      connected: true as const,
      authorizationState: "update-required" as const,
      missingScopes: ["channel:read:polls"],
      account: {
        accountId: "account-1",
        login: "jamsethoth",
        displayName: "Jamsethoth",
        scopes: ["user:read:chat"],
        connectedAt: "2026-07-15T05:00:00.000Z",
        updatedAt: "2026-07-15T05:00:00.000Z"
      }
    };
    const service = createService([inactive], null, undefined, {}, async () => twitchAuthorization);
    const projectedAuthorization = {
      authorizationState: "update-required",
      missingScopes: ["channel:read:polls"],
      account: twitchAuthorization.account
    };

    await expect(service.listRegisteredProviders("event-source")).resolves.toEqual([
      expect.objectContaining({ id: "twitch", liveStatus: "not-running", twitchAuthorization: projectedAuthorization })
    ]);
    await expect(service.getRegisteredProvider("twitch")).resolves.toMatchObject({
      provider: expect.objectContaining({ twitchAuthorization: projectedAuthorization })
    });
  });

  it("keeps starter setup actionable until review is complete or a valid alert is enabled", async () => {
    const pending = createService([], alertSet("pending", 0));
    const enabled = createService([], alertSet("pending", 1));
    const reviewed = createService([], alertSet("complete", 0));

    await expect(pending.getHomeSetupSummary()).resolves.toMatchObject({
      readiness: expect.arrayContaining([expect.objectContaining({ id: "starter-alert-set", state: "action-required" })])
    });
    await expect(enabled.getHomeSetupSummary()).resolves.toMatchObject({
      readiness: expect.arrayContaining([expect.objectContaining({ id: "starter-alert-set", state: "complete" })])
    });
    await expect(reviewed.getHomeSetupSummary()).resolves.toMatchObject({
      readiness: expect.arrayContaining([expect.objectContaining({ id: "starter-alert-set", state: "complete" })])
    });
  });

  it("reports enabled alert configuration attention separately from completed setup", async () => {
    const overview = alertSet("complete", 1);
    const document = alertDocument({ targetProfiles: alertDocument().targetProfiles.map((profile) => ({ ...profile, enabled: true, reviewState: "needs-review" })) });
    const service = createService([], overview, undefined, {
      getSet: vi.fn(async () => alertSetDetail(overview, [{ ...alertRow(), enabled: true, targetProfileIds: ["landscape", "vertical"] }]))
    }, undefined, undefined, undefined, { getAlertEditorDocument: async () => document });

    const summary = await service.getHomeSetupSummary();

    expect(summary.readiness).toEqual(expect.arrayContaining([expect.objectContaining({ id: "starter-alert-set", state: "complete" })]));
    expect(summary.alertConfiguration).toMatchObject({
      state: "attention",
      enabledAlertCount: 1,
      items: [expect.objectContaining({ alertId: "alert-follow", name: "New follower", state: "review-needed" })]
    });
  });

  it("ignores an unused unreviewed profile and excludes disabled variants", async () => {
    const overview = alertSet("complete", 1);
    const getAlertEditorDocument = vi.fn(async () => alertDocument());
    const service = createService([], overview, undefined, {
      getSet: vi.fn(async () => alertSetDetail(overview, [
        alertRow(),
        { ...alertRow(), id: "variant-disabled", kind: "variation", parentAlertId: "alert-follow", enabled: false }
      ]))
    }, undefined, undefined, undefined, { getAlertEditorDocument });

    await expect(service.getHomeSetupSummary()).resolves.toMatchObject({
      alertConfiguration: { state: "configured", enabledAlertCount: 1, items: [] }
    });
    expect(getAlertEditorDocument).toHaveBeenCalledOnce();
    expect(getAlertEditorDocument).toHaveBeenCalledWith("alert-follow");
  });

  it("accepts resolved device-only audio and fails closed for missing documents", async () => {
    const overview = alertSet("complete", 2);
    const audioOnly = alertDocument({
      id: "variant-audio",
      kind: "variation",
      parentAlertId: "alert-follow",
      outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
      layers: [{ id: "audio", name: "Chime", type: "audio", visible: true, order: 0, animation, assetId: "chime", volume: 0.5 }],
      targetProfiles: alertDocument().targetProfiles.map((profile) => ({ ...profile, enabled: false, reviewState: "needs-review", layerLayouts: [] }))
    });
    const service = createService([], overview, undefined, {
      getSet: vi.fn(async () => alertSetDetail(overview, [alertRow("variant-audio"), alertRow("variant-missing")]))
    }, undefined, undefined, undefined, {
      getAlertEditorDocument: async (id) => id === "variant-audio" ? audioOnly : Promise.reject(new Error("missing"))
    });

    await expect(service.getHomeSetupSummary()).resolves.toMatchObject({
      alertConfiguration: {
        state: "unavailable",
        enabledAlertCount: 2,
        items: [expect.objectContaining({ alertId: "variant-missing", state: "unavailable" })]
      }
    });
  });

  it("accepts device-only audio independently of retained visual profile metadata", async () => {
    const overview = alertSet("complete", 1);
    const audioOnly = alertDocument({
      outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
      layers: [{ id: "audio", name: "Chime", type: "audio", visible: true, order: 0, animation, assetId: "chime", volume: 0.5 }],
      targetProfiles: alertDocument().targetProfiles.map((profile) => ({ ...profile, enabled: true, reviewState: "needs-review", layerLayouts: [] }))
    });
    const service = createService([], overview, undefined, {
      getSet: vi.fn(async () => alertSetDetail(overview, [alertRow()]))
    }, undefined, undefined, undefined, { getAlertEditorDocument: async () => audioOnly });

    await expect(service.getHomeSetupSummary()).resolves.toMatchObject({
      alertConfiguration: { state: "configured", enabledAlertCount: 1, items: [] }
    });
  });

  it("keeps browser and device audio attention when its enabled browser profile needs review", async () => {
    const overview = alertSet("complete", 1);
    const audio = alertDocument({
      outputs: { browserSource: true, deviceRouteIds: ["headphones"] },
      layers: [{ id: "audio", name: "Chime", type: "audio", visible: true, order: 0, animation, assetId: "chime", volume: 0.5 }],
      targetProfiles: alertDocument().targetProfiles.map((profile) => ({ ...profile, enabled: true, reviewState: "needs-review", layerLayouts: [] }))
    });
    const service = createService([], overview, undefined, {
      getSet: vi.fn(async () => alertSetDetail(overview, [alertRow()]))
    }, undefined, undefined, undefined, { getAlertEditorDocument: async () => audio });

    await expect(service.getHomeSetupSummary()).resolves.toMatchObject({
      alertConfiguration: { state: "attention", items: [expect.objectContaining({ alertId: "alert-follow", state: "review-needed" })] }
    });
  });

  it("forwards managed-alert authoring commands without changing their inputs", async () => {
    const createVariation = vi.fn(async () => ({ id: "variant-1" }));
    const duplicateAlert = vi.fn(async () => ({ id: "alert-copy" }));
    const resetAlert = vi.fn(async () => ({ id: "alert-1" }));
    const deleteAlert = vi.fn(async () => undefined);
    const service = createService([], null, undefined, {
      createAlertVariation: createVariation as never,
      duplicateManagedAlert: duplicateAlert as never,
      resetManagedAlert: resetAlert as never,
      deleteManagedAlert: deleteAlert
    });

    await service.createAlertVariation("alert-1", { name: "VIP" });
    await service.duplicateManagedAlert("alert-1");
    await service.resetManagedAlert("alert-1", true);
    await service.deleteManagedAlert("variant-1", false);

    expect(createVariation).toHaveBeenCalledWith("alert-1", { name: "VIP" });
    expect(duplicateAlert).toHaveBeenCalledWith("alert-1");
    expect(resetAlert).toHaveBeenCalledWith("alert-1", true);
    expect(deleteAlert).toHaveBeenCalledWith("variant-1", false);
  });

  it("forwards focused variation context reads without changing the editor ID", async () => {
    const context: AlertVariationAuthoringContext = {
      ruleId: "alert-follow",
      eventType: "follow",
      candidates: [{
        editorId: "alert-follow",
        variantId: "variant-follow",
        kind: "default",
        name: "New follower",
        enabled: true,
        conditions: [],
        weight: 1,
        priority: null
      }]
    };
    const getAlertVariationAuthoringContext = vi.fn(async () => context);
    const service = createService([], null, undefined, {}, undefined, getAlertVariationAuthoringContext);

    await expect(service.getAlertVariationAuthoringContext("variant-vip")).resolves.toEqual(context);
    expect(getAlertVariationAuthoringContext).toHaveBeenCalledWith("variant-vip");
  });

  it("forwards complete sibling priority assignments through the existing save command", async () => {
    const document = { id: "variant-vip" } as AlertEditorDocument;
    const assignments = [
      { variationId: "variant-vip", priority: 3 },
      { variationId: "variant-raid", priority: 2 }
    ];
    const saveAlertEditorDocument = vi.fn(async (_alertId, saved: AlertEditorDocument) => saved);
    const service = createService([], null, undefined, {}, undefined, undefined, saveAlertEditorDocument);

    await expect(service.saveAlertEditorDocument("variant-vip", document, true, assignments)).resolves.toBe(document);
    expect(saveAlertEditorDocument).toHaveBeenCalledWith("variant-vip", document, true, assignments);
  });
});

function createService(
  providers: readonly RegisteredProviderView[],
  activeSet: AlertSetOverview | null = null,
  getEventSourceRuntimeView: ((provider: RegisteredProviderView) => {
    readonly liveStatus: ProviderLiveStatus;
    readonly error: RegisteredProviderView["error"];
  }) | undefined = undefined,
  alertSetOverrides: Partial<ManagementUiServiceOptions["alertSetService"]> = {},
  getTwitchAuthorization: ManagementUiServiceOptions["getTwitchAuthorization"] | undefined = undefined,
  getAlertVariationAuthoringContext: ManagementUiServiceOptions["getAlertVariationAuthoringContext"] = async () => {
    throw new Error("not configured");
  },
  saveAlertEditorDocument: ManagementUiServiceOptions["saveAlertEditorDocument"] = async (_alertId, document) => document,
  optionOverrides: Partial<ManagementUiServiceOptions> = {}
) {
  const resolvedGetTwitchAuthorization = getTwitchAuthorization ?? (async () => ({
    connected: false,
    authorizationState: "disconnected",
    missingScopes: [],
    account: null
  } as const));
  const runtimeView = getEventSourceRuntimeView ?? ((providerView: RegisteredProviderView) => ({
    liveStatus: !providerView.active
      ? "not-running"
      : providerView.connectionState === "connected" && providerView.intakeState === "active"
        ? "healthy"
        : "error",
    error: providerView.error
  }));
  const options: ManagementUiServiceOptions = {
    providerService: {
      listProviders: vi.fn(async (capability: ProviderCapability) =>
        providers.filter((providerView) => providerView.capability === capability)
      ),
      getProvider: vi.fn(async (providerId: string) => ({
        provider: providers.find((providerView) => providerView.id === providerId)!,
        configuration: {},
        availableVoices: [],
        ttsSafety: null
      })),
      validateProvider: vi.fn(),
      registerProvider: vi.fn(),
      activateProvider: vi.fn(),
      deactivateProvider: vi.fn(),
      getActivationImpact: vi.fn(),
      getTtsSafety: vi.fn(),
      updateTtsSafety: vi.fn(),
      testVoice: vi.fn()
    },
    alertSetService: {
      listSets: async () => (activeSet === null ? [] : [activeSet]),
      getSet: vi.fn(async () => activeSet === null ? undefined as never : alertSetDetail(activeSet, [])),
      createSet: vi.fn(),
      createAlert: vi.fn(),
      createAlertVariation: vi.fn(),
      duplicateManagedAlert: vi.fn(),
      resetManagedAlert: vi.fn(),
      deleteManagedAlert: vi.fn(),
      renameSet: vi.fn(),
      duplicateSet: vi.fn(),
      getActivationImpact: vi.fn(),
      activateSet: vi.fn(),
      markStarterReviewComplete: vi.fn(),
      setAlertEnabled: vi.fn(),
      deleteSet: vi.fn(),
      ...alertSetOverrides
    },
    hasBrowserOutput: async () => false,
    getAlertEditorDocument: async (): Promise<AlertEditorDocument> => {
      throw new Error("not configured");
    },
    getAlertVariationAuthoringContext,
    saveAlertEditorDocument,
    sendAlertEditorTest: async (_alertId, request) => ({
      status: "queued",
      targetProfileId: request.targetProfileId,
      referenceId: "ref-test",
      test: true,
      deliveredDestinations: [],
      unavailableDestinations: []
    }),
    reportAlertEditorError: async (_alertId, input) => ({ referenceId: input.error.referenceId }),
    listAssetLibraryItems: async (): Promise<readonly AssetLibraryItem[]> => [],
    updateAssetMetadata: async (_assetId, input) => ({
      id: "asset-1",
      originalFileName: "asset.png",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: 1,
      width: null,
      height: null,
      durationMs: null,
      health: "available",
      createdAt: "2026-07-15T05:00:00.000Z",
      updatedAt: "2026-07-15T05:00:00.000Z",
      usage: { assetId: "asset-1", totalUsageCount: 0, usages: [] },
      ...input
    }),
    getAssetChangeImpact: async (assetId) => ({
      assetId,
      usage: { assetId, totalUsageCount: 0, usages: [] },
      owners: [],
      canDelete: true,
      requiresConfirmation: false,
      warnings: []
    }),
    deleteAsset: async () => undefined,
    getDiagnosticsWorkspace: async (): Promise<DiagnosticsWorkspaceView> => ({ problems: [], events: [], rawLogs: [] }),
    getConfigurationBackupSummary: async (): Promise<ConfigurationBackupSummary> => ({
      state: "ready",
      appVersion: "0.0.0",
      schemaVersion: 5,
      configurationRecordCount: 0,
      assetCount: 0,
      totalAssetBytes: 0,
      dataDirectory: "C:/Users/James/.stream-jams/data",
      assetDirectory: "C:/Users/James/.stream-jams/assets",
      logLevel: "INFO",
      logRetentionHours: 48,
      secretExclusions: ["Provider credentials", "Overlay route keys"],
      blockers: []
    }),
    getEventSourceRuntimeView: runtimeView,
    getTwitchAuthorization: resolvedGetTwitchAuthorization,
    ...optionOverrides
  };
  return new ManagementUiService(options);
}

function alertSetDetail(overview: AlertSetOverview, inventory: AlertSetDetail["inventory"]): AlertSetDetail {
  return { overview, inventory, browserSources: [] };
}

function alertRow(id = "alert-follow"): AlertSetDetail["inventory"][number] {
  return {
    id,
    parentAlertId: id === "alert-follow" ? null : "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    name: id === "alert-follow" ? "New follower" : id,
    kind: id === "alert-follow" ? "default" : "variation",
    enabled: true,
    conditions: [],
    weight: 1,
    priority: null,
    reviewState: "ready",
    targetProfileIds: ["landscape"],
    previewText: "Welcome"
  };
}

const animation = { mode: "preset" as const, entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" };

function alertDocument(overrides: Partial<AlertEditorDocument> = {}): AlertEditorDocument {
  return {
    schemaVersion: 1,
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 4_000,
    outputs: { browserSource: true, deviceRouteIds: [] },
    layers: [{ id: "shape", name: "Backdrop", type: "shape", visible: true, order: 0, animation, fill: "#FFFFFFFF" }],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "shape", x: 0, y: 0, width: 100, height: 100, zIndex: 0 }] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }],
    ...overrides
  };
}

function alertSet(starterReviewState: "pending" | "complete", enabledAlertCount: number): AlertSetOverview {
  return {
    id: "set-default",
    name: "Default",
    active: true,
    starter: true,
    starterReviewState,
    enabledAlertCount,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
}

function provider(
  id: string,
  kind: ProviderKind,
  capability: ProviderCapability,
  active: boolean,
  connectionState: RegisteredProviderView["connectionState"],
  intakeState: RegisteredProviderView["intakeState"],
  error: RegisteredProviderView["error"]
): RegisteredProviderView {
  return {
    id,
    name: id,
    kind,
    capability,
    active,
    connectionState,
    intakeState,
    validatedAt: "2026-07-15T05:00:00.000Z",
    error,
    usedByAlertCount: 0
  };
}
