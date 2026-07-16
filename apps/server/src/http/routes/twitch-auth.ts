import type { Logger } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type {
  TwitchConnectionPollInput,
  TwitchOAuthService
} from "../../modules/twitch/twitch-oauth-service.js";
import { runtimeSecretStoreUnavailableMessage } from "../../modules/security/runtime-secret-store.js";
import { sendHttpError } from "../errors.js";

export interface TwitchAuthRouteDependencies {
  readonly twitchAuthService: Pick<
    TwitchOAuthService,
    "getStatus" | "createConnectionStart" | "pollConnection" | "refreshConnectedAccount" | "disconnect"
  >;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly runtimeLogger?: Logger | undefined;
}

export function registerTwitchAuthRoutes(app: FastifyInstance, dependencies: TwitchAuthRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/twitch/auth/status", { preHandler }, async () => dependencies.twitchAuthService.getStatus());
  app.post("/twitch/auth/start", { preHandler }, async (request, reply) => {
    try {
      const result = await dependencies.twitchAuthService.createConnectionStart();
      await logProviderCall(dependencies, request.id, "twitch.auth.start", "accepted");
      return result;
    } catch (error) {
      await logProviderCall(dependencies, request.id, "twitch.auth.start", "failed", error);
      if (isTwitchProviderError(error)) {
        return sendHttpError(reply, 502, {
          code: error.code,
          message: getTwitchProviderErrorMessage(error)
        });
      }

      throw error;
    }
  });
  app.post("/twitch/auth/poll", { preHandler }, async (request, reply) => {
    const input = parsePollInput(request.body);
    if (input === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_TWITCH_AUTH_POLL_REQUEST",
        message: "Invalid Twitch auth poll request"
      });
    }

    try {
      const result = await dependencies.twitchAuthService.pollConnection(input);
      await logProviderCall(dependencies, request.id, "twitch.auth.poll", "accepted");
      return result;
    } catch (error) {
      await logProviderCall(dependencies, request.id, "twitch.auth.poll", "failed", error);
      if (isTwitchAuthorizationError(error)) {
        return sendHttpError(reply, 400, {
          code: error.code,
          message: error.message
        });
      }

      if (isTwitchProviderError(error)) {
        return sendHttpError(reply, 502, {
          code: error.code,
          message: getTwitchProviderErrorMessage(error)
        });
      }

      throw error;
    }
  });
  app.post("/twitch/auth/refresh", { preHandler }, async (request, reply) => {
    try {
      const result = await dependencies.twitchAuthService.refreshConnectedAccount();
      await logProviderCall(dependencies, request.id, "twitch.auth.refresh", "accepted");
      return result;
    } catch (error) {
      await logProviderCall(dependencies, request.id, "twitch.auth.refresh", "failed", error);
      if (isTwitchProviderError(error)) {
        return sendHttpError(reply, 502, {
          code: error.code,
          message: getTwitchProviderErrorMessage(error)
        });
      }

      throw error;
    }
  });
  app.post("/twitch/auth/disconnect", { preHandler }, async (request) => {
    const result = await dependencies.twitchAuthService.disconnect();
    await logProviderCall(dependencies, request.id, "twitch.auth.disconnect", "accepted");
    return result;
  });
}

async function logProviderCall(
  dependencies: TwitchAuthRouteDependencies,
  requestId: unknown,
  source: string,
  outcome: "accepted" | "failed",
  error?: unknown
): Promise<void> {
  const logger = outcome === "failed" ? dependencies.runtimeLogger?.warn : dependencies.runtimeLogger?.info;
  const errorCode = isTwitchProviderError(error) || isTwitchAuthorizationError(error) ? error.code : undefined;
  await logger?.call(dependencies.runtimeLogger, "Twitch provider operation completed", {
    module: "twitch",
    source,
    correlationId: String(requestId),
    processingId: null,
    metadata: {
      provider: "twitch",
      outcome,
      ...(error instanceof Error
        ? { errorName: error.name, ...(errorCode === undefined ? {} : { errorCode }) }
        : {})
    }
  });
}

function parsePollInput(body: unknown): TwitchConnectionPollInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const candidate = body as { readonly authorizationId?: unknown };
  return typeof candidate.authorizationId === "string" && candidate.authorizationId.trim() !== ""
    ? { authorizationId: candidate.authorizationId }
    : null;
}

function isTwitchAuthorizationError(error: unknown): error is Error & { readonly code: string } {
  return isErrorWithCode(error, "TWITCH_OAUTH_AUTHORIZATION_INVALID");
}

function isTwitchProviderError(error: unknown): error is Error & { readonly code: string } {
  return (
    isErrorWithCode(error, "TWITCH_OAUTH_PROVIDER_ERROR") ||
    isErrorWithCode(error, "TWITCH_API_REQUEST_FAILED") ||
    isErrorWithCode(error, "TWITCH_API_RESPONSE_INVALID")
  );
}

function getTwitchProviderErrorMessage(error: Error & { readonly code: string }): string {
  switch (error.code) {
    case "TWITCH_OAUTH_PROVIDER_ERROR":
      return runtimeSecretStoreUnavailableMessage;
    case "TWITCH_API_REQUEST_FAILED":
      return "Twitch API request failed";
    case "TWITCH_API_RESPONSE_INVALID":
      return "Twitch API response was invalid";
    default:
      return "Twitch provider operation failed";
  }
}

function isErrorWithCode(error: unknown, code: string): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && error.code === code;
}
