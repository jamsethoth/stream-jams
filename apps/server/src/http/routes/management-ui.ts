import {
  alertEditorDocumentSchema,
  alertSetOverviewSchema,
  assetLibraryItemSchema,
  configurationBackupSummarySchema,
  diagnosticsWorkspaceViewSchema,
  homeSetupSummarySchema,
  providerActivationImpactSchema,
  providerCapabilitySchema,
  registeredProviderViewSchema,
  ttsProviderSafetySettingsSchema,
  type AlertEditorDocument,
  type AlertSetOverview,
  type AssetLibraryItem,
  type ConfigurationBackupSummary,
  type DiagnosticsWorkspaceView,
  type HomeSetupSummary,
  type ProviderActivationImpact,
  type ProviderCapability,
  type RegisteredProviderView,
  type TtsProviderSafetySettings
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface ManagementUiQueryService {
  getHomeSetupSummary(): Promise<HomeSetupSummary>;
  listRegisteredProviders(capability: ProviderCapability): Promise<readonly RegisteredProviderView[]>;
  getProviderActivationImpact(providerId: string): Promise<ProviderActivationImpact>;
  getTtsProviderSafetySettings(providerId: string): Promise<TtsProviderSafetySettings>;
  listAlertSets(): Promise<readonly AlertSetOverview[]>;
  getAlertEditorDocument(alertId: string): Promise<AlertEditorDocument>;
  listAssetLibraryItems(): Promise<readonly AssetLibraryItem[]>;
  getDiagnosticsWorkspace(): Promise<DiagnosticsWorkspaceView>;
  getConfigurationBackupSummary(): Promise<ConfigurationBackupSummary>;
}

export interface ManagementUiRouteDependencies {
  readonly managementUiQueryService: ManagementUiQueryService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerManagementUiRoutes(app: FastifyInstance, dependencies: ManagementUiRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  const service = dependencies.managementUiQueryService;

  app.get("/management/home", { preHandler }, async () =>
    homeSetupSummarySchema.parse(await service.getHomeSetupSummary())
  );

  app.get("/management/providers", { preHandler }, async (request, reply) => {
    const capability = providerCapabilitySchema.safeParse(readValue(request.query, "capability"));
    if (!capability.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_PROVIDER_CAPABILITY",
        message: "Provider capability must be event-source or tts"
      });
    }

    return parseList(await service.listRegisteredProviders(capability.data), registeredProviderViewSchema);
  });

  app.get("/management/providers/:providerId/activation-impact", { preHandler }, async (request) =>
    providerActivationImpactSchema.parse(
      await service.getProviderActivationImpact(readParam(request.params, "providerId"))
    )
  );

  app.get("/management/providers/:providerId/tts-safety", { preHandler }, async (request) =>
    ttsProviderSafetySettingsSchema.parse(
      await service.getTtsProviderSafetySettings(readParam(request.params, "providerId"))
    )
  );

  app.get("/management/alert-sets", { preHandler }, async () =>
    parseList(await service.listAlertSets(), alertSetOverviewSchema)
  );

  app.get("/management/alerts/:alertId/editor", { preHandler }, async (request) =>
    alertEditorDocumentSchema.parse(await service.getAlertEditorDocument(readParam(request.params, "alertId")))
  );

  app.get("/management/assets/library", { preHandler }, async () =>
    parseList(await service.listAssetLibraryItems(), assetLibraryItemSchema)
  );

  app.get("/management/diagnostics/workspace", { preHandler }, async () =>
    diagnosticsWorkspaceViewSchema.parse(await service.getDiagnosticsWorkspace())
  );

  app.get("/management/settings/backup-summary", { preHandler }, async () =>
    configurationBackupSummarySchema.parse(await service.getConfigurationBackupSummary())
  );
}

interface RuntimeContract<T> {
  parse(input: unknown): T;
}

function parseList<T>(input: readonly unknown[], contract: RuntimeContract<T>): readonly T[] {
  return input.map((item) => contract.parse(item));
}

function readValue(record: unknown, key: string): unknown {
  return typeof record === "object" && record !== null ? (record as Record<string, unknown>)[key] : undefined;
}

function readParam(params: unknown, key: string): string {
  const value = readValue(params, key);
  return typeof value === "string" ? value : "";
}
