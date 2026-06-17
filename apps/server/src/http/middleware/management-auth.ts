import type { ManagementSessionService } from "@stream-jams/core";
import type { preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface ManagementAuthPreHandlerOptions {
  readonly sessionService: Pick<ManagementSessionService, "verifySession">;
}

export function createManagementAuthPreHandler(options: ManagementAuthPreHandlerOptions): preHandlerHookHandler {
  return async (request, reply) => {
    const sessionId = extractBearerToken(request.headers.authorization);
    if (sessionId === null) {
      return sendHttpError(reply, 401, {
        code: "MANAGEMENT_SESSION_REQUIRED",
        message: "A valid management session bearer token is required"
      });
    }

    const verification = await options.sessionService.verifySession(sessionId);
    if (!verification.authorized) {
      return sendHttpError(reply, 401, {
        code: "MANAGEMENT_SESSION_UNAUTHORIZED",
        message: "Management session is not authorized",
        reason: verification.reason
      });
    }
  };
}

export function extractBearerToken(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}
