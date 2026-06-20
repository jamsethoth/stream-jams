import type {
  ManagementApi,
  OverlayOutputKeyRequestView,
  OverlayOutputKeyResultView
} from "../management/management-api.js";
import type { AssetApi, AssetRecord } from "../management/assets/asset-api.js";
import type { AlertConfigurationApi } from "../management/modules/alerts/alert-api.js";
import {
  liveAlertsOutput,
  storyAlertCollections,
  storyAlertRules,
  storyAssets,
  storyDashboardSummary,
  storyDiagnostics,
  storyFollowEvent,
  storyModerationSettings,
  storyModules,
  storyOverlayClients,
  storyOverlayOutputs,
  storyPlayback,
  storyServerConfig,
  storyTtsProviders,
  storyTwitchEventSubStatus,
  storyTwitchStatus
} from "./story-fixtures.js";

export function createStoryManagementApi(overrides: Partial<ManagementApi> = {}): ManagementApi {
  const api = {
    async getDashboard() {
      return storyDashboardSummary;
    },
    async getServerConfig() {
      return storyServerConfig;
    },
    async updateServerConfig(input) {
      return input;
    },
    async getModerationSettings() {
      return storyModerationSettings;
    },
    async updateModerationSettings(input) {
      return input;
    },
    async listModules() {
      return storyModules;
    },
    async setModuleEnabled() {
      return {};
    },
    async saveModuleConfig() {
      return {};
    },
    async listOverlayOutputs() {
      return storyOverlayOutputs;
    },
    async listOverlayClients() {
      return storyOverlayClients;
    },
    async createOverlayOutputKey(input) {
      return overlayKeyResult(input);
    },
    async regenerateOverlayOutputKey(input) {
      return overlayKeyResult(input);
    },
    async revokeOverlayOutputKey() {
      return undefined;
    },
    async getPlayback() {
      return storyPlayback;
    },
    async pausePlayback() {
      return { ...storyPlayback, paused: true };
    },
    async resumePlayback() {
      return { ...storyPlayback, paused: false };
    },
    async skipPlayback() {
      return { ...storyPlayback, current: null, queuedCount: 1 };
    },
    async replayRecent() {
      return { ...storyPlayback, queuedCount: storyPlayback.queuedCount + 1 };
    },
    async mutePlayback() {
      return { ...storyPlayback, muted: true };
    },
    async unmutePlayback() {
      return { ...storyPlayback, muted: false };
    },
    async setDoNotDisturb(enabled) {
      return { ...storyPlayback, doNotDisturb: enabled };
    },
    async listTtsProviders() {
      return storyTtsProviders;
    },
    async testTts(input) {
      return {
        instruction: {
          mode: "remote-trigger",
          text: input.text,
          audioAssetId: null,
          providerPayload: {
            providerId: input.providerId
          }
        },
        moderationActions: []
      };
    },
    async getTwitchStatus() {
      return storyTwitchStatus;
    },
    async getTwitchEventSubStatus() {
      return storyTwitchEventSubStatus;
    },
    async getDiagnostics() {
      return storyDiagnostics;
    },
    async exportDiagnostics() {
      return {
        ...storyDiagnostics,
        generatedAt: "2026-06-19T16:01:00.000Z",
        debugExport: false,
        rawEventLogs: []
      };
    },
    async exportDebugDiagnostics() {
      return {
        ...storyDiagnostics,
        generatedAt: "2026-06-19T16:01:00.000Z",
        debugExport: true,
        rawEventLogs: [],
        runtimeLogEntries: [],
        runtimeLogTruncated: false
      };
    },
    async startTwitchAuth(input) {
      return {
        authorizationUrl: `https://id.twitch.tv/oauth2/authorize?redirect_uri=${encodeURIComponent(input.redirectUri)}`,
        state: "state-story",
        scopes: ["channel:read:redemptions", "bits:read"]
      };
    },
    async refreshTwitchAuth() {
      return storyTwitchStatus;
    },
    async disconnectTwitch() {
      return {
        connected: false,
        account: null
      };
    },
    ...overrides
  } satisfies ManagementApi;

  return api;
}

export function createStoryAssetApi(overrides: Partial<AssetApi> = {}): AssetApi {
  const api = {
    async listAssets() {
      return storyAssets;
    },
    async importAsset(file) {
      return {
        id: "asset-imported-story",
        originalFileName: file.name,
        mediaType: file.type.startsWith("audio/") ? "audio" : "image",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        checksum: "sha256:imported-story",
        storagePath: `storybook-assets/${file.name}`
      } satisfies AssetRecord;
    },
    ...overrides
  } satisfies AssetApi;

  return api;
}

export function createStoryAlertApi(overrides: Partial<AlertConfigurationApi> = {}): AlertConfigurationApi {
  const api = {
    async listCollections() {
      return storyAlertCollections;
    },
    async listRules() {
      return storyAlertRules;
    },
    async createCollection(input) {
      return {
        id: "collection-new-story",
        name: input.name,
        enabled: input.enabled ?? true
      };
    },
    async updateCollection(collectionId, input) {
      return {
        id: collectionId,
        ...input
      };
    },
    async deleteCollection() {
      return undefined;
    },
    async createRule(input) {
      return {
        id: "rule-new-story",
        ...input,
        variants: input.variants.map((variant, index) => ({
          id: `variant-new-story-${index + 1}`,
          ...variant
        }))
      };
    },
    async updateRule(ruleId, input) {
      return {
        id: ruleId,
        ...input
      };
    },
    async deleteRule() {
      return undefined;
    },
    async deleteVariant(ruleId) {
      const rule = storyAlertRules.find((candidate) => candidate.id === ruleId) ?? storyAlertRules[0];
      if (rule === undefined) {
        throw new Error("No story alert rule available.");
      }

      return {
        ...rule,
        variants: rule.variants.slice(0, 1)
      };
    },
    async setCollectionEnabled(collectionId, enabled) {
      return {
        id: collectionId,
        name: "Updated collection",
        enabled
      };
    },
    async setRuleEnabled(ruleId, enabled) {
      const rule = storyAlertRules.find((candidate) => candidate.id === ruleId) ?? storyAlertRules[0];
      if (rule === undefined) {
        throw new Error("No story alert rule available.");
      }

      return {
        ...rule,
        enabled
      };
    },
    async testAlert() {
      return {
        status: "queued",
        matchedRuleIds: ["rule-follow"],
        enqueuedAlertIds: [storyFollowEvent.id]
      };
    },
    ...overrides
  } satisfies AlertConfigurationApi;

  return api;
}

function overlayKeyResult(input: OverlayOutputKeyRequestView): OverlayOutputKeyResultView {
  return {
    output: {
      ...liveAlertsOutput,
      overlayId: input.overlayId ?? liveAlertsOutput.overlayId,
      purpose: input.purpose,
      scope: input.scope,
      moduleId: input.moduleId,
      keyId: "key-story-generated",
      url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_story_generated",
      copyableUrlStatus: "available" as const
    },
    keyId: "key-story-generated",
    url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_story_generated"
  };
}
