import {
  homeSetupSummarySchema,
  type AlertEditorDocument,
  type AlertSetActivationImpact,
  type AlertSetActivationResult,
  type AlertSetDetail,
  type AlertSetMutationInput,
  type AlertSetOverview,
  type AssetLibraryItem,
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
import type { ProviderManagementService } from "./provider-management-service.js";
import type { AlertSetManagementService } from "../alerts/alert-set-management-service.js";

type HomeReadinessItem = HomeSetupSummary["readiness"][number];

type ProviderService = Pick<
  ProviderManagementService,
  | "listProviders"
  | "getProvider"
  | "validateProvider"
  | "registerProvider"
  | "activateProvider"
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
  readonly hasBrowserOutput: () => Promise<boolean>;
  readonly getAlertEditorDocument: (alertId: string) => Promise<AlertEditorDocument>;
  readonly listAssetLibraryItems: () => Promise<readonly AssetLibraryItem[]>;
  readonly getDiagnosticsWorkspace: () => Promise<DiagnosticsWorkspaceView>;
  readonly getConfigurationBackupSummary: () => Promise<ConfigurationBackupSummary>;
}

export class ManagementUiService {
  readonly #options: ManagementUiServiceOptions;

  constructor(options: ManagementUiServiceOptions) {
    this.#options = options;
  }

  async getHomeSetupSummary(): Promise<HomeSetupSummary> {
    const [eventSources, ttsProviders, alertSets, hasBrowserOutput] = await Promise.all([
      this.#options.providerService.listProviders("event-source"),
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
          "/modules/alerts#browser-sources"
        )
      ],
      activeAlertSet,
      actionableProblems: [...eventSources, ...ttsProviders]
        .map((provider) => provider.error)
        .filter((error) => error !== null)
    });
  }

  listRegisteredProviders(capability: ProviderCapability): Promise<readonly RegisteredProviderView[]> {
    return this.#options.providerService.listProviders(capability);
  }

  getRegisteredProvider(providerId: string): Promise<RegisteredProviderDetail> {
    return this.#options.providerService.getProvider(providerId);
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

  listAssetLibraryItems(): Promise<readonly AssetLibraryItem[]> {
    return this.#options.listAssetLibraryItems();
  }

  getDiagnosticsWorkspace(): Promise<DiagnosticsWorkspaceView> {
    return this.#options.getDiagnosticsWorkspace();
  }

  getConfigurationBackupSummary(): Promise<ConfigurationBackupSummary> {
    return this.#options.getConfigurationBackupSummary();
  }
}

function eventSourceReadiness(provider: RegisteredProviderView | null): HomeReadinessItem {
  if (provider === null) {
    return setupItem("event-source", "Event source", "action-required", "Add event source", "/event-sources?setup=add");
  }
  if (provider.connectionState === "connected" && provider.intakeState === "active") {
    return setupItem("event-source", "Event source", "complete", "Review event source", "/event-sources");
  }
  const blocked = provider.connectionState === "error" || provider.intakeState === "error";
  return setupItem(
    "event-source",
    "Event source",
    blocked ? "blocked" : "action-required",
    blocked ? "Resolve event source" : "Enable intake",
    `/event-sources?provider=${encodeURIComponent(provider.id)}`
  );
}

function ttsReadiness(provider: RegisteredProviderView | null): HomeReadinessItem {
  if (provider === null) {
    return setupItem("tts-provider", "TTS provider", "action-required", "Add TTS provider", "/tts-providers?setup=add");
  }
  return setupItem(
    "tts-provider",
    "TTS provider",
    provider.connectionState === "connected" ? "complete" : provider.connectionState === "error" ? "blocked" : "action-required",
    provider.connectionState === "connected" ? "Review TTS provider" : "Resolve TTS provider",
    `/tts-providers?provider=${encodeURIComponent(provider.id)}`
  );
}

function alertSetReadiness(alertSet: AlertSetOverview | null): HomeReadinessItem {
  if (alertSet === null) {
    return setupItem("starter-alert-set", "Starter alert set", "action-required", "Create alert set", "/modules/alerts");
  }
  const hasValidEnabledAlert =
    alertSet.enabledAlertCount > 0 && !alertSet.validationIssues.some((issue) => issue.severity === "blocker");
  const ready = !alertSet.starter || alertSet.starterReviewState === "complete" || hasValidEnabledAlert;
  return setupItem(
    "starter-alert-set",
    "Starter alert set",
    ready ? "complete" : "action-required",
    ready ? "Review active set" : "Review starter alerts",
    "/modules/alerts"
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
