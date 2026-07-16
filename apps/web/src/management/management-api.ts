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
  configurationBackupArchiveSchema,
  configurationRestorePreflightSchema,
  configurationRestoreResultSchema,
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
  type ConfigurationBackupArchive,
  type ConfigurationRestorePreflight,
  type ConfigurationRestoreRequest,
  type ConfigurationRestoreResult,
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

export interface TwitchAuthStartResultView {
  readonly authorizationId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
  readonly scopes: readonly string[];
}

export type TwitchAuthPollResultView =
  | { readonly status: "pending" }
  | { readonly status: "connected"; readonly connection: Extract<TwitchConnectionStatusView, { readonly connected: true }> }
  | { readonly status: "failed"; readonly code: "TWITCH_OAUTH_DENIED" | "TWITCH_OAUTH_EXPIRED"; readonly message: string };

export interface ManagementApi {
  getHomeSetupSummary(): Promise<HomeSetupSummary>;
  getTwitchStatus(): Promise<TwitchConnectionStatusView>;
  startTwitchAuth(): Promise<TwitchAuthStartResultView>;
  pollTwitchAuth(input: { readonly authorizationId: string }): Promise<TwitchAuthPollResultView>;
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
  saveAlertEditorDocument(
    alertId: string,
    document: AlertEditorDocument,
    confirmLiveImpact?: boolean
  ): Promise<AlertEditorDocument>;
  sendAlertEditorTest(alertId: string, request: AlertEditorTestRequest): Promise<AlertEditorTestResult>;
  listAssetLibraryItems(): Promise<readonly AssetLibraryItem[]>;
  updateAssetMetadata(assetId: string, input: AssetMetadataUpdateInput): Promise<AssetLibraryItem>;
  getAssetChangeImpact(assetId: string, candidateMediaType?: AssetMediaType): Promise<AssetChangeImpact>;
  deleteAsset(assetId: string): Promise<void>;
  getDiagnosticsWorkspace(): Promise<DiagnosticsWorkspaceView>;
  getConfigurationBackupSummary(): Promise<ConfigurationBackupSummary>;
  exportConfigurationBackup(): Promise<ConfigurationBackupArchive>;
  preflightConfigurationRestore(archive: ConfigurationBackupArchive): Promise<ConfigurationRestorePreflight>;
  restoreConfiguration(input: ConfigurationRestoreRequest): Promise<ConfigurationRestoreResult>;
  getServerConfig(): Promise<ServerConfigView>;
  updateServerConfig(input: ServerConfigView): Promise<ServerConfigView>;
  getModerationSettings(): Promise<ModerationSettingsView>;
  updateModerationSettings(input: ModerationSettingsView): Promise<ModerationSettingsView>;
  createOverlayOutputKey(input: OverlayOutputKeyRequestView): Promise<OverlayOutputKeyResultView>;
  regenerateOverlayOutputKey(input: OverlayOutputKeyRequestView): Promise<OverlayOutputKeyResultView>;
  exportDiagnostics(input?: DiagnosticsRequestView): Promise<DiagnosticsExportView>;
  exportDebugDiagnostics(input?: DiagnosticsDebugExportRequestView): Promise<DiagnosticsDebugExportView>;
}

export type HttpManagementApiOptions = HttpManagementClientOptions;

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

  async function postOverlayOutputKey(
    path: string,
    input: OverlayOutputKeyRequestView
  ): Promise<OverlayOutputKeyResultView> {
    return client.postJson<OverlayOutputKeyResultView>(path, input, "Unable to update overlay output key.");
  }

  function withLimit(path: string, input: DiagnosticsRequestView = {}): string {
    return input.limit === undefined ? path : `${path}?limit=${encodeURIComponent(String(input.limit))}`;
  }

  return {
    getHomeSetupSummary() {
      return getContract("/management/home", homeSetupSummarySchema, "Unable to load Home setup summary.");
    },

    getTwitchStatus() {
      return getContract(
        "/twitch/auth/status",
        twitchConnectionStatusContract,
        "Unable to load Twitch connection status."
      );
    },

    startTwitchAuth() {
      return postContract(
        "/twitch/auth/start",
        undefined,
        twitchAuthStartResultContract,
        "Unable to start Twitch authorization."
      );
    },

    pollTwitchAuth(input) {
      return postContract(
        "/twitch/auth/poll",
        { authorizationId: input.authorizationId },
        twitchAuthPollResultContract,
        "Unable to continue Twitch authorization."
      );
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

    async saveAlertEditorDocument(alertId, document, confirmLiveImpact = false) {
      return alertEditorDocumentSchema.parse(
        await client.putJson<unknown>(
          `/management/alerts/${encodeURIComponent(alertId)}/editor`,
          { document, confirmLiveImpact },
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

    exportConfigurationBackup() {
      return getContract(
        "/management/settings/backup",
        configurationBackupArchiveSchema,
        "Unable to export configuration backup."
      );
    },

    preflightConfigurationRestore(archive) {
      return postContract(
        "/management/settings/backup/preflight",
        archive,
        configurationRestorePreflightSchema,
        "Unable to validate configuration backup."
      );
    },

    restoreConfiguration(input) {
      return postContract(
        "/management/settings/backup/restore",
        input,
        configurationRestoreResultSchema,
        "Unable to restore configuration backup."
      );
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

    async createOverlayOutputKey(input) {
      return postOverlayOutputKey("/management/overlay-outputs/keys", input);
    },

    async regenerateOverlayOutputKey(input) {
      return postOverlayOutputKey("/management/overlay-outputs/keys/regenerate", input);
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
    }
  };
}

interface RuntimeContract<T> {
  parse(input: unknown): T;
}

const twitchConnectionStatusContract: RuntimeContract<TwitchConnectionStatusView> = {
  parse(input) {
    if (!isRecord(input) || typeof input.connected !== "boolean") {
      throw new TypeError("Invalid Twitch connection status response");
    }
    if (!input.connected) {
      if (input.account !== null) throw new TypeError("Invalid Twitch connection status response");
      return { connected: false, account: null };
    }
    if (!isRecord(input.account)) throw new TypeError("Invalid Twitch connection status response");
    const account = input.account;
    if (
      !isNonEmptyString(account.accountId)
      || !isNonEmptyString(account.login)
      || !isNonEmptyString(account.displayName)
      || !isStringArray(account.scopes)
      || !isTimestamp(account.connectedAt)
      || !isTimestamp(account.updatedAt)
    ) {
      throw new TypeError("Invalid Twitch connection status response");
    }
    return {
      connected: true,
      account: {
        accountId: account.accountId,
        login: account.login,
        displayName: account.displayName,
        scopes: [...account.scopes],
        connectedAt: account.connectedAt,
        updatedAt: account.updatedAt
      }
    };
  }
};

const twitchAuthStartResultContract: RuntimeContract<TwitchAuthStartResultView> = {
  parse(input) {
    if (
      !hasExactKeys(input, ["authorizationId", "verificationUri", "userCode", "expiresAt", "intervalSeconds", "scopes"])
      || !isNonEmptyString(input.authorizationId)
      || !isNonEmptyString(input.verificationUri)
      || !isNonEmptyString(input.userCode)
      || !isTimestamp(input.expiresAt)
      || !isPositiveInteger(input.intervalSeconds)
      || !isStringArray(input.scopes)
    ) {
      throw new TypeError("Invalid Twitch authorization response");
    }
    let verificationUri: URL;
    try {
      verificationUri = new URL(input.verificationUri);
    } catch {
      throw new TypeError("Invalid Twitch authorization response");
    }
    if (
      verificationUri.protocol !== "https:"
      || verificationUri.hostname !== "www.twitch.tv"
      || verificationUri.pathname !== "/activate"
      || verificationUri.search !== ""
      || verificationUri.hash !== ""
      || verificationUri.username !== ""
      || verificationUri.password !== ""
    ) {
      throw new TypeError("Invalid Twitch authorization response");
    }
    return {
      authorizationId: input.authorizationId,
      verificationUri: verificationUri.toString(),
      userCode: input.userCode,
      expiresAt: input.expiresAt,
      intervalSeconds: input.intervalSeconds,
      scopes: [...input.scopes]
    };
  }
};

const twitchAuthPollResultContract: RuntimeContract<TwitchAuthPollResultView> = {
  parse(input) {
    if (!isRecord(input) || !isNonEmptyString(input.status)) {
      throw new TypeError("Invalid Twitch authorization response");
    }
    if (input.status === "pending") {
      if (!hasExactKeys(input, ["status"])) throw new TypeError("Invalid Twitch authorization response");
      return { status: "pending" };
    }
    if (input.status === "connected") {
      if (!hasExactKeys(input, ["status", "connection"])) throw new TypeError("Invalid Twitch authorization response");
      const connection = twitchConnectionStatusContract.parse(input.connection);
      if (!connection.connected) throw new TypeError("Invalid Twitch authorization response");
      return { status: "connected", connection };
    }
    if (
      input.status === "failed"
      && hasExactKeys(input, ["status", "code", "message"])
      && (input.code === "TWITCH_OAUTH_DENIED" || input.code === "TWITCH_OAUTH_EXPIRED")
      && isNonEmptyString(input.message)
    ) {
      return { status: "failed", code: input.code, message: input.message };
    }
    throw new TypeError("Invalid Twitch authorization response");
  }
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasExactKeys(input: unknown, keys: readonly string[]): input is Record<string, unknown> {
  return isRecord(input)
    && Object.keys(input).length === keys.length
    && keys.every((key) => Object.hasOwn(input, key));
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function isTimestamp(input: unknown): input is string {
  return typeof input === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)
    && !Number.isNaN(Date.parse(input))
    && new Date(input).toISOString() === input;
}

function isPositiveInteger(input: unknown): input is number {
  return typeof input === "number" && Number.isInteger(input) && input > 0;
}
