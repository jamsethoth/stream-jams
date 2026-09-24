import type {
  AlertEditorErrorReportInput,
  AlertEditorErrorReportResult,
  ClearOldLogsResult,
  ConfigurationBackupSummary,
  DiagnosticsWorkspaceView,
  OpenDataFolderResult
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AlertEditorService } from "../../modules/alerts/alert-editor-service.js";
import type { AlertSetManagementService } from "../../modules/alerts/alert-set-management-service.js";
import type { AssetLibraryService } from "../../modules/assets/asset-library-service.js";
import type { ManagementOverviewService } from "../../modules/providers/management-overview-service.js";
import type { ProviderManagementService } from "../../modules/providers/provider-management-service.js";
import { registerManagementAlertRoutes } from "./management-alerts.js";
import { registerManagementAssetRoutes } from "./management-assets.js";
import { registerManagementDiagnosticsRoutes } from "./management-diagnostics.js";
import { registerManagementHomeRoutes } from "./management-home.js";
import { registerManagementProviderRoutes } from "./management-providers.js";

export interface ManagementUiRouteDependencies {
  readonly managementOverviewService: Pick<
    ManagementOverviewService,
    "getHomeSetupSummary" | "listRegisteredProviders" | "getRegisteredProvider"
  >;
  readonly providerManagementService: Pick<
    ProviderManagementService,
    | "validateProvider"
    | "registerProvider"
    | "activateProvider"
    | "deactivateProvider"
    | "getActivationImpact"
    | "getTtsSafety"
    | "updateTtsSafety"
    | "testVoice"
  >;
  readonly alertSetManagementService: Pick<
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
  readonly alertEditorService: Pick<
    AlertEditorService,
    "getDocument" | "getVariationContext" | "saveDocument" | "sendTest"
  >;
  readonly managementAssetLibraryService: Pick<
    AssetLibraryService,
    "listItems" | "updateMetadata" | "getChangeImpact" | "deleteAsset" | "repairDuration"
  >;
  readonly reportAlertEditorError: (
    alertId: string,
    input: AlertEditorErrorReportInput
  ) => Promise<AlertEditorErrorReportResult>;
  readonly getDiagnosticsWorkspace: () => Promise<DiagnosticsWorkspaceView>;
  readonly getConfigurationBackupSummary: () => Promise<ConfigurationBackupSummary>;
  readonly openDataFolder: () => Promise<OpenDataFolderResult>;
  readonly clearOldLogs: () => Promise<ClearOldLogsResult>;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly generateServerErrorId?: (() => string) | undefined;
}

export function registerManagementUiRoutes(
  app: FastifyInstance,
  dependencies: ManagementUiRouteDependencies
): void {
  const preHandlers = [
    dependencies.managementRateLimitPreHandler,
    dependencies.managementAuthPreHandler
  ];

  registerManagementHomeRoutes(app, {
    overview: dependencies.managementOverviewService,
    preHandlers
  });
  registerManagementProviderRoutes(app, {
    overview: dependencies.managementOverviewService,
    providers: dependencies.providerManagementService,
    preHandlers
  });
  registerManagementAlertRoutes(app, {
    alertSets: dependencies.alertSetManagementService,
    alertEditor: dependencies.alertEditorService,
    reportClientError: dependencies.reportAlertEditorError,
    preHandlers,
    ...(dependencies.generateServerErrorId === undefined
      ? {}
      : { generateServerErrorId: dependencies.generateServerErrorId })
  });
  registerManagementAssetRoutes(app, {
    assets: dependencies.managementAssetLibraryService,
    preHandlers
  });
  registerManagementDiagnosticsRoutes(app, {
    getDiagnosticsWorkspace: dependencies.getDiagnosticsWorkspace,
    getConfigurationBackupSummary: dependencies.getConfigurationBackupSummary,
    openDataFolder: dependencies.openDataFolder,
    clearOldLogs: dependencies.clearOldLogs,
    preHandlers
  });
}
