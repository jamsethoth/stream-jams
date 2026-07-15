import {
  alertEditorDocumentSchema,
  alertSetOverviewSchema,
  assetLibraryItemSchema,
  configurationBackupSummarySchema,
  diagnosticsWorkspaceViewSchema,
  homeSetupSummarySchema,
  providerActivationResultSchema,
  providerActivationImpactSchema,
  providerCapabilitySchema,
  providerRegistrationAttemptSchema,
  providerSetupInputSchema,
  providerValidationResultSchema,
  providerVoiceTestResultSchema,
  registeredProviderDetailSchema,
  registeredProviderViewSchema,
  ttsProviderSafetySettingsSchema,
  type AlertEditorDocument,
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
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import {
  ProviderActivationBlockedError,
  ProviderActivationConfirmationRequiredError,
  ProviderRegistrationNotFoundError
} from "../../modules/providers/provider-management-service.js";

export interface ManagementUiQueryService {
  getHomeSetupSummary(): Promise<HomeSetupSummary>;
  listRegisteredProviders(capability: ProviderCapability): Promise<readonly RegisteredProviderView[]>;
  getRegisteredProvider(providerId: string): Promise<RegisteredProviderDetail>;
  validateProviderSetup(input: ProviderSetupInput): Promise<ProviderValidationResult>;
  registerProvider(input: ProviderSetupInput): Promise<ProviderRegistrationAttempt>;
  activateProvider(providerId: string, confirmWarnings: boolean): Promise<ProviderActivationResult>;
  getProviderActivationImpact(providerId: string): Promise<ProviderActivationImpact>;
  getTtsProviderSafetySettings(providerId: string): Promise<TtsProviderSafetySettings>;
  updateTtsProviderSafetySettings(
    providerId: string,
    settings: TtsProviderSafetySettings
  ): Promise<TtsProviderSafetySettings>;
  testProviderVoice(providerId: string): Promise<ProviderVoiceTestResult>;
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

  app.post("/management/providers/validate", { preHandler }, async (request) =>
    providerValidationResultSchema.parse(
      await service.validateProviderSetup(providerSetupInputSchema.parse(request.body))
    )
  );

  app.post("/management/providers", { preHandler }, async (request, reply) => {
    const result = providerRegistrationAttemptSchema.parse(
      await service.registerProvider(providerSetupInputSchema.parse(request.body))
    );
    return reply.status(result.status === "registered" ? 201 : 422).send(result);
  });

  app.get("/management/providers/:providerId", { preHandler }, async (request, reply) => {
    try {
      return registeredProviderDetailSchema.parse(
        await service.getRegisteredProvider(readParam(request.params, "providerId"))
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
  });

  app.post("/management/providers/:providerId/activate", { preHandler }, async (request, reply) => {
    const confirmation = readValue(request.body, "confirmWarnings");
    if (confirmation !== undefined && typeof confirmation !== "boolean") {
      return sendHttpError(reply, 400, {
        code: "INVALID_PROVIDER_ACTIVATION_CONFIRMATION",
        message: "confirmWarnings must be true or false"
      });
    }
    try {
      return providerActivationResultSchema.parse(
        await service.activateProvider(readParam(request.params, "providerId"), confirmation ?? false)
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
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

  app.put("/management/providers/:providerId/tts-safety", { preHandler }, async (request, reply) => {
    try {
      return ttsProviderSafetySettingsSchema.parse(
        await service.updateTtsProviderSafetySettings(
          readParam(request.params, "providerId"),
          ttsProviderSafetySettingsSchema.parse(request.body)
        )
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
  });

  app.post("/management/providers/:providerId/test-voice", { preHandler }, async (request, reply) => {
    try {
      return providerVoiceTestResultSchema.parse(
        await service.testProviderVoice(readParam(request.params, "providerId"))
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
  });

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

function sendProviderCommandError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof ProviderRegistrationNotFoundError) {
    return sendHttpError(reply, 404, {
      code: error.code,
      message: "The selected provider registration no longer exists. Refresh the provider list and try again."
    });
  }
  if (error instanceof ProviderActivationBlockedError) {
    return reply.status(409).send({ error: { code: error.code, message: error.message }, impact: error.impact });
  }
  if (error instanceof ProviderActivationConfirmationRequiredError) {
    return reply.status(409).send({ error: { code: error.code, message: error.message }, impact: error.impact });
  }
  throw error;
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
