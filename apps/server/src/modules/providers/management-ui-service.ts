import {
  homeSetupSummarySchema,
  type AlertCreateInput,
  type AlertEditorDocument,
  type AlertEditorErrorReportInput,
  type AlertEditorErrorReportResult,
  type AlertEditorTestRequest,
  type AlertEditorTestResult,
  type AlertSetActivationImpact,
  type AlertSetActivationResult,
  type AlertSetDetail,
  type AlertInventoryRow,
  type AlertVariationCreateInput,
  type AlertVariationAuthoringContext,
  type AlertVariationPriorityAssignment,
  type AlertSetMutationInput,
  type AlertSetOverview,
  type AssetLibraryItem,
  type AssetChangeImpact,
  type AssetMediaType,
  type AssetMetadataUpdateInput,
  type ConfigurationBackupSummary,
  type ClearOldLogsResult,
  type DiagnosticsWorkspaceView,
  type HomeSetupSummary,
  type OpenDataFolderResult,
  type ProviderActivationImpact,
  type ProviderActivationResult,
  type ProviderCapability,
  type ProviderLiveStatus,
  type ProviderRegistrationAttempt,
  type ProviderSetupInput,
  type ProviderValidationResult,
  type ProviderVoiceTestResult,
  type RegisteredProviderDetail,
  type RegisteredProviderView,
  type TtsProviderSafetySettings
} from "@stream-jams/core";
import type { ProviderManagementService } from "./provider-management-service.js";
import type { AlertSetManagementService } from "../alerts/alert-set-management-service.js";
import type { TwitchConnectionStatus } from "../twitch/twitch-account-repository.js";

type HomeReadinessItem = HomeSetupSummary["readiness"][number];

type ProviderService = Pick<
  ProviderManagementService,
  | "listProviders"
  | "getProvider"
  | "validateProvider"
  | "registerProvider"
  | "activateProvider"
  | "deactivateProvider"
  | "getActivationImpact"
  | "getTtsSafety"
  | "updateTtsSafety"
  | "testVoice"
>;

type AlertSetService = Pick<
  AlertSetManagementService,
  | "listSets"
  | "getSet"
  | "createSet"
  | "createAlert"
  | "createAlertVariation"
  | "duplicateManagedAlert"
  | "resetManagedAlert"
  | "deleteManagedAlert"
  | "renameSet"
  | "duplicateSet"
  | "getActivationImpact"
  | "activateSet"
  | "markStarterReviewComplete"
  | "setAlertEnabled"
  | "deleteSet"
>;

export interface ManagementUiServiceOptions {
  readonly providerService: ProviderService;
  readonly alertSetService: AlertSetService;
  readonly getEventSourceRuntimeView: (provider: RegisteredProviderView) => EventSourceRuntimeView;
  readonly getTwitchAuthorization: () => Promise<TwitchConnectionStatus>;
  readonly hasBrowserOutput: () => Promise<boolean>;
  readonly getAlertEditorDocument: (alertId: string) => Promise<AlertEditorDocument>;
  readonly getAlertVariationAuthoringContext: (alertId: string) => Promise<AlertVariationAuthoringContext>;
  readonly saveAlertEditorDocument: (
    alertId: string,
    document: AlertEditorDocument,
    confirmLiveImpact: boolean,
    priorityAssignments: readonly AlertVariationPriorityAssignment[]
  ) => Promise<AlertEditorDocument>;
  readonly sendAlertEditorTest: (alertId: string, request: AlertEditorTestRequest) => Promise<AlertEditorTestResult>;
  readonly reportAlertEditorError: (alertId: string, input: AlertEditorErrorReportInput) => Promise<AlertEditorErrorReportResult>;
  readonly listAssetLibraryItems: () => Promise<readonly AssetLibraryItem[]>;
  readonly updateAssetMetadata: (assetId: string, input: AssetMetadataUpdateInput) => Promise<AssetLibraryItem>;
  readonly getAssetChangeImpact: (assetId: string, candidateMediaType?: AssetMediaType) => Promise<AssetChangeImpact>;
  readonly deleteAsset: (assetId: string) => Promise<void>;
  readonly getDiagnosticsWorkspace: () => Promise<DiagnosticsWorkspaceView>;
  readonly getConfigurationBackupSummary: () => Promise<ConfigurationBackupSummary>;
  readonly openDataFolder?: () => Promise<OpenDataFolderResult>;
  readonly clearOldLogs?: () => Promise<ClearOldLogsResult>;
}

export interface EventSourceRuntimeView {
  readonly liveStatus: ProviderLiveStatus;
  readonly error: RegisteredProviderView["error"];
}

export class ManagementUiService {
  readonly #options: ManagementUiServiceOptions;

  constructor(options: ManagementUiServiceOptions) {
    this.#options = options;
  }

  async getHomeSetupSummary(): Promise<HomeSetupSummary> {
    const [eventSources, ttsProviders, alertSets, hasBrowserOutput] = await Promise.all([
      this.listRegisteredProviders("event-source"),
      this.#options.providerService.listProviders("tts"),
      this.#options.alertSetService.listSets(),
      this.#options.hasBrowserOutput()
    ]);
    const activeAlertSet = alertSets.find((set) => set.active) ?? null;
    const activeEventSource = eventSources.find((provider) => provider.active) ?? null;
    const activeTtsProvider = ttsProviders.find((provider) => provider.active) ?? null;

    return homeSetupSummarySchema.parse({
      readiness: [
        eventSourceReadiness(activeEventSource),
        ttsReadiness(activeTtsProvider),
        alertSetReadiness(activeAlertSet),
        setupItem(
          "browser-output",
          "Browser-source output",
          hasBrowserOutput ? "complete" : "action-required",
          hasBrowserOutput ? "Review output" : "Create output",
          "/manage/modules/alerts#browser-sources"
        )
      ],
      activeAlertSet,
      actionableProblems: [...eventSources, ...ttsProviders]
        .map((provider) => provider.error)
        .filter((error) => error !== null)
    });
  }

  async listRegisteredProviders(capability: ProviderCapability): Promise<readonly RegisteredProviderView[]> {
    const providers = await this.#options.providerService.listProviders(capability);
    return capability === "event-source"
      ? Promise.all(providers.map((provider) => this.#withLiveStatus(provider)))
      : providers;
  }

  async getRegisteredProvider(providerId: string): Promise<RegisteredProviderDetail> {
    const detail = await this.#options.providerService.getProvider(providerId);
    return detail.provider.capability === "event-source"
      ? { ...detail, provider: await this.#withLiveStatus(detail.provider) }
      : detail;
  }

  validateProviderSetup(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    return this.#options.providerService.validateProvider(input);
  }

  registerProvider(input: ProviderSetupInput): Promise<ProviderRegistrationAttempt> {
    return this.#options.providerService.registerProvider(input);
  }

  activateProvider(providerId: string, confirmWarnings: boolean): Promise<ProviderActivationResult> {
    return this.#options.providerService.activateProvider(providerId, confirmWarnings);
  }

  deactivateProvider(providerId: string): Promise<RegisteredProviderView> {
    return this.#options.providerService.deactivateProvider(providerId);
  }

  getProviderActivationImpact(providerId: string): Promise<ProviderActivationImpact> {
    return this.#options.providerService.getActivationImpact(providerId);
  }

  getTtsProviderSafetySettings(providerId: string): Promise<TtsProviderSafetySettings> {
    return this.#options.providerService.getTtsSafety(providerId);
  }

  updateTtsProviderSafetySettings(
    providerId: string,
    settings: TtsProviderSafetySettings
  ): Promise<TtsProviderSafetySettings> {
    return this.#options.providerService.updateTtsSafety(providerId, settings);
  }

  testProviderVoice(providerId: string): Promise<ProviderVoiceTestResult> {
    return this.#options.providerService.testVoice(providerId, "Stream Jams voice test. Your text to speech provider is ready.");
  }

  listAlertSets(): Promise<readonly AlertSetOverview[]> {
    return this.#options.alertSetService.listSets();
  }

  getAlertSet(setId: string): Promise<AlertSetDetail> {
    return this.#options.alertSetService.getSet(setId);
  }

  createAlertSet(input: AlertSetMutationInput): Promise<AlertSetOverview> {
    return this.#options.alertSetService.createSet(input);
  }

  createAlert(setId: string, input: AlertCreateInput): Promise<AlertInventoryRow> {
    return this.#options.alertSetService.createAlert(setId, input);
  }

  createAlertVariation(alertId: string, input: AlertVariationCreateInput): Promise<AlertInventoryRow> {
    return this.#options.alertSetService.createAlertVariation(alertId, input);
  }

  duplicateManagedAlert(alertId: string): Promise<AlertInventoryRow> {
    return this.#options.alertSetService.duplicateManagedAlert(alertId);
  }

  resetManagedAlert(alertId: string, confirmLiveImpact: boolean): Promise<AlertInventoryRow> {
    return this.#options.alertSetService.resetManagedAlert(alertId, confirmLiveImpact);
  }

  deleteManagedAlert(alertId: string, confirmLiveImpact: boolean): Promise<void> {
    return this.#options.alertSetService.deleteManagedAlert(alertId, confirmLiveImpact);
  }

  renameAlertSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview> {
    return this.#options.alertSetService.renameSet(setId, input);
  }

  duplicateAlertSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview> {
    return this.#options.alertSetService.duplicateSet(setId, input);
  }

  getAlertSetActivationImpact(setId: string): Promise<AlertSetActivationImpact> {
    return this.#options.alertSetService.getActivationImpact(setId);
  }

  activateAlertSet(setId: string, confirmWarnings: boolean): Promise<AlertSetActivationResult> {
    return this.#options.alertSetService.activateSet(setId, confirmWarnings);
  }

  markStarterAlertSetReviewComplete(setId: string): Promise<AlertSetOverview> {
    return this.#options.alertSetService.markStarterReviewComplete(setId);
  }

  setManagedAlertEnabled(alertId: string, enabled: boolean): Promise<AlertSetDetail> {
    return this.#options.alertSetService.setAlertEnabled(alertId, enabled);
  }

  deleteAlertSet(setId: string): Promise<void> {
    return this.#options.alertSetService.deleteSet(setId);
  }

  getAlertEditorDocument(alertId: string): Promise<AlertEditorDocument> {
    return this.#options.getAlertEditorDocument(alertId);
  }

  getAlertVariationAuthoringContext(alertId: string): Promise<AlertVariationAuthoringContext> {
    return this.#options.getAlertVariationAuthoringContext(alertId);
  }

  saveAlertEditorDocument(
    alertId: string,
    document: AlertEditorDocument,
    confirmLiveImpact: boolean,
    priorityAssignments: readonly AlertVariationPriorityAssignment[] = []
  ): Promise<AlertEditorDocument> {
    return this.#options.saveAlertEditorDocument(alertId, document, confirmLiveImpact, priorityAssignments);
  }

  sendAlertEditorTest(alertId: string, request: AlertEditorTestRequest): Promise<AlertEditorTestResult> {
    return this.#options.sendAlertEditorTest(alertId, request);
  }

  listAssetLibraryItems(): Promise<readonly AssetLibraryItem[]> {
    return this.#options.listAssetLibraryItems();
  }

  updateAssetMetadata(assetId: string, input: AssetMetadataUpdateInput): Promise<AssetLibraryItem> {
    return this.#options.updateAssetMetadata(assetId, input);
  }

  getAssetChangeImpact(assetId: string, candidateMediaType?: AssetMediaType): Promise<AssetChangeImpact> {
    return this.#options.getAssetChangeImpact(assetId, candidateMediaType);
  }

  deleteAsset(assetId: string): Promise<void> {
    return this.#options.deleteAsset(assetId);
  }

  getDiagnosticsWorkspace(): Promise<DiagnosticsWorkspaceView> {
    return this.#options.getDiagnosticsWorkspace();
  }

  reportAlertEditorError(alertId: string, input: AlertEditorErrorReportInput): Promise<AlertEditorErrorReportResult> {
    return this.#options.reportAlertEditorError(alertId, input);
  }

  getConfigurationBackupSummary(): Promise<ConfigurationBackupSummary> {
    return this.#options.getConfigurationBackupSummary();
  }

  openDataFolder(): Promise<OpenDataFolderResult> {
    const openDataFolder = this.#options.openDataFolder;
    return openDataFolder === undefined
      ? Promise.reject(new Error("Local data-folder maintenance is unavailable."))
      : openDataFolder();
  }

  clearOldLogs(): Promise<ClearOldLogsResult> {
    const clearOldLogs = this.#options.clearOldLogs;
    return clearOldLogs === undefined
      ? Promise.reject(new Error("Local log maintenance is unavailable."))
      : clearOldLogs();
  }

  async #withLiveStatus(provider: RegisteredProviderView): Promise<RegisteredProviderView> {
    const runtime = this.#options.getEventSourceRuntimeView(provider);
    const twitchAuthorizationStatus = provider.kind === "twitch"
      ? await this.#options.getTwitchAuthorization()
      : undefined;
    return {
      ...provider,
      ...(twitchAuthorizationStatus === undefined ? {} : { twitchAuthorization: toTwitchAuthorizationView(twitchAuthorizationStatus) }),
      liveStatus: runtime.liveStatus,
      error: runtime.error ?? provider.error
    };
  }
}

function toTwitchAuthorizationView(status: TwitchConnectionStatus) {
  if (!status.connected) {
    return { authorizationState: "disconnected" as const, missingScopes: [], account: null };
  }
  return {
    authorizationState: status.authorizationState,
    missingScopes: [...status.missingScopes],
    account: {
      accountId: status.account.accountId,
      login: status.account.login,
      displayName: status.account.displayName,
      scopes: [...status.account.scopes],
      connectedAt: status.account.connectedAt,
      updatedAt: status.account.updatedAt
    }
  };
}

function eventSourceReadiness(provider: RegisteredProviderView | null): HomeReadinessItem {
  if (provider === null) {
    return setupItem("event-source", "Event source", "action-required", "Add event source", "/manage/event-sources?setup=add");
  }
  if (provider.liveStatus === "healthy") {
    return setupItem("event-source", "Event source", "complete", "Review event source", "/manage/event-sources");
  }
  const blocked = provider.liveStatus === "error";
  return setupItem(
    "event-source",
    "Event source",
    blocked ? "blocked" : "action-required",
    blocked ? "Resolve event source" : "Enable intake",
    `/manage/event-sources?provider=${encodeURIComponent(provider.id)}`
  );
}

function ttsReadiness(provider: RegisteredProviderView | null): HomeReadinessItem {
  if (provider === null) {
    return setupItem("tts-provider", "TTS provider", "action-required", "Add TTS provider", "/manage/tts-providers?setup=add");
  }
  return setupItem(
    "tts-provider",
    "TTS provider",
    provider.connectionState === "connected" ? "complete" : provider.connectionState === "error" ? "blocked" : "action-required",
    provider.connectionState === "connected" ? "Review TTS provider" : "Resolve TTS provider",
    `/manage/tts-providers?provider=${encodeURIComponent(provider.id)}`
  );
}

function alertSetReadiness(alertSet: AlertSetOverview | null): HomeReadinessItem {
  if (alertSet === null) {
    return setupItem("starter-alert-set", "Starter alert set", "action-required", "Create alert set", "/manage/modules/alerts");
  }
  const hasValidEnabledAlert =
    alertSet.enabledAlertCount > 0 && !alertSet.validationIssues.some((issue) => issue.severity === "blocker");
  const ready = !alertSet.starter || alertSet.starterReviewState === "complete" || hasValidEnabledAlert;
  return setupItem(
    "starter-alert-set",
    "Starter alert set",
    ready ? "complete" : "action-required",
    ready ? "Review active set" : "Review starter alerts",
    "/manage/modules/alerts"
  );
}

function setupItem(
  id: string,
  label: string,
  state: HomeReadinessItem["state"],
  actionLabel: string,
  actionRoute: string
): HomeReadinessItem {
  return { id, label, state, actionLabel, actionRoute };
}
