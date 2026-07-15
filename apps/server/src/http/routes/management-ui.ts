import {
  alertEditorDocumentSchema,
  alertEditorSaveInputSchema,
  alertEditorTestRequestSchema,
  alertEditorTestResultSchema,
  alertSetActivationImpactSchema,
  alertSetActivationResultSchema,
  alertSetDetailSchema,
  alertSetMutationInputSchema,
  alertSetOverviewSchema,
  assetLibraryItemSchema,
  assetChangeImpactSchema,
  assetMediaTypeSchema,
  assetMetadataUpdateInputSchema,
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
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import {
  ProviderActivationBlockedError,
  ProviderActivationConfirmationRequiredError,
  ProviderRegistrationNotFoundError
} from "../../modules/providers/provider-management-service.js";
import {
  AlertRuleForSetNotFoundError,
  AlertSetActivationBlockedError,
  AlertSetActivationConfirmationRequiredError,
  AlertSetDeleteBlockedError,
  AlertSetNameConflictError,
  AlertSetNotFoundError
} from "../../modules/alerts/alert-set-management-service.js";
import {
  AssetLibraryInUseError,
  AssetLibraryNotFoundError
} from "../../modules/assets/asset-library-service.js";
import {
  AlertEditorDeliveryBlockedError,
  AlertEditorNotFoundError,
  AlertEditorValidationError
} from "../../modules/alerts/alert-editor-service.js";

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
  getAlertSet(setId: string): Promise<AlertSetDetail>;
  createAlertSet(input: AlertSetMutationInput): Promise<AlertSetOverview>;
  renameAlertSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview>;
  duplicateAlertSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview>;
  getAlertSetActivationImpact(setId: string): Promise<AlertSetActivationImpact>;
  activateAlertSet(setId: string, confirmWarnings: boolean): Promise<AlertSetActivationResult>;
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

  app.get("/management/alert-sets/:setId", { preHandler }, async (request, reply) => {
    try {
      return alertSetDetailSchema.parse(await service.getAlertSet(readParam(request.params, "setId")));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets", { preHandler }, async (request, reply) => {
    const input = readAlertSetMutationInput(request.body, reply);
    if (input === null) return;
    try {
      return reply.status(201).send(alertSetOverviewSchema.parse(await service.createAlertSet(input)));
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.patch("/management/alert-sets/:setId", { preHandler }, async (request, reply) => {
    const input = readAlertSetMutationInput(request.body, reply);
    if (input === null) return;
    try {
      return alertSetOverviewSchema.parse(
        await service.renameAlertSet(readParam(request.params, "setId"), input)
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/duplicate", { preHandler }, async (request, reply) => {
    const input = readAlertSetMutationInput(request.body, reply);
    if (input === null) return;
    try {
      return reply.status(201).send(
        alertSetOverviewSchema.parse(await service.duplicateAlertSet(readParam(request.params, "setId"), input))
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.get("/management/alert-sets/:setId/activation-impact", { preHandler }, async (request, reply) => {
    try {
      return alertSetActivationImpactSchema.parse(
        await service.getAlertSetActivationImpact(readParam(request.params, "setId"))
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/activate", { preHandler }, async (request, reply) => {
    const confirmation = readValue(request.body, "confirmWarnings");
    if (confirmation !== undefined && typeof confirmation !== "boolean") {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_SET_ACTIVATION_CONFIRMATION",
        message: "confirmWarnings must be true or false"
      });
    }
    try {
      return alertSetActivationResultSchema.parse(
        await service.activateAlertSet(readParam(request.params, "setId"), confirmation ?? false)
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.post("/management/alert-sets/:setId/starter-review", { preHandler }, async (request, reply) => {
    try {
      return alertSetOverviewSchema.parse(
        await service.markStarterAlertSetReviewComplete(readParam(request.params, "setId"))
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.patch("/management/alerts/:alertId/enabled", { preHandler }, async (request, reply) => {
    const enabled = readValue(request.body, "enabled");
    if (typeof enabled !== "boolean") {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_ENABLED_STATE",
        message: "enabled must be true or false"
      });
    }
    try {
      return alertSetDetailSchema.parse(
        await service.setManagedAlertEnabled(readParam(request.params, "alertId"), enabled)
      );
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.delete("/management/alert-sets/:setId", { preHandler }, async (request, reply) => {
    try {
      await service.deleteAlertSet(readParam(request.params, "setId"));
      return reply.status(204).send();
    } catch (error) {
      return sendAlertSetCommandError(reply, error);
    }
  });

  app.get("/management/alerts/:alertId/editor", { preHandler }, async (request, reply) => {
    try {
      return alertEditorDocumentSchema.parse(await service.getAlertEditorDocument(readParam(request.params, "alertId")));
    } catch (error) {
      return sendAlertEditorCommandError(reply, error);
    }
  });

  app.put("/management/alerts/:alertId/editor", { preHandler }, async (request, reply) => {
    const input = alertEditorSaveInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_EDITOR_DOCUMENT",
        message: "Review the alert layers and target profiles, then try saving again."
      });
    }
    try {
      return alertEditorDocumentSchema.parse(
        await service.saveAlertEditorDocument(readParam(request.params, "alertId"), input.data.document)
      );
    } catch (error) {
      return sendAlertEditorCommandError(reply, error);
    }
  });

  app.post("/management/alerts/:alertId/editor/test", { preHandler }, async (request, reply) => {
    const input = alertEditorTestRequestSchema.safeParse(request.body);
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_EDITOR_TEST",
        message: "Choose a target profile and valid sample payload, then try Send test again."
      });
    }
    try {
      return alertEditorTestResultSchema.parse(
        await service.sendAlertEditorTest(readParam(request.params, "alertId"), input.data)
      );
    } catch (error) {
      return sendAlertEditorCommandError(reply, error);
    }
  });

  app.get("/management/assets/library", { preHandler }, async () =>
    parseList(await service.listAssetLibraryItems(), assetLibraryItemSchema)
  );

  app.patch("/management/assets/:assetId", { preHandler }, async (request, reply) => {
    const input = assetMetadataUpdateInputSchema.safeParse(request.body);
    if (!input.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ASSET_METADATA",
        message: "Enter a display name and valid asset tags."
      });
    }
    try {
      return assetLibraryItemSchema.parse(
        await service.updateAssetMetadata(readParam(request.params, "assetId"), input.data)
      );
    } catch (error) {
      return sendAssetCommandError(reply, error);
    }
  });

  app.get("/management/assets/:assetId/change-impact", { preHandler }, async (request, reply) => {
    const candidateValue = readValue(request.query, "candidateMediaType");
    const candidate = candidateValue === undefined ? undefined : assetMediaTypeSchema.safeParse(candidateValue);
    if (candidate !== undefined && !candidate.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ASSET_MEDIA_TYPE",
        message: "candidateMediaType must be image, gif, video, or audio."
      });
    }
    try {
      return assetChangeImpactSchema.parse(
        await service.getAssetChangeImpact(
          readParam(request.params, "assetId"),
          candidate?.data
        )
      );
    } catch (error) {
      return sendAssetCommandError(reply, error);
    }
  });

  app.delete("/management/assets/:assetId", { preHandler }, async (request, reply) => {
    try {
      await service.deleteAsset(readParam(request.params, "assetId"));
      return reply.status(204).send();
    } catch (error) {
      return sendAssetCommandError(reply, error);
    }
  });

  app.get("/management/diagnostics/workspace", { preHandler }, async () =>
    diagnosticsWorkspaceViewSchema.parse(await service.getDiagnosticsWorkspace())
  );

  app.get("/management/settings/backup-summary", { preHandler }, async () =>
    configurationBackupSummarySchema.parse(await service.getConfigurationBackupSummary())
  );
}

function sendAssetCommandError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof AssetLibraryNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ASSET_NOT_FOUND",
      message: "The selected asset no longer exists. Refresh the asset library and try again."
    });
  }
  if (error instanceof AssetLibraryInUseError) {
    return reply.status(409).send({
      error: {
        code: "ASSET_IN_USE",
        message: "This asset is still used by alerts. Reassign those usages before deleting it."
      },
      impact: error.impact
    });
  }
  throw error;
}

function sendAlertEditorCommandError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof AlertEditorNotFoundError) {
    return sendHttpError(reply, 404, {
      code: error.code,
      message: "The selected alert no longer exists. Return to the alert set and choose another alert."
    });
  }
  if (error instanceof AlertEditorValidationError) {
    return sendHttpError(reply, 422, {
      code: error.code,
      message: `${error.message} Review the highlighted editor settings and try again.`
    });
  }
  if (error instanceof AlertEditorDeliveryBlockedError) {
    return sendHttpError(reply, 409, {
      code: error.code,
      message: error.message
    });
  }
  throw error;
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

function readAlertSetMutationInput(
  body: unknown,
  reply: Parameters<typeof sendHttpError>[0]
): AlertSetMutationInput | null {
  const input = alertSetMutationInputSchema.safeParse(body);
  if (input.success) return input.data;
  sendHttpError(reply, 400, {
    code: "INVALID_ALERT_SET_NAME",
    message: "Enter an alert set name between 1 and 120 characters."
  });
  return null;
}

function sendAlertSetCommandError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof AlertSetNotFoundError || error instanceof AlertRuleForSetNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ALERT_SET_NOT_FOUND",
      message: "The selected alert set or alert no longer exists. Refresh the alert set and try again."
    });
  }
  if (error instanceof AlertSetNameConflictError) {
    return sendHttpError(reply, 409, {
      code: "ALERT_SET_NAME_CONFLICT",
      message: "Choose a different name; alert set names must be unique."
    });
  }
  if (error instanceof AlertSetActivationBlockedError) {
    return reply.status(409).send({
      error: { code: "ALERT_SET_ACTIVATION_BLOCKED", message: error.message },
      impact: error.impact
    });
  }
  if (error instanceof AlertSetActivationConfirmationRequiredError) {
    return reply.status(409).send({
      error: { code: "ALERT_SET_ACTIVATION_CONFIRMATION_REQUIRED", message: error.message },
      impact: error.impact
    });
  }
  if (error instanceof AlertSetDeleteBlockedError) {
    return sendHttpError(reply, 409, {
      code: error.reason === "active" ? "ACTIVE_ALERT_SET_DELETE_BLOCKED" : "ONLY_ALERT_SET_DELETE_BLOCKED",
      message: error.message
    });
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
