import { timingSafeEqual } from "node:crypto";
import type { ManagementSessionService } from "@stream-jams/core";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";
import { extractBearerToken } from "./management-auth.js";

interface RuntimeSecurityLogger {
  warn(message: string, context: {
    readonly module: string;
    readonly source: string;
    readonly correlationId: string;
    readonly processingId: string | null;
    readonly metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ManagementOriginPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
}

export interface ManagementSecurityPreHandlerOptions {
  readonly sessionService: Pick<ManagementSessionService, "verifySession">;
  readonly originPolicy: ManagementOriginPolicy;
  readonly runtimeLogger?: RuntimeSecurityLogger | undefined;
}

export interface ManagementOriginPolicyOptions {
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly environment?: NodeJS.ProcessEnv | undefined;
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfHeaderName = "x-stream-jams-csrf";
const allowedRequestHeaders = [
  "authorization",
  "content-type",
  csrfHeaderName,
  "x-stream-jams-file-name",
  "x-stream-jams-mime-type"
].join(", ");

export function createLocalManagementOriginPolicy(options: ManagementOriginPolicyOptions): ManagementOriginPolicy {
  const environment = options.environment ?? process.env;
  const configuredOrigin = `http://${options.host}:${options.port}`;
  const devOrigins = (environment.STREAM_JAMS_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");

  return {
    allowedOrigins: new Set([configuredOrigin, ...devOrigins])
  };
}

export function createManagementOriginPreHandler(policy: ManagementOriginPolicy): preHandlerHookHandler {
  return async (request, reply) => {
    if (!applyOriginPolicy(request, reply, policy)) {
      return;
    }
  };
}

export function createManagementSecurityPreHandler(options: ManagementSecurityPreHandlerOptions): preHandlerHookHandler {
  return async (request, reply) => {
    if (!applyOriginPolicy(request, reply, options.originPolicy)) {
      await options.runtimeLogger?.warn("Management request rejected because origin is not allowed", securityContext(request, "management.origin.rejected"));
      return;
    }

    const sessionId = extractBearerToken(request.headers.authorization);
    if (sessionId === null) {
      await options.runtimeLogger?.warn("Management request rejected because session is missing", securityContext(request, "management.session.missing"));
      return sendHttpError(reply, 401, {
        code: "MANAGEMENT_SESSION_REQUIRED",
        message: "A valid management session bearer token is required"
      });
    }

    const verification = await options.sessionService.verifySession(sessionId);
    if (!verification.authorized) {
      await options.runtimeLogger?.warn("Management request rejected because session is unauthorized", {
        ...securityContext(request, "management.session.unauthorized"),
        metadata: {
          ...securityContext(request, "management.session.unauthorized").metadata,
          reason: verification.reason
        }
      });
      return sendHttpError(reply, 401, {
        code: "MANAGEMENT_SESSION_UNAUTHORIZED",
        message: "Management session is not authorized",
        reason: verification.reason
      });
    }

    if (unsafeMethods.has(request.method) && !isValidCsrfToken(readSingleHeader(request.headers[csrfHeaderName]), verification.session.csrfToken)) {
      await options.runtimeLogger?.warn("Management request rejected because CSRF proof is invalid", securityContext(request, "management.csrf.rejected"));
      return sendHttpError(reply, 403, {
        code: "MANAGEMENT_CSRF_REQUIRED",
        message: "A valid management CSRF token is required"
      });
    }
  };
}

export function registerManagementCorsPreflightRoute(app: FastifyInstance, policy: ManagementOriginPolicy): void {
  app.options("/*", async (request, reply) => {
    if (!isManagementPath(request.url)) {
      return reply.status(404).send();
    }

    if (!applyOriginPolicy(request, reply, policy)) {
      return;
    }

    return reply
      .header("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
      .header("access-control-allow-headers", allowedRequestHeaders)
      .header("access-control-max-age", "600")
      .status(204)
      .send();
  });
}

function applyOriginPolicy(request: FastifyRequest, reply: FastifyReply, policy: ManagementOriginPolicy): boolean {
  const origin = readSingleHeader(request.headers.origin);
  if (origin === null || origin === "null") {
    return true;
  }

  if (!policy.allowedOrigins.has(origin)) {
    sendHttpError(reply, 403, {
      code: "MANAGEMENT_ORIGIN_FORBIDDEN",
      message: "Management request origin is not allowed"
    });
    return false;
  }

  reply.header("vary", "Origin");
  reply.header("access-control-allow-origin", origin);
  return true;
}

function isValidCsrfToken(candidate: string | null, expected: string): boolean {
  if (candidate === null) {
    return false;
  }

  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isManagementPath(url: string): boolean {
  const path = url.split("?", 1)[0] ?? "";
  return path !== "/" && path !== "/manage" && path !== "/health" && !path.startsWith("/overlay/");
}

function securityContext(request: FastifyRequest, source: string) {
  return {
    module: "management-security",
    source,
    correlationId: String(request.id),
    processingId: null,
    metadata: {
      method: request.method,
      url: request.url,
      origin: readSingleHeader(request.headers.origin)
    }
  };
}
