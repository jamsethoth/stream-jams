import type {
  AlertEditorDocument,
  AlertSetOverview,
  AssetLibraryItem,
  ConfigurationBackupSummary,
  DiagnosticsWorkspaceView,
  ProviderCapability,
  ProviderKind,
  RegisteredProviderView
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { ManagementUiService } from "./management-ui-service.js";

describe("ManagementUiService", () => {
  it("reports first-run setup actions without treating OBS verification as readiness", async () => {
    const service = createService([]);

    await expect(service.getHomeSetupSummary()).resolves.toEqual({
      readiness: [
        expect.objectContaining({ id: "event-source", state: "action-required", actionRoute: "/event-sources?setup=add" }),
        expect.objectContaining({ id: "tts-provider", state: "action-required", actionRoute: "/tts-providers?setup=add" }),
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
      correction: { label: "Open event sources", route: "/event-sources" }
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
});

function createService(providers: readonly RegisteredProviderView[]) {
  const activeSet = null as AlertSetOverview | null;
  return new ManagementUiService({
    providerService: {
      listProviders: vi.fn(async (capability: ProviderCapability) =>
        providers.filter((providerView) => providerView.capability === capability)
      ),
      getProvider: vi.fn(),
      validateProvider: vi.fn(),
      registerProvider: vi.fn(),
      activateProvider: vi.fn(),
      getActivationImpact: vi.fn(),
      getTtsSafety: vi.fn(),
      updateTtsSafety: vi.fn(),
      testVoice: vi.fn()
    },
    getActiveAlertSet: async () => activeSet,
    hasBrowserOutput: async () => false,
    listAlertSets: async (): Promise<readonly AlertSetOverview[]> => [],
    getAlertEditorDocument: async (): Promise<AlertEditorDocument> => {
      throw new Error("not configured");
    },
    listAssetLibraryItems: async (): Promise<readonly AssetLibraryItem[]> => [],
    getDiagnosticsWorkspace: async (): Promise<DiagnosticsWorkspaceView> => ({ problems: [], events: [], rawLogs: [] }),
    getConfigurationBackupSummary: async (): Promise<ConfigurationBackupSummary> => ({
      state: "ready",
      appVersion: "0.0.0",
      schemaVersion: 5,
      configurationRecordCount: 0,
      assetCount: 0,
      totalAssetBytes: 0,
      secretExclusions: ["Provider credentials", "Overlay route keys"],
      blockers: []
    })
  });
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
