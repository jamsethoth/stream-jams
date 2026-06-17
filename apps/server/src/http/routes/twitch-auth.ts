import type { Logger } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type {
  TwitchConnectionStartInput,
  TwitchOAuthCallbackInput,
  TwitchOAuthService
} from "../../modules/twitch/twitch-oauth-service.js";
import { sendHttpError } from "../errors.js";

export interface TwitchAuthRouteDependencies {
  readonly twitchAuthService: Pick<
    TwitchOAuthService,
    "getStatus" | "createConnectionStart" | "completeCallback" | "refreshConnectedAccount" | "disconnect"
  >;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly runtimeLogger?: Logger | undefined;
}

export function registerTwitchAuthRoutes(app: FastifyInstance, dependencies: TwitchAuthRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/twitch/auth/status", { preHandler }, async () => dependencies.twitchAuthService.getStatus());
  app.post("/twitch/auth/start", { preHandler }, async (request, reply) => {
    const input = parseConnectionStartInput(request.body);
    if (input === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_TWITCH_AUTH_START_REQUEST",
        message: "Invalid Twitch auth start request"
      });
    }

    try {
      const result = dependencies.twitchAuthService.createConnectionStart(input);
      await logProviderCall(dependencies, request.id, "twitch.auth.start", "accepted");
      return result;
    } catch (error) {
      await logProviderCall(dependencies, request.id, "twitch.auth.start", "failed", error);
      if (isTwitchProviderError(error)) {
        return sendHttpError(reply, 502, {
          code: error.code,
          message: error.message
        });
      }

      throw error;
    }
  });
  app.get("/twitch/auth/callback", { preHandler: dependencies.managementRateLimitPreHandler }, async (request, reply) => {
    const input = parseCallbackInput(request.query);
    if (input === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_TWITCH_AUTH_CALLBACK_REQUEST",
        message: "Invalid Twitch auth callback request"
      });
    }

    try {
      const result = await dependencies.twitchAuthService.completeCallback(input);
      await logProviderCall(dependencies, request.id, "twitch.auth.callback", "accepted");
      return result;
    } catch (error) {
      await logProviderCall(dependencies, request.id, "twitch.auth.callback", "failed", error);
      if (isTwitchClientError(error)) {
        return sendHttpError(reply, 400, {
          code: error.code,
          message: error.message
        });
      }

      if (isTwitchProviderError(error)) {
        return sendHttpError(reply, 502, {
          code: error.code,
          message: error.message
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
          message: error.message
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
  await logger?.call(dependencies.runtimeLogger, "Twitch provider operation completed", {
    module: "twitch",
    source,
    correlationId: String(requestId),
    processingId: null,
    metadata: {
      provider: "twitch",
      outcome,
      ...(error instanceof Error ? { errorName: error.name, errorMessage: error.message } : {})
    }
  });
}

function parseConnectionStartInput(body: unknown): TwitchConnectionStartInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const candidate = body as { readonly redirectUri?: unknown };
  return typeof candidate.redirectUri === "string" && candidate.redirectUri.trim() !== ""
    ? { redirectUri: candidate.redirectUri }
    : null;
}

function parseCallbackInput(query: unknown): TwitchOAuthCallbackInput | null {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    return null;
  }

  const candidate = query as { readonly code?: unknown; readonly state?: unknown };
  return typeof candidate.code === "string" &&
    candidate.code.trim() !== "" &&
    typeof candidate.state === "string" &&
    candidate.state.trim() !== ""
    ? { code: candidate.code, state: candidate.state }
    : null;
}

function isTwitchClientError(error: unknown): error is Error & { readonly code: string } {
  return isErrorWithCode(error, "TWITCH_OAUTH_STATE_INVALID");
}

function isTwitchProviderError(error: unknown): error is Error & { readonly code: string } {
  return (
    isErrorWithCode(error, "TWITCH_OAUTH_PROVIDER_ERROR") ||
    isErrorWithCode(error, "TWITCH_API_REQUEST_FAILED") ||
    isErrorWithCode(error, "TWITCH_API_RESPONSE_INVALID")
  );
}

function isErrorWithCode(error: unknown, code: string): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && error.code === code;
}
