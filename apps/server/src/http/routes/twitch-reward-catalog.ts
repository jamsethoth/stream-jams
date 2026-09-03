import { twitchCustomRewardCatalogSchema, type Logger } from "@stream-jams/core";
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import type { TwitchRewardCatalogService } from "../../modules/twitch/twitch-reward-catalog-service.js";
import { sendHttpError } from "../errors.js";

export interface TwitchRewardCatalogRouteDependencies {
  readonly twitchRewardCatalogService: Pick<TwitchRewardCatalogService, "listCustomRewards">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly runtimeLogger?: Logger | undefined;
}

export function registerTwitchRewardCatalogRoutes(
  app: FastifyInstance,
  dependencies: TwitchRewardCatalogRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/twitch/custom-rewards", { preHandler }, async (request, reply) => {
    try {
      const result = twitchCustomRewardCatalogSchema.safeParse(
        await dependencies.twitchRewardCatalogService.listCustomRewards()
      );
      if (!result.success) {
        await logCatalogCall(dependencies, request.id, "failed", "TWITCH_REWARD_CATALOG_PROVIDER_ERROR", "ZodError");
        return sendProviderError(reply);
      }

      await logCatalogCall(dependencies, request.id, "accepted");
      return result.data;
    } catch (error) {
      const errorCode = readErrorCode(error);
      await logCatalogCall(
        dependencies,
        request.id,
        "failed",
        errorCode,
        error instanceof Error ? error.name : undefined
      );
      return sendTwitchRewardCatalogError(reply, error);
    }
  });
}

function sendTwitchRewardCatalogError(reply: FastifyReply, error: unknown): FastifyReply {
  const code = readErrorCode(error);
  switch (code) {
    case "TWITCH_REWARD_CATALOG_DISCONNECTED":
      return sendHttpError(reply, 409, {
        code,
        message: "Connect a Twitch broadcaster account before loading custom rewards"
      });
    case "TWITCH_REWARD_CATALOG_SCOPE_REQUIRED":
      return sendHttpError(reply, 409, {
        code,
        message: "Reconnect Twitch with channel points access before loading custom rewards"
      });
    case "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED":
      return sendHttpError(reply, 409, {
        code,
        message: "Reconnect Twitch before loading custom rewards"
      });
    case "TWITCH_REWARD_CATALOG_INELIGIBLE":
      return sendHttpError(reply, 422, {
        code,
        message: "The connected Twitch broadcaster is not eligible to list custom rewards"
      });
    case "TWITCH_API_REQUEST_FAILED":
    case "TWITCH_API_RESPONSE_INVALID":
    case "TWITCH_OAUTH_PROVIDER_ERROR":
      return sendProviderError(reply);
    default:
      throw error;
  }
}

function sendProviderError(reply: FastifyReply): FastifyReply {
  return sendHttpError(reply, 502, {
    code: "TWITCH_REWARD_CATALOG_PROVIDER_ERROR",
    message: "Twitch custom rewards are temporarily unavailable"
  });
}

async function logCatalogCall(
  dependencies: TwitchRewardCatalogRouteDependencies,
  requestId: unknown,
  outcome: "accepted" | "failed",
  errorCode?: string,
  errorName?: string
): Promise<void> {
  const logger = outcome === "failed" ? dependencies.runtimeLogger?.warn : dependencies.runtimeLogger?.info;
  await logger?.call(dependencies.runtimeLogger, "Twitch reward catalog operation completed", {
    module: "twitch",
    source: "twitch.reward-catalog.list",
    correlationId: String(requestId),
    processingId: null,
    metadata: {
      provider: "twitch",
      outcome,
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(errorName === undefined ? {} : { errorName })
    }
  });
}

function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}
