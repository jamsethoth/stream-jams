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
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Alerts" }));
    expect(await screen.findByText("No alert collections configured.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Assets" }));
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
        providerErrors: []
      };
    },
    async exportDiagnostics() {
      return {
        generatedAt: "2026-05-31T02:05:00.000Z",
        rawEventLogs: [],
        eventLogs: [],
        alertMatchLogs: [],
        playbackLogs: [],
        providerErrors: []
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
    async createRule(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async setCollectionEnabled(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async setRuleEnabled(): Promise<AlertRule> {
      throw new Error("not called");
    }
  };
}
