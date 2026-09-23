import {
  homeSetupSummarySchema,
  assessAlertConfiguration,
  type AlertEditorDocument,
  type AlertInventoryRow,
  type AlertSetDetail,
  type AlertSetOverview,
  type AssetLibraryItem,
  type HomeSetupSummary,
  type ProviderCapability,
  type ProviderLiveStatus,
  type RegisteredProviderDetail,
  type RegisteredProviderView
} from "@stream-jams/core";
import type { ProviderManagementService } from "./provider-management-service.js";
import type { AlertSetManagementService } from "../alerts/alert-set-management-service.js";
import type { TwitchConnectionStatus } from "../twitch/twitch-account-repository.js";

type HomeReadinessItem = HomeSetupSummary["readiness"][number];
type HomeAlertConfiguration = HomeSetupSummary["alertConfiguration"];
type HomeAlertConfigurationItem = HomeAlertConfiguration["items"][number];

type ProviderService = Pick<
  ProviderManagementService,
  "listProviders" | "getProvider"
>;

type AlertSetService = Pick<
  AlertSetManagementService,
  "listSets" | "getSet"
>;

export interface ManagementOverviewServiceOptions {
  readonly providerService: ProviderService;
  readonly alertSetService: AlertSetService;
  readonly getEventSourceRuntimeView: (provider: RegisteredProviderView) => EventSourceRuntimeView;
  readonly getTwitchAuthorization: () => Promise<TwitchConnectionStatus>;
  readonly hasBrowserOutput: () => Promise<boolean>;
  readonly getAlertEditorDocument: (alertId: string) => Promise<AlertEditorDocument>;
  readonly listAssetLibraryItems: () => Promise<readonly AssetLibraryItem[]>;
}

export interface EventSourceRuntimeView {
  readonly liveStatus: ProviderLiveStatus;
  readonly error: RegisteredProviderView["error"];
}

export class ManagementOverviewService {
  readonly #options: ManagementOverviewServiceOptions;

  constructor(options: ManagementOverviewServiceOptions) {
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
      alertConfiguration: await this.#getAlertConfiguration(activeAlertSet),
      actionableProblems: [...eventSources, ...ttsProviders]
        .map((provider) => provider.error)
        .filter((error) => error !== null)
    });
  }

  async #getAlertConfiguration(activeAlertSet: AlertSetOverview | null): Promise<HomeAlertConfiguration> {
    if (activeAlertSet === null) {
      return { state: "no-active-set", enabledAlertCount: 0, items: [] };
    }
    if (activeAlertSet.enabledAlertCount === 0) {
      return { state: "no-enabled-alerts", enabledAlertCount: 0, items: [] };
    }

    let detail: AlertSetDetail;
    try {
      detail = await this.#options.alertSetService.getSet(activeAlertSet.id);
    } catch {
      return { state: "unavailable", enabledAlertCount: activeAlertSet.enabledAlertCount, items: [] };
    }
    const enabledAlerts = detail.inventory.filter((alert) => alert.enabled);
    if (enabledAlerts.length === 0) {
      return { state: "unavailable", enabledAlertCount: activeAlertSet.enabledAlertCount, items: [] };
    }

    const documents = await Promise.all(enabledAlerts.map(async (alert) => {
      try {
        return { alert, document: await this.#options.getAlertEditorDocument(alert.id) };
      } catch {
        return { alert, document: null };
      }
    }));
    const needsAssetCatalog = documents.some(({ document }) => document !== null
      && document.targetProfiles.every((profile) => !profile.enabled)
      && document.outputs.deviceRouteIds.length > 0
      && document.layers.some((layer) => layer.type === "video" && layer.visible && layer.playEmbeddedAudio));
    const assets = needsAssetCatalog
      ? await this.#options.listAssetLibraryItems().then((items) => items, () => null)
      : [];
    const mediaTypes: Readonly<Record<string, "image" | "gif" | "video">> | null = assets === null
      ? null
      : Object.fromEntries(assets.flatMap((asset) => asset.mediaType === "audio" ? [] : [[asset.id, asset.mediaType]]));
    const items = documents.flatMap(({ alert, document }): HomeAlertConfigurationItem[] => {
      let actionRoute = alertEditorRoute(alert.id, alert.setId, alert.eventType, alert.targetProfileIds[0]);
      if (document === null) {
        return [{ alertId: alert.id, name: alert.name, eventType: alert.eventType, state: "unavailable", message: "Saved alert details are unavailable.", actionRoute }];
      }
      if (!document.enabled) {
        return [{ alertId: alert.id, name: alert.name, eventType: alert.eventType, state: "review-needed", message: "The enabled alert inventory does not match its saved document.", actionRoute }];
      }
      const enabledProfiles = document.targetProfiles.filter((profile) => profile.enabled);
      actionRoute = alertEditorRoute(alert.id, alert.setId, alert.eventType, enabledProfiles[0]?.id);
      const needsDocumentAssetCatalog = enabledProfiles.length === 0
        && document.outputs.deviceRouteIds.length > 0
        && document.layers.some((layer) => layer.type === "video" && layer.visible && layer.playEmbeddedAudio);
      if (needsDocumentAssetCatalog && mediaTypes === null) {
        return [{ alertId: alert.id, name: alert.name, eventType: alert.eventType, state: "unavailable", message: "Device audio could not be checked because asset details are unavailable.", actionRoute }];
      }
      let assessment: ReturnType<typeof assessAlertConfiguration>;
      try {
        assessment = assessAlertConfiguration(document, mediaTypes ?? {});
      } catch {
        return [{ alertId: alert.id, name: alert.name, eventType: alert.eventType, state: "unavailable", message: "Saved alert audio could not be checked.", actionRoute }];
      }
      const profileIssues = detail.overview.validationIssues.filter((issue) =>
        issue.alertId === alert.id
        && (issue.targetProfileId === null || enabledProfiles.some((profile) => profile.id === issue.targetProfileId))
      );
      if (assessment.issue === "profile-review" || (assessment.hasBrowserContent && profileIssues.length > 0)) {
        return [{
          alertId: alert.id,
          name: alert.name,
          eventType: alert.eventType,
          state: "review-needed",
          message: profileIssues[0]?.message ?? "Finish reviewing each enabled target profile.",
          actionRoute
        }];
      }
      if (assessment.issue === "empty-content") {
        return [{
          alertId: alert.id,
          name: alert.name,
          eventType: alert.eventType,
          state: "review-needed",
          message: "Review this alert because no visible browser content or resolved device audio is available.",
          actionRoute
        }];
      }
      if (assessment.issue === "missing-profile") return [{
        alertId: alert.id, name: alert.name, eventType: alert.eventType, state: "review-needed",
        message: "Enable and review a target profile for Browser Source output.", actionRoute
      }];
      return [];
    });
    return {
      state: items.length === 0 ? "configured" : items.some((item) => item.state === "review-needed") ? "attention" : "unavailable",
      enabledAlertCount: enabledAlerts.length,
      items
    };
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
  if (provider.liveStatus === "starting") {
    return setupItem(
      "event-source",
      "Event source",
      "action-required",
      "Starting event source",
      `/manage/event-sources?provider=${encodeURIComponent(provider.id)}`
    );
  }
  if (provider.liveStatus === "reconnecting") {
    return setupItem(
      "event-source",
      "Event source",
      "action-required",
      "Reconnect in progress",
      `/manage/event-sources?provider=${encodeURIComponent(provider.id)}`
    );
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

function alertEditorRoute(
  alertId: string,
  setId: string,
  eventType: string,
  targetProfileId: AlertInventoryRow["targetProfileIds"][number] | undefined
): string {
  const search = new URLSearchParams({ set: setId, event: eventType });
  if (targetProfileId !== undefined) search.set("profile", targetProfileId);
  return `/manage/modules/alerts/editor/${encodeURIComponent(alertId)}?${search.toString()}`;
}
