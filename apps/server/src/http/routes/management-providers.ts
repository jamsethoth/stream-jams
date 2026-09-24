import {
  providerActivationImpactSchema,
  providerActivationResultSchema,
  providerCapabilitySchema,
  providerRegistrationAttemptSchema,
  providerSetupInputSchema,
  providerValidationResultSchema,
  providerVoiceTestResultSchema,
  registeredProviderDetailSchema,
  registeredProviderViewSchema,
  ttsProviderSafetySettingsSchema
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import type { ProviderManagementService } from "../../modules/providers/provider-management-service.js";
import type { ManagementOverviewService } from "../../modules/providers/management-overview-service.js";
import { parseList, readParam, readValue, sendProviderCommandError } from "./management-route-errors.js";

type ProviderCommands = Pick<
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

export interface ManagementProviderRouteDependencies {
  readonly overview: Pick<ManagementOverviewService, "listRegisteredProviders" | "getRegisteredProvider">;
  readonly providers: ProviderCommands;
  readonly preHandlers: preHandlerHookHandler[];
}

export function registerManagementProviderRoutes(
  app: FastifyInstance,
  dependencies: ManagementProviderRouteDependencies
): void {
  const { overview, providers } = dependencies;
  const preHandler = dependencies.preHandlers;

  app.get("/management/providers", { preHandler }, async (request, reply) => {
    const capability = providerCapabilitySchema.safeParse(readValue(request.query, "capability"));
    if (!capability.success) {
      return sendHttpError(reply, 400, {
        code: "INVALID_PROVIDER_CAPABILITY",
        message: "Provider capability must be event-source or tts"
      });
    }
    return parseList(await overview.listRegisteredProviders(capability.data), registeredProviderViewSchema);
  });

  app.post("/management/providers/validate", { preHandler }, async (request) =>
    providerValidationResultSchema.parse(
      await providers.validateProvider(providerSetupInputSchema.parse(request.body))
    )
  );

  app.post("/management/providers", { preHandler }, async (request, reply) => {
    const result = providerRegistrationAttemptSchema.parse(
      await providers.registerProvider(providerSetupInputSchema.parse(request.body))
    );
    return reply.status(result.status === "registered" ? 201 : 422).send(result);
  });

  app.get("/management/providers/:providerId", { preHandler }, async (request, reply) => {
    try {
      return registeredProviderDetailSchema.parse(
        await overview.getRegisteredProvider(readParam(request.params, "providerId"))
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
        await providers.activateProvider(readParam(request.params, "providerId"), confirmation ?? false)
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
  });

  app.post("/management/providers/:providerId/deactivate", { preHandler }, async (request, reply) => {
    try {
      return registeredProviderViewSchema.parse(
        await providers.deactivateProvider(readParam(request.params, "providerId"))
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
  });

  app.get("/management/providers/:providerId/activation-impact", { preHandler }, async (request) =>
    providerActivationImpactSchema.parse(
      await providers.getActivationImpact(readParam(request.params, "providerId"))
    )
  );

  app.get("/management/providers/:providerId/tts-safety", { preHandler }, async (request) =>
    ttsProviderSafetySettingsSchema.parse(
      await providers.getTtsSafety(readParam(request.params, "providerId"))
    )
  );

  app.put("/management/providers/:providerId/tts-safety", { preHandler }, async (request, reply) => {
    try {
      return ttsProviderSafetySettingsSchema.parse(
        await providers.updateTtsSafety(
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
        await providers.testVoice(
          readParam(request.params, "providerId"),
          "Stream Jams voice test. Your text to speech provider is ready."
        )
      );
    } catch (error) {
      return sendProviderCommandError(reply, error);
    }
  });
}
