import type { AssetRecord } from "./management/assets/asset-api.js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import type { AssetApi } from "./management/assets/AssetManager.js";
import type { ManagementApi } from "./management/management-api.js";

describe("App", () => {
  it("renders the management shell and keeps alerts and assets reachable", async () => {
    const user = userEvent.setup();
    render(<App assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(
      screen.getByRole("heading", {
        name: "Stream Jams"
      })
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Setup readiness" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Alerts" }));
    expect(await screen.findByRole("heading", { name: "No alert sets" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Assets" }));
    expect(await screen.findByText("No assets imported yet.")).toBeInTheDocument();
  });
});

function createManagementApi(): ManagementApi {
  return {
    async getHomeSetupSummary() {
      return { readiness: [], activeAlertSet: null, actionableProblems: [] };
    },
    async getTwitchStatus() {
      return { connected: false as const, account: null };
    },
    async startTwitchAuth() {
      throw new Error("not called");
    },
    async pollTwitchAuth() {
      throw new Error("not called");
    },
    async listRegisteredProviders() {
      return [];
    },
    async validateProvider(input) {
      return {
        valid: true,
        connectionState: "connected" as const,
        intakeState: input.kind === "twitch" || input.kind === "streamerbot" ? "inactive" as const : null,
        validatedAt: "2026-07-15T05:00:00.000Z",
        availableVoices: [],
        error: null
      };
    },
    async registerProvider() {
      throw new Error("not called");
    },
    async getProvider() {
      throw new Error("not called");
    },
    async activateProvider() {
      throw new Error("not called");
    },
    async deactivateProvider() {
      throw new Error("not called");
    },
    async getProviderActivationImpact() {
      return { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] };
    },
    async getTtsProviderSafetySettings() {
      return { defaultVoiceId: null, volume: 1, minimumRate: 0.5, maximumRate: 2, maximumTextLength: 240 };
    },
    async updateTtsSafety(_providerId, input) {
      return input;
    },
    async testProviderVoice() {
      return { delivered: true, error: null };
    },
    async listAlertSets() {
      return [];
    },
    async getAlertSet() {
      throw new Error("not called");
    },
    async createAlertSet() {
      throw new Error("not called");
    },
    async renameAlertSet() {
      throw new Error("not called");
    },
    async duplicateAlertSet() {
      throw new Error("not called");
    },
    async getAlertSetActivationImpact() {
      return {
        currentActiveSetId: null,
        replacingActiveSetName: null,
        enabledAlertCount: 0,
        affectedTargetProfileIds: [],
        affectedEventTypes: [],
        blockers: [],
        warnings: []
      };
    },
    async activateAlertSet() {
      throw new Error("not called");
    },
    async markStarterAlertSetReviewComplete() {
      throw new Error("not called");
    },
    async setManagedAlertEnabled() {
      throw new Error("not called");
    },
    async deleteAlertSet() {
      return undefined;
    },
    async getAlertEditorDocument() {
      throw new Error("not called");
    },
    async saveAlertEditorDocument(_alertId, document) {
      return document;
    },
    async sendAlertEditorTest(_alertId, request) {
      return { status: "queued", targetProfileId: request.targetProfileId, referenceId: "ref-test", test: true };
    },
    async listAssetLibraryItems() {
      return [];
    },
    async updateAssetMetadata() {
      throw new Error("not called");
    },
    async getAssetChangeImpact() {
      throw new Error("not called");
    },
    async deleteAsset() {
      throw new Error("not called");
    },
    async getDiagnosticsWorkspace() {
      return { problems: [], events: [], rawLogs: [] };
    },
    async getConfigurationBackupSummary() {
      return {
        state: "ready" as const,
        appVersion: "0.0.0",
        schemaVersion: 4,
        configurationRecordCount: 0,
        assetCount: 0,
        totalAssetBytes: 0,
        dataDirectory: "C:/Users/James/.stream-jams/data",
        assetDirectory: "C:/Users/James/.stream-jams/assets",
        logLevel: "INFO" as const,
        logRetentionHours: 48,
        secretExclusions: ["Provider credentials", "Overlay route keys"],
        blockers: []
      };
    },
    async exportConfigurationBackup() {
      throw new Error("not called");
    },
    async preflightConfigurationRestore() {
      throw new Error("not called");
    },
    async restoreConfiguration() {
      throw new Error("not called");
    },
    async getServerConfig() {
      return {
        host: "127.0.0.1",
        port: 39187
      };
    },
    async updateServerConfig(input) {
      return input;
    },
    async getModerationSettings() {
      return {
        renderedText: {
          maxLength: 240,
          blockedTerms: [],
          stripUrls: false
        },
        ttsText: {
          maxLength: 180,
          blockedTerms: [],
          stripUrls: true
        }
      };
    },
    async updateModerationSettings(input) {
      return input;
    },
    async createOverlayOutputKey() {
      throw new Error("Not implemented in test mock");
    },
    async regenerateOverlayOutputKey() {
      throw new Error("Not implemented in test mock");
    },
    async exportDiagnostics() {
      return {
        generatedAt: "2026-05-31T02:05:00.000Z",
        debugExport: false as const,
        rawEventLogs: [],
        eventLogs: [],
        alertMatchLogs: [],
        playbackLogs: [],
        providerErrors: [],
        runtimeLogging: null
      };
    },
    async exportDebugDiagnostics() {
      return {
        generatedAt: "2026-05-31T02:05:00.000Z",
        debugExport: true as const,
        rawEventLogs: [],
        eventLogs: [],
        alertMatchLogs: [],
        playbackLogs: [],
        providerErrors: [],
        runtimeLogging: null,
        runtimeLogEntries: [],
        runtimeLogTruncated: false
      };
    }
  };
}

function createAssetApi(): AssetApi {
  return {
    async listAssets(): Promise<readonly AssetRecord[]> {
      return [];
    },
    async importAsset(): Promise<AssetRecord> {
      throw new Error("not called");
    },
    async getAssetFile(): Promise<Blob> {
      throw new Error("not called");
    },
    async replaceAsset(): Promise<AssetRecord> {
      throw new Error("not called");
    }
  };
}
