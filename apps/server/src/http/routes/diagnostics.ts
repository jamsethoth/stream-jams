import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { DiagnosticsService } from "../../modules/diagnostics/diagnostics-service.js";
import { DiagnosticsLimitError } from "../../modules/diagnostics/diagnostics-service.js";
import { sendHttpError } from "../errors.js";

export interface DiagnosticsRouteDependencies {
  readonly diagnosticsService: Pick<DiagnosticsService, "getDiagnostics" | "createExport">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerDiagnosticsRoutes(app: FastifyInstance, dependencies: DiagnosticsRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/diagnostics", { preHandler }, async (request, reply) => {
    const limit = parseLimit(request.query);
    if (limit === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_DIAGNOSTICS_LIMIT",
        message: "Invalid diagnostics limit"
      });
    }

    try {
      return await dependencies.diagnosticsService.getDiagnostics({ limit });
    } catch (error) {
      if (isDiagnosticsLimitError(error)) {
        return sendHttpError(reply, 400, {
          code: "INVALID_DIAGNOSTICS_LIMIT",
          message: error.message
        });
      }

      throw error;
    }
  });

  app.get("/diagnostics/export", { preHandler }, async (request, reply) => {
    const limit = parseLimit(request.query);
    if (limit === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_DIAGNOSTICS_LIMIT",
        message: "Invalid diagnostics limit"
      });
    }

    try {
      reply.header("content-type", "application/json; charset=utf-8");
      return await dependencies.diagnosticsService.createExport({ limit });
    } catch (error) {
      if (isDiagnosticsLimitError(error)) {
        return sendHttpError(reply, 400, {
          code: "INVALID_DIAGNOSTICS_LIMIT",
          message: error.message
        });
      }

      throw error;
    }
  });
}

function parseLimit(query: unknown): number | undefined | null {
  if (typeof query !== "object" || query === null) {
    return undefined;
  }

  const limit = (query as { readonly limit?: unknown }).limit;
  if (limit === undefined || limit === "") {
    return undefined;
  }

  if (Array.isArray(limit) || typeof limit !== "string" || !/^[1-9]\d*$/.test(limit)) {
    return null;
  }

  return Number(limit);
}

export function isDiagnosticsLimitError(error: unknown): error is DiagnosticsLimitError {
  return error instanceof DiagnosticsLimitError || (error instanceof Error && error.name === "DiagnosticsLimitError");
}
