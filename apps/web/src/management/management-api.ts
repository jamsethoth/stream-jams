import {
  alertEditorDocumentSchema,
  alertEditorTestResultSchema,
  alertSetActivationImpactSchema,
  alertSetActivationResultSchema,
  alertSetDetailSchema,
  alertSetOverviewSchema,
  assetLibraryItemSchema,
  assetChangeImpactSchema,
  configurationBackupSummarySchema,
  diagnosticsWorkspaceViewSchema,
  homeSetupSummarySchema,
  providerActivationImpactSchema,
  providerActivationResultSchema,
  providerRegistrationAttemptSchema,
  providerValidationResultSchema,
  providerVoiceTestResultSchema,
  registeredProviderDetailSchema,
  registeredProviderViewSchema,
  ttsProviderSafetySettingsSchema,
  type AlertEditorDocument,
  type AlertEditorTestRequest,
  type AlertEditorTestResult,
  type AlertSetActivationImpact,
  type AlertSetActivationResult,
  type AlertSetDetail,
  type AlertSetMutationInput,
  type AlertSetOverview,
  type AssetLibraryItem,
  type AssetChangeImpact,
  type AssetMediaType,
  type AssetMetadataUpdateInput,
  type ConfigurationBackupSummary,
  type DiagnosticsWorkspaceView,
  type HomeSetupSummary,
  type ProviderActivationImpact,
  type ProviderActivationResult,
  type ProviderCapability,
  type ProviderRegistrationAttempt,
  type ProviderSetupInput,
  type ProviderValidationResult,
  type ProviderVoiceTestResult,
  type RegisteredProviderDetail,
  type RegisteredProviderView,
  type TtsProviderSafetySettings
} from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "./management-http-client.js";

export interface DashboardSummary {
  readonly twitch: {
    readonly connected: boolean;
    readonly label: string;
  };
  readonly overlay: {
    readonly connectedClientCount: number;
    readonly label: string;
  };
  readonly queue: {
    readonly label: string;
    readonly queuedCount: number;
  };
  readonly recentErrors: readonly string[];
}

export interface ServerConfigView {
  readonly host: string;
  readonly port: number;
}

export interface ModerationTargetSettingsView {
  readonly maxLength: number;
  readonly blockedTerms: readonly string[];
  readonly stripUrls: boolean;
}

export interface ModerationSettingsView {
  readonly renderedText: ModerationTargetSettingsView;
  readonly ttsText: ModerationTargetSettingsView;
}

export interface ManagementModuleField {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "number" | "boolean";
  readonly required: boolean;
}

export interface ManagementModuleStep {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly ManagementModuleField[];
}

export interface ManagementModuleView {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly config: unknown;
  readonly wizard: {
    readonly steps: readonly ManagementModuleStep[];
  };
}

export interface OverlayOutputUrl {
  readonly id: string;
  readonly label: string;
  readonly purpose: "live" | "test";
  readonly scope: "module" | "unified";
  readonly moduleId: string | null;
  readonly targetProfileId?: "landscape" | "vertical" | null | undefined;
  readonly overlayId: string;
  readonly enabled: boolean;
  readonly keyId: string | null;
  readonly url: string | null;
  readonly copyableUrlStatus: "available" | "create-required" | "regenerate-required";
}

export interface OverlayClientView {
  readonly id: string;
  readonly overlayId: string;
  readonly purpose: "live" | "test";
  readonly scope: "module" | "unified";
  readonly moduleId: string | null;
  readonly targetProfileId?: "landscape" | "vertical" | null | undefined;
  readonly connectedAt: string;
  readonly lastSeenAt: string;
  readonly userAgent: string | null;
}

export interface OverlayOutputKeyRequestView {
  readonly overlayId?: string | undefined;
  readonly purpose: "live" | "test";
  readonly scope: "module" | "unified";
  readonly moduleId: string | null;
  readonly targetProfileId?: "landscape" | "vertical" | null | undefined;
}

export interface OverlayOutputKeyResultView {
  readonly output: OverlayOutputUrl;
  readonly keyId: string;
  readonly url: string;
}

export interface PlaybackItemView {
  readonly id: string;
  readonly label: string;
  readonly status: "queued" | "playing" | "completed" | "skipped";
}

export interface PlaybackView {
  readonly current: PlaybackItemView | null;
  readonly queuedCount: number;
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
  readonly recent: readonly PlaybackItemView[];
}

export type TtsPlaybackModeView = "audio-file" | "remote-trigger" | "browser-speech";

export interface TtsProviderCapabilitiesView {
  readonly supportsVoices: boolean;
  readonly supportsRate: boolean;
  readonly supportsPitch: boolean;
  readonly supportsVolume: boolean;
  readonly playbackMode: TtsPlaybackModeView;
}

export interface TtsVoiceView {
  readonly id: string;
  readonly label: string;
}

export interface TtsProviderView {
  readonly id: string;
  readonly label: string;
  readonly capabilities: TtsProviderCapabilitiesView;
  readonly voices: readonly TtsVoiceView[];
}

export interface TtsTestRequestView {
  readonly providerId: string;
  readonly text: string;
  readonly voiceId?: string | null | undefined;
  readonly rate?: number | null | undefined;
  readonly pitch?: number | null | undefined;
  readonly volume?: number | null | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface TtsPlaybackInstructionView {
  readonly mode: TtsPlaybackModeView;
  readonly text: string;
  readonly audioAssetId: string | null;
  readonly providerPayload: Record<string, unknown> | null;
}

export interface TtsTestResultView {
  readonly instruction: TtsPlaybackInstructionView;
  readonly moderationActions: readonly { readonly type: string }[];
}

export interface TwitchConnectedAccountView {
  readonly accountId: string;
  readonly login: string;
  readonly displayName: string;
  readonly scopes: readonly string[];
  readonly connectedAt: string;
  readonly updatedAt: string;
}

export type TwitchConnectionStatusView =
  | { readonly connected: false; readonly account: null }
  | { readonly connected: true; readonly account: TwitchConnectedAccountView };

export interface TwitchEventSubStatusView {
  readonly state: "idle" | "connecting" | "connected" | "reconnecting" | "degraded" | "error";
  readonly connectionState: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly sessionId: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly subscriptionTypes: readonly string[];
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly lastEventAt: string | null;
  readonly lastErrorAt: string | null;
  readonly message: string | null;
}

export interface DiagnosticsEventLogView {
  readonly id: string;
  readonly eventId: string;
  readonly providerId: string;
  readonly eventType: string;
  readonly actorDisplayName: string;
  readonly status: "received" | "processed" | "failed";
  readonly receivedAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly errorMessage: string | null;
}

export interface DiagnosticsAlertMatchLogView {
  readonly id: string;
  readonly sourceEventId: string;
  readonly ruleId: string;
  readonly variantId: string;
  readonly matchedAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
}

export interface DiagnosticsPlaybackLogView {
  readonly id: string;
  readonly queueItemId: string;
  readonly sourceEventId: string;
  readonly alertIds: readonly string[];
  readonly status: "queued" | "playing" | "completed" | "skipped" | "failed";
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly message: string | null;
}

export interface DiagnosticsProviderErrorView {
  readonly id: string;
  readonly providerId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly message: string;
  readonly correlationId: string | null;
  readonly processingId: string | null;
}

export interface RuntimeLogMetadataView {
  readonly logDirectory: string;
  readonly level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  readonly rollover: "hourly";
  readonly retentionHours: number;
  readonly fileCount: number;
  readonly currentLogFile: string;
  readonly oldestLogFile: string | null;
  readonly newestLogFile: string | null;
}

export interface DiagnosticsView {
  readonly eventLogs: readonly DiagnosticsEventLogView[];
  readonly alertMatchLogs: readonly DiagnosticsAlertMatchLogView[];
  readonly playbackLogs: readonly DiagnosticsPlaybackLogView[];
  readonly providerErrors: readonly DiagnosticsProviderErrorView[];
  readonly runtimeLogging: RuntimeLogMetadataView | null;
}

export interface DiagnosticsExportView extends DiagnosticsView {
  readonly generatedAt: string;
  readonly debugExport: false;
  readonly rawEventLogs: readonly unknown[];
}

export interface DiagnosticsDebugExportView extends DiagnosticsView {
  readonly generatedAt: string;
  readonly debugExport: true;
  readonly rawEventLogs: readonly unknown[];
  readonly runtimeLogEntries: readonly unknown[];
  readonly runtimeLogTruncated: boolean;
}

export interface DiagnosticsRequestView {
  readonly limit?: number | undefined;
}

export interface DiagnosticsDebugExportRequestView extends DiagnosticsRequestView {
  readonly runtimeLogLimit?: number | undefined;
  readonly sinceHours?: number | undefined;
}

export interface TwitchAuthStartRequestView {
  readonly redirectUri: string;
}

export interface TwitchAuthStartResultView {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly scopes: readonly string[];
}

export interface ManagementApi {
  getHomeSetupSummary(): Promise<HomeSetupSummary>;
  listRegisteredProviders(capability: ProviderCapability): Promise<readonly RegisteredProviderView[]>;
  validateProvider(input: ProviderSetupInput): Promise<ProviderValidationResult>;
  registerProvider(input: ProviderSetupInput): Promise<ProviderRegistrationAttempt>;
  getProvider(providerId: string): Promise<RegisteredProviderDetail>;
  activateProvider(providerId: string, confirmWarnings?: boolean): Promise<ProviderActivationResult>;
  getProviderActivationImpact(providerId: string): Promise<ProviderActivationImpact>;
  getTtsProviderSafetySettings(providerId: string): Promise<TtsProviderSafetySettings>;
  updateTtsSafety(providerId: string, input: TtsProviderSafetySettings): Promise<TtsProviderSafetySettings>;
  testProviderVoice(providerId: string): Promise<ProviderVoiceTestResult>;
  listAlertSets(): Promise<readonly AlertSetOverview[]>;
  getAlertSet(setId: string): Promise<AlertSetDetail>;
  createAlertSet(input: AlertSetMutationInput): Promise<AlertSetOverview>;
  renameAlertSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview>;
  duplicateAlertSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview>;
  getAlertSetActivationImpact(setId: string): Promise<AlertSetActivationImpact>;
  activateAlertSet(setId: string, confirmWarnings?: boolean): Promise<AlertSetActivationResult>;
  markStarterAlertSetReviewComplete(setId: string): Promise<AlertSetOverview>;
  setManagedAlertEnabled(alertId: string, enabled: boolean): Promise<AlertSetDetail>;
  deleteAlertSet(setId: string): Promise<void>;
  getAlertEditorDocument(alertId: string): Promise<AlertEditorDocument>;
  saveAlertEditorDocument(alertId: string, document: AlertEditorDocument): Promise<AlertEditorDocument>;
  sendAlertEditorTest(alertId: string, request: AlertEditorTestRequest): Promise<AlertEditorTestResult>;
  listAssetLibraryItems(): Promise<readonly AssetLibraryItem[]>;
  updateAssetMetadata(assetId: string, input: AssetMetadataUpdateInput): Promise<AssetLibraryItem>;
  getAssetChangeImpact(assetId: string, candidateMediaType?: AssetMediaType): Promise<AssetChangeImpact>;
  deleteAsset(assetId: string): Promise<void>;
  getDiagnosticsWorkspace(): Promise<DiagnosticsWorkspaceView>;
  getConfigurationBackupSummary(): Promise<ConfigurationBackupSummary>;
  getDashboard(): Promise<DashboardSummary>;
  getServerConfig(): Promise<ServerConfigView>;
  updateServerConfig(input: ServerConfigView): Promise<ServerConfigView>;
  getModerationSettings(): Promise<ModerationSettingsView>;
  updateModerationSettings(input: ModerationSettingsView): Promise<ModerationSettingsView>;
  listModules(): Promise<readonly ManagementModuleView[]>;
  setModuleEnabled(moduleId: string, enabled: boolean): Promise<unknown>;
  saveModuleConfig(moduleId: string, input: { readonly enabled: boolean; readonly config: unknown }): Promise<unknown>;
  listOverlayOutputs(): Promise<readonly OverlayOutputUrl[]>;
  listOverlayClients(): Promise<readonly OverlayClientView[]>;
  createOverlayOutputKey(input: OverlayOutputKeyRequestView): Promise<OverlayOutputKeyResultView>;
  regenerateOverlayOutputKey(input: OverlayOutputKeyRequestView): Promise<OverlayOutputKeyResultView>;
  revokeOverlayOutputKey(keyId: string): Promise<void>;
  getPlayback(): Promise<PlaybackView>;
  pausePlayback(): Promise<PlaybackView>;
  resumePlayback(): Promise<PlaybackView>;
  skipPlayback(): Promise<PlaybackView>;
  replayRecent(itemId: string): Promise<PlaybackView>;
  mutePlayback(): Promise<PlaybackView>;
  unmutePlayback(): Promise<PlaybackView>;
  setDoNotDisturb(enabled: boolean): Promise<PlaybackView>;
  listTtsProviders(): Promise<readonly TtsProviderView[]>;
  testTts(input: TtsTestRequestView): Promise<TtsTestResultView>;
  getTwitchStatus(): Promise<TwitchConnectionStatusView>;
  getTwitchEventSubStatus(): Promise<TwitchEventSubStatusView>;
  getDiagnostics(input?: DiagnosticsRequestView): Promise<DiagnosticsView>;
  exportDiagnostics(input?: DiagnosticsRequestView): Promise<DiagnosticsExportView>;
  exportDebugDiagnostics(input?: DiagnosticsDebugExportRequestView): Promise<DiagnosticsDebugExportView>;
  startTwitchAuth(input: TwitchAuthStartRequestView): Promise<TwitchAuthStartResultView>;
  refreshTwitchAuth(): Promise<TwitchConnectionStatusView>;
  disconnectTwitch(): Promise<TwitchConnectionStatusView>;
}

export type HttpManagementApiOptions = HttpManagementClientOptions;

interface PlaybackQueueSnapshotResponse {
  readonly current: PlaybackQueueItemResponse | null;
  readonly queued: readonly PlaybackQueueItemResponse[];
  readonly recent: readonly PlaybackQueueItemResponse[];
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
}

interface PlaybackQueueItemResponse {
  readonly id: string;
  readonly status: "queued" | "playing" | "completed" | "skipped";
  readonly alerts: readonly {
    readonly ruleId: string;
    readonly variantId: string;
    readonly overlayInstruction: {
      readonly text: { readonly text: string } | null;
    };
  }[];
}

interface OverlayModuleDefinitionResponse {
  readonly id: string;
  readonly displayName: string;
  readonly wizard: ManagementModuleView["wizard"];
}

interface OverlayModuleConfigResponse {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: unknown;
}

export function createHttpManagementApi(options: HttpManagementApiOptions = {}): ManagementApi {
  const client = createManagementHttpClient(options);

  async function getContract<T>(path: string, contract: RuntimeContract<T>, errorMessage: string): Promise<T> {
    return contract.parse(await client.getJson<unknown>(path, errorMessage));
  }

  async function postContract<T>(
    path: string,
    body: unknown | undefined,
    contract: RuntimeContract<T>,
    errorMessage: string
  ): Promise<T> {
    return contract.parse(await client.postJson<unknown>(path, body, errorMessage));
  }

  async function getContractList<T>(
    path: string,
    contract: RuntimeContract<T>,
    errorMessage: string
  ): Promise<readonly T[]> {
    const response = await client.getJson<unknown>(path, errorMessage);
    if (!Array.isArray(response)) {
      throw new TypeError("Expected a management response array");
    }

    return response.map((item) => contract.parse(item));
  }

  async function getPlayback(): Promise<PlaybackView> {
    return mapPlaybackSnapshot(await client.getJson<PlaybackQueueSnapshotResponse>("/playback", "Unable to load playback."));
  }

  async function postPlayback(path: string, body?: unknown): Promise<PlaybackView> {
    return mapPlaybackSnapshot(await client.postJson<PlaybackQueueSnapshotResponse>(path, body, "Unable to update playback."));
  }

  async function postOverlayOutputKey(
    path: string,
    input: OverlayOutputKeyRequestView
  ): Promise<OverlayOutputKeyResultView> {
    return client.postJson<OverlayOutputKeyResultView>(path, input, "Unable to update overlay output key.");
  }

  function withLimit(path: string, input: DiagnosticsRequestView = {}): string {
    return input.limit === undefined ? path : `${path}?limit=${encodeURIComponent(String(input.limit))}`;
  }

  async function jsonList<T>(path: string): Promise<readonly T[]> {
    return client.getJson<readonly T[]>(path, "Unable to load management data.");
  }

  return {
    getHomeSetupSummary() {
      return getContract("/management/home", homeSetupSummarySchema, "Unable to load Home setup summary.");
    },

    listRegisteredProviders(capability) {
      return getContractList(
        `/management/providers?capability=${encodeURIComponent(capability)}`,
        registeredProviderViewSchema,
        "Unable to load registered providers."
      );
    },

    validateProvider(input) {
      return postContract(
        "/management/providers/validate",
        input,
        providerValidationResultSchema,
        "Unable to validate provider setup."
      );
    },

    registerProvider(input) {
      return postContract(
        "/management/providers",
        input,
        providerRegistrationAttemptSchema,
        "Unable to register provider."
      );
    },

    getProvider(providerId) {
      return getContract(
        `/management/providers/${encodeURIComponent(providerId)}`,
        registeredProviderDetailSchema,
        "Unable to load provider."
      );
    },

    activateProvider(providerId, confirmWarnings = false) {
      return postContract(
        `/management/providers/${encodeURIComponent(providerId)}/activate`,
        { confirmWarnings },
        providerActivationResultSchema,
        "Unable to activate provider."
      );
    },

    getProviderActivationImpact(providerId) {
      return getContract(
        `/management/providers/${encodeURIComponent(providerId)}/activation-impact`,
        providerActivationImpactSchema,
        "Unable to load provider activation impact."
      );
    },

    getTtsProviderSafetySettings(providerId) {
      return getContract(
        `/management/providers/${encodeURIComponent(providerId)}/tts-safety`,
        ttsProviderSafetySettingsSchema,
        "Unable to load TTS provider safety settings."
      );
    },

    async updateTtsSafety(providerId, input) {
      return ttsProviderSafetySettingsSchema.parse(
        await client.putJson<unknown>(
          `/management/providers/${encodeURIComponent(providerId)}/tts-safety`,
          input,
          "Unable to update TTS provider safety settings."
        )
      );
    },

    testProviderVoice(providerId) {
      return postContract(
        `/management/providers/${encodeURIComponent(providerId)}/test-voice`,
        undefined,
        providerVoiceTestResultSchema,
        "Unable to test provider voice."
      );
    },

    listAlertSets() {
      return getContractList("/management/alert-sets", alertSetOverviewSchema, "Unable to load alert sets.");
    },

    getAlertSet(setId) {
      return getContract(
        `/management/alert-sets/${encodeURIComponent(setId)}`,
        alertSetDetailSchema,
        "Unable to load alert set."
      );
    },

    async createAlertSet(input) {
      return alertSetOverviewSchema.parse(
        await client.postJson<unknown>("/management/alert-sets", input, "Unable to create alert set.")
      );
    },

    async renameAlertSet(setId, input) {
      return alertSetOverviewSchema.parse(
        await client.patchJson<unknown>(
          `/management/alert-sets/${encodeURIComponent(setId)}`,
          input,
          "Unable to rename alert set."
        )
      );
    },

    duplicateAlertSet(setId, input) {
      return postContract(
        `/management/alert-sets/${encodeURIComponent(setId)}/duplicate`,
        input,
        alertSetOverviewSchema,
        "Unable to duplicate alert set."
      );
    },

    getAlertSetActivationImpact(setId) {
      return getContract(
        `/management/alert-sets/${encodeURIComponent(setId)}/activation-impact`,
        alertSetActivationImpactSchema,
        "Unable to load alert set activation impact."
      );
    },

    activateAlertSet(setId, confirmWarnings = false) {
      return postContract(
        `/management/alert-sets/${encodeURIComponent(setId)}/activate`,
        { confirmWarnings },
        alertSetActivationResultSchema,
        "Unable to activate alert set."
      );
    },

    markStarterAlertSetReviewComplete(setId) {
      return postContract(
        `/management/alert-sets/${encodeURIComponent(setId)}/starter-review`,
        undefined,
        alertSetOverviewSchema,
        "Unable to complete starter alert review."
      );
    },

    async setManagedAlertEnabled(alertId, enabled) {
      return alertSetDetailSchema.parse(
        await client.patchJson<unknown>(
          `/management/alerts/${encodeURIComponent(alertId)}/enabled`,
          { enabled },
          "Unable to update alert."
        )
      );
    },

    async deleteAlertSet(setId) {
      await client.deleteRequest(`/management/alert-sets/${encodeURIComponent(setId)}`, "Unable to delete alert set.");
    },

    getAlertEditorDocument(alertId) {
      return getContract(
        `/management/alerts/${encodeURIComponent(alertId)}/editor`,
        alertEditorDocumentSchema,
        "Unable to load alert editor document."
      );
    },

    async saveAlertEditorDocument(alertId, document) {
      return alertEditorDocumentSchema.parse(
        await client.putJson<unknown>(
          `/management/alerts/${encodeURIComponent(alertId)}/editor`,
          { document },
          "Unable to save alert editor changes."
        )
      );
    },

    sendAlertEditorTest(alertId, request) {
      return postContract(
        `/management/alerts/${encodeURIComponent(alertId)}/editor/test`,
        request,
        alertEditorTestResultSchema,
        "Unable to send the alert test."
      );
    },

    listAssetLibraryItems() {
      return getContractList(
        "/management/assets/library",
        assetLibraryItemSchema,
        "Unable to load asset library."
      );
    },

    async updateAssetMetadata(assetId, input) {
      return assetLibraryItemSchema.parse(
        await client.patchJson<unknown>(
          `/management/assets/${encodeURIComponent(assetId)}`,
          input,
          "Unable to update asset metadata."
        )
      );
    },

    getAssetChangeImpact(assetId, candidateMediaType) {
      const query = candidateMediaType === undefined
        ? ""
        : `?candidateMediaType=${encodeURIComponent(candidateMediaType)}`;
      return getContract(
        `/management/assets/${encodeURIComponent(assetId)}/change-impact${query}`,
        assetChangeImpactSchema,
        "Unable to load asset change impact."
      );
    },

    async deleteAsset(assetId) {
      await client.deleteRequest(`/management/assets/${encodeURIComponent(assetId)}`, "Unable to delete asset.");
    },

    getDiagnosticsWorkspace() {
      return getContract(
        "/management/diagnostics/workspace",
        diagnosticsWorkspaceViewSchema,
        "Unable to load diagnostics workspace."
      );
    },

    getConfigurationBackupSummary() {
      return getContract(
        "/management/settings/backup-summary",
        configurationBackupSummarySchema,
        "Unable to load backup summary."
      );
    },

    async getDashboard() {
      const [playback, overlayClients] = await Promise.all([getPlayback(), jsonList<OverlayClientView>("/management/overlay-clients")]);
      return {
        twitch: {
          connected: false,
          label: "Twitch disconnected"
        },
        overlay: {
          connectedClientCount: overlayClients.length,
          label: `${overlayClients.length} overlay clients`
        },
        queue: {
          label: playback.paused ? "Queue paused" : playback.current === null ? "Queue idle" : "Queue playing",
          queuedCount: playback.queuedCount
        },
        recentErrors: []
      };
    },

    async getServerConfig() {
      return client.getJson<ServerConfigView>("/config/server", "Unable to load server settings.");
    },

    async updateServerConfig(input: ServerConfigView) {
      return client.patchJson<ServerConfigView>("/config/server", input, "Unable to update server settings.");
    },

    async getModerationSettings() {
      return client.getJson<ModerationSettingsView>("/moderation/settings", "Unable to load moderation settings.");
    },

    async updateModerationSettings(input: ModerationSettingsView) {
      return client.patchJson<ModerationSettingsView>("/moderation/settings", input, "Unable to update moderation settings.");
    },

    async listModules() {
      const modules = await client.getJson<readonly OverlayModuleDefinitionResponse[]>(
        "/overlay-modules",
        "Unable to load overlay modules."
      );
      return Promise.all(
        modules.map(async (moduleDefinition): Promise<ManagementModuleView> => {
          const config = await client.getJson<OverlayModuleConfigResponse>(
            `/overlay-modules/${encodeURIComponent(moduleDefinition.id)}/config`,
            "Unable to load overlay module config."
          );
          return {
            id: moduleDefinition.id,
            displayName: moduleDefinition.displayName,
            enabled: config.enabled,
            config: config.config,
            wizard: moduleDefinition.wizard
          };
        })
      );
    },

    async setModuleEnabled(moduleId: string, enabled: boolean) {
      return client.patchJson<unknown>(
        `/overlay-modules/${encodeURIComponent(moduleId)}/enabled`,
        { enabled },
        "Unable to update overlay module."
      );
    },

    async saveModuleConfig(moduleId: string, input: { readonly enabled: boolean; readonly config: unknown }) {
      return client.putJson<unknown>(
        `/overlay-modules/${encodeURIComponent(moduleId)}/config`,
        input,
        "Unable to save overlay module config."
      );
    },

    listOverlayOutputs() {
      return jsonList<OverlayOutputUrl>("/management/overlay-outputs");
    },

    listOverlayClients() {
      return jsonList<OverlayClientView>("/management/overlay-clients");
    },

    async createOverlayOutputKey(input) {
      return postOverlayOutputKey("/management/overlay-outputs/keys", input);
    },

    async regenerateOverlayOutputKey(input) {
      return postOverlayOutputKey("/management/overlay-outputs/keys/regenerate", input);
    },

    async revokeOverlayOutputKey(keyId) {
      await client.deleteRequest(
        `/management/overlay-outputs/keys/${encodeURIComponent(keyId)}`,
        "Unable to revoke overlay output key."
      );
    },

    async getDiagnostics(input: DiagnosticsRequestView = {}) {
      return client.getJson<DiagnosticsView>(withLimit("/diagnostics", input), "Unable to load diagnostics.");
    },

    async exportDiagnostics(input: DiagnosticsRequestView = {}) {
      return client.getJson<DiagnosticsExportView>(
        withLimit("/diagnostics/export", input),
        "Unable to export diagnostics."
      );
    },

    async exportDebugDiagnostics(input: DiagnosticsDebugExportRequestView = {}) {
      return client.postJson<DiagnosticsDebugExportView>(
        "/diagnostics/export/debug",
        input,
        "Unable to export diagnostics with recent runtime logs."
      );
    },

    async getTwitchStatus() {
      return client.getJson<TwitchConnectionStatusView>("/twitch/auth/status", "Unable to load Twitch status.");
    },

    async getTwitchEventSubStatus() {
      return client.getJson<TwitchEventSubStatusView>(
        "/twitch/eventsub/status",
        "Unable to load Twitch EventSub status."
      );
    },

    async startTwitchAuth(input: TwitchAuthStartRequestView) {
      return client.postJson<TwitchAuthStartResultView>(
        "/twitch/auth/start",
        input,
        "Unable to start Twitch authorization."
      );
    },

    async refreshTwitchAuth() {
      return client.postJson<TwitchConnectionStatusView>(
        "/twitch/auth/refresh",
        undefined,
        "Unable to refresh Twitch connection."
      );
    },

    async disconnectTwitch() {
      return client.postJson<TwitchConnectionStatusView>(
        "/twitch/auth/disconnect",
        undefined,
        "Unable to disconnect Twitch."
      );
    },

    async listTtsProviders() {
      return client.getJson<readonly TtsProviderView[]>("/tts/providers", "Unable to load TTS providers.");
    },

    async testTts(input: TtsTestRequestView) {
      return client.postJson<TtsTestResultView>("/tts/test", input, "Unable to run TTS test.");
    },

    getPlayback,

    pausePlayback() {
      return postPlayback("/playback/pause");
    },

    resumePlayback() {
      return postPlayback("/playback/resume");
    },

    skipPlayback() {
      return postPlayback("/playback/skip");
    },

    replayRecent(itemId: string) {
      return postPlayback("/playback/replay", { itemId });
    },

    mutePlayback() {
      return postPlayback("/playback/mute");
    },

    unmutePlayback() {
      return postPlayback("/playback/unmute");
    },

    setDoNotDisturb(enabled: boolean) {
      return postPlayback("/playback/do-not-disturb", { enabled });
    }
  };
}

interface RuntimeContract<T> {
  parse(input: unknown): T;
}

function mapPlaybackSnapshot(snapshot: PlaybackQueueSnapshotResponse): PlaybackView {
  return {
    current: snapshot.current === null ? null : mapPlaybackItem(snapshot.current),
    queuedCount: snapshot.queued.length,
    paused: snapshot.paused,
    muted: snapshot.muted,
    doNotDisturb: snapshot.doNotDisturb,
    recent: snapshot.recent.map(mapPlaybackItem)
  };
}

function mapPlaybackItem(item: PlaybackQueueItemResponse): PlaybackItemView {
  const firstText = item.alerts[0]?.overlayInstruction.text?.text;
  return {
    id: item.id,
    label: firstText ?? item.alerts[0]?.ruleId ?? item.id,
    status: item.status
  };
}
