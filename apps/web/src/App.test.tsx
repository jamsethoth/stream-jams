import type { AssetRecord } from "./management/assets/asset-api.js";
import type { AlertCollection, AlertRule } from "./management/modules/alerts/alert-api.js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import type { AssetApi } from "./management/assets/AssetManager.js";
import type { ManagementApi } from "./management/management-api.js";

describe("App", () => {
  it("renders the management shell and keeps alerts and assets reachable", async () => {
    const user = userEvent.setup();
    render(<App alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={createManagementApi()} />);

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
  const playback = {
    current: null,
    queuedCount: 0,
    paused: false,
    muted: false,
    doNotDisturb: false,
    recent: []
  };

  return {
    async getHomeSetupSummary() {
      return { readiness: [], activeAlertSet: null, actionableProblems: [] };
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
        secretExclusions: ["Provider credentials", "Overlay route keys"],
        blockers: []
      };
    },
    async getDashboard() {
      return {
        twitch: {
          connected: false,
          label: "Twitch disconnected"
        },
        overlay: {
          connectedClientCount: 0,
          label: "0 overlay clients"
        },
        queue: {
          label: "Queue idle",
          queuedCount: 0
        },
        recentErrors: []
      };
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
    async listModules() {
      return [];
    },
    async setModuleEnabled(moduleId, enabled) {
      return { moduleId, enabled };
    },
    async saveModuleConfig(moduleId, input) {
      return { moduleId, ...input };
    },
    async listOverlayOutputs() {
      return [];
    },
    async listOverlayClients() {
      return [];
    },
    async createOverlayOutputKey() {
      throw new Error("Not implemented in test mock");
    },
    async regenerateOverlayOutputKey() {
      throw new Error("Not implemented in test mock");
    },
    async revokeOverlayOutputKey() {
      return undefined;
    },
    async getPlayback() {
      return playback;
    },
    async pausePlayback() {
      return playback;
    },
    async resumePlayback() {
      return playback;
    },
    async skipPlayback() {
      return playback;
    },
    async replayRecent() {
      return playback;
    },
    async mutePlayback() {
      return playback;
    },
    async unmutePlayback() {
      return playback;
    },
    async setDoNotDisturb(enabled) {
      return { ...playback, doNotDisturb: enabled };
    },
    async listTtsProviders() {
      return [];
    },
    async testTts(input) {
      return {
        instruction: {
          mode: "browser-speech" as const,
          text: input.text,
          audioAssetId: null,
          providerPayload: {
            providerId: input.providerId
          }
        },
        moderationActions: []
      };
    },
    async getDiagnostics() {
      return {
        eventLogs: [],
        alertMatchLogs: [],
        playbackLogs: [],
        providerErrors: [],
        runtimeLogging: null
      };
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
    },
    async getTwitchStatus() {
      return {
        connected: false as const,
        account: null
      };
    },
    async getTwitchEventSubStatus() {
      return {
        state: "idle" as const,
        connectionState: "idle" as const,
        sessionId: null,
        connectedAt: null,
        lastMessageAt: null,
        subscriptionTypes: [],
        acceptedCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        lastEventAt: null,
        lastErrorAt: null,
        message: null
      };
    },
    async startTwitchAuth() {
      return {
        authorizationUrl: "https://id.twitch.tv/oauth2/authorize?state=state-1",
        state: "state-1",
        scopes: ["bits:read"]
      };
    },
    async refreshTwitchAuth() {
      return {
        connected: false as const,
        account: null
      };
    },
    async disconnectTwitch() {
      return {
        connected: false as const,
        account: null
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

function createAlertApi() {
  return {
    async listCollections(): Promise<readonly AlertCollection[]> {
      return [];
    },
    async listRules(): Promise<readonly AlertRule[]> {
      return [];
    },
    async createCollection(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async updateCollection(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async deleteCollection(): Promise<void> {
      throw new Error("not called");
    },
    async createRule(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async updateRule(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async deleteRule(): Promise<void> {
      throw new Error("not called");
    },
    async deleteVariant(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async setCollectionEnabled(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async setRuleEnabled(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async testAlert() {
      throw new Error("not called");
    }
  };
}
