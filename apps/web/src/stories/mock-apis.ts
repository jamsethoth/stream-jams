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
  storyAssetLibraryItems,
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
      throw new Error("No provider registration configured for this story.");
    },
    async getProvider() {
      throw new Error("No provider detail configured for this story.");
    },
    async activateProvider() {
      throw new Error("No provider activation configured for this story.");
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
      throw new Error("No alert set detail configured for this story.");
    },
    async createAlertSet(input) {
      return emptyAlertSet("set-story", input.name);
    },
    async renameAlertSet(setId, input) {
      return emptyAlertSet(setId, input.name);
    },
    async duplicateAlertSet(_setId, input) {
      return emptyAlertSet("set-story-copy", input.name);
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
      throw new Error("No alert set activation configured for this story.");
    },
    async markStarterAlertSetReviewComplete() {
      throw new Error("No starter alert set configured for this story.");
    },
    async setManagedAlertEnabled() {
      throw new Error("No managed alert configured for this story.");
    },
    async deleteAlertSet() {
      return undefined;
    },
    async getAlertEditorDocument() {
      throw new Error("No alert editor document configured for this story.");
    },
    async saveAlertEditorDocument(_alertId, document) {
      return document;
    },
    async sendAlertEditorTest(_alertId, request) {
      return { status: "queued", targetProfileId: request.targetProfileId, referenceId: "ref-story-test", test: true };
    },
    async listAssetLibraryItems() {
      return storyAssetLibraryItems;
    },
    async updateAssetMetadata(assetId, input) {
      const item = storyAssetLibraryItems.find((candidate) => candidate.id === assetId) ?? storyAssetLibraryItems[0]!;
      return { ...item, displayName: input.displayName, tags: input.tags, updatedAt: "2026-06-19T16:02:00.000Z" };
    },
    async getAssetChangeImpact(assetId, candidateMediaType) {
      const item = storyAssetLibraryItems.find((candidate) => candidate.id === assetId) ?? storyAssetLibraryItems[0]!;
      const warnings = item.usage.totalUsageCount > 0 ? [`${item.usage.totalUsageCount} alert usage will update everywhere.`] : [];
      if (candidateMediaType !== undefined && candidateMediaType !== item.mediaType) warnings.push(`Media type changes from ${item.mediaType} to ${candidateMediaType}.`);
      return { assetId, usage: item.usage, canDelete: item.usage.totalUsageCount === 0, requiresConfirmation: warnings.length > 0, warnings };
    },
    async deleteAsset() {
      return undefined;
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
    async getAssetFile(assetId) {
      const asset = storyAssets.find((candidate) => candidate.id === assetId) ?? storyAssets[0]!;
      if (asset.mediaType === "audio") {
        return new Blob([silentWavBytes], { type: "audio/wav" });
      }
      const response = await fetch(`/${asset.storagePath}`);
      if (!response.ok) throw new Error(`Story asset ${asset.storagePath} could not be loaded.`);
      return response.blob();
    },
    async replaceAsset(assetId, file) {
      return {
        id: assetId,
        originalFileName: file.name,
        mediaType: file.type.startsWith("audio/") ? "audio" : "image",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        checksum: "sha256:replacement-story",
        storagePath: `storybook-assets/${file.name}`
      } satisfies AssetRecord;
    },
    ...overrides
  } satisfies AssetApi;

  return api;
}

const silentWavBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00,
  0x64, 0x61, 0x74, 0x61, 0x02, 0x00, 0x00, 0x00, 0x80, 0x80
]);

function emptyAlertSet(id: string, name: string) {
  return {
    id,
    name,
    active: false,
    starter: false,
    starterReviewState: "complete" as const,
    enabledAlertCount: 0,
    targetProfiles: [
      { id: "landscape" as const, enabled: true, reviewState: "ready" as const, blockerCount: 0, warningCount: 0 },
      { id: "vertical" as const, enabled: false, reviewState: "needs-review" as const, blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
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
