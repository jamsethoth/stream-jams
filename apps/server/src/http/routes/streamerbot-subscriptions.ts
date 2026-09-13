import {
  streamerBotSubscriptionCatalogSchema,
  streamerBotSubscriptionUpdateInputSchema,
  type StreamerBotSubscriptionCatalog
} from "@stream-jams/core";
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import type { ProviderManagementService } from "../../modules/providers/provider-management-service.js";
import { sendHttpError } from "../errors.js";

export interface StreamerBotSubscriptionRouteDependencies {
  readonly streamerBotSubscriptionService: Pick<
    ProviderManagementService,
    "getStreamerBotSubscriptions" | "updateStreamerBotSubscriptions"
  >;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerStreamerBotSubscriptionRoutes(
  app: FastifyInstance,
  dependencies: StreamerBotSubscriptionRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  const path = "/providers/:providerId/streamerbot-subscriptions";

  app.get(path, { preHandler }, async (request, reply) => {
    const providerId = readProviderId(request.params);
    if (providerId === null) return sendInvalidRequest(reply);
    try {
      return sendCatalog(reply, await dependencies.streamerBotSubscriptionService.getStreamerBotSubscriptions(
        providerId
      ));
    } catch (error) {
      return sendSubscriptionError(reply, error);
    }
  });

  app.put(path, { preHandler }, async (request, reply) => {
    const providerId = readProviderId(request.params);
    const input = streamerBotSubscriptionUpdateInputSchema.safeParse(request.body);
    if (providerId === null || !input.success) return sendInvalidRequest(reply);
    try {
      return sendCatalog(reply, await dependencies.streamerBotSubscriptionService.updateStreamerBotSubscriptions(
        providerId,
        input.data
      ));
    } catch (error) {
      return sendSubscriptionError(reply, error);
    }
  });
}

function sendCatalog(reply: FastifyReply, value: StreamerBotSubscriptionCatalog): FastifyReply | StreamerBotSubscriptionCatalog {
  const parsed = streamerBotSubscriptionCatalogSchema.safeParse(value);
  if (!parsed.success) {
    return sendHttpError(reply, 502, {
      code: "STREAMERBOT_SUBSCRIPTION_CATALOG_INVALID",
      message: "Streamer.bot subscription catalog is temporarily unavailable"
    });
  }
  return parsed.data;
}

function sendInvalidRequest(reply: FastifyReply): FastifyReply {
  return sendHttpError(reply, 400, {
    code: "STREAMERBOT_SUBSCRIPTION_REQUEST_INVALID",
    message: "Choose valid Streamer.bot sources, event types, and Twitch broadcaster association"
  });
}

function sendSubscriptionError(reply: FastifyReply, error: unknown): FastifyReply {
  const code = readErrorCode(error);
  switch (code) {
    case "PROVIDER_REGISTRATION_NOT_FOUND":
      return sendHttpError(reply, 404, { code, message: "Provider registration was not found" });
    case "STREAMERBOT_SUBSCRIPTIONS_WRONG_PROVIDER":
      return sendHttpError(reply, 422, { code, message: "Streamer.bot subscriptions require a Streamer.bot provider" });
    case "STREAMERBOT_SUBSCRIPTIONS_INACTIVE":
      return sendHttpError(reply, 409, { code, message: "Only the active Streamer.bot provider can update subscriptions" });
    case "STREAMERBOT_RUNTIME_UNAVAILABLE":
      return sendHttpError(reply, 409, { code, message: "The active Streamer.bot connection is unavailable" });
    case "STREAMERBOT_SUBSCRIPTION_UNAVAILABLE":
      return sendHttpError(reply, 422, { code, message: "One or more selected Streamer.bot events are no longer advertised" });
    case "STREAMERBOT_BROADCASTER_UNVERIFIED":
      return sendHttpError(reply, 409, { code, message: "Reconnect or verify the selected Twitch broadcaster before saving" });
    default:
      throw error;
  }
}

function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function readProviderId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("providerId" in value)) return null;
  const providerId = (value as { readonly providerId?: unknown }).providerId;
  if (typeof providerId !== "string") return null;
  const trimmed = providerId.trim();
  return trimmed.length > 0 && trimmed.length <= 120 ? trimmed : null;
}
