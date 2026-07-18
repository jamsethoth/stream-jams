import type {
  AlertEditorDocument,
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
});

function createService(
  providers: readonly RegisteredProviderView[],
  activeSet: AlertSetOverview | null = null,
  getEventSourceRuntimeView: ((provider: RegisteredProviderView) => {
    readonly liveStatus: ProviderLiveStatus;
    readonly error: RegisteredProviderView["error"];
  }) | undefined = undefined,
  alertSetOverrides: Partial<ManagementUiServiceOptions["alertSetService"]> = {}
) {
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
      getSet: vi.fn(),
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
    saveAlertEditorDocument: async (_alertId, document) => document,
    sendAlertEditorTest: async (_alertId, request) => ({
      status: "queued",
      targetProfileId: request.targetProfileId,
      referenceId: "ref-test",
      test: true
    }),
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
    getEventSourceRuntimeView: runtimeView
  };
  return new ManagementUiService(options);
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
