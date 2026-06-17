import type { Logger } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { DiagnosticsService } from "../../modules/diagnostics/diagnostics-service.js";
import { DiagnosticsLimitError } from "../../modules/diagnostics/diagnostics-service.js";
import { sendHttpError } from "../errors.js";

export interface DiagnosticsRouteDependencies {
  readonly diagnosticsService: Pick<DiagnosticsService, "getDiagnostics" | "createExport" | "createDebugExport">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly runtimeLogger?: Logger | undefined;
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
      await dependencies.runtimeLogger?.info("Diagnostics export generated", {
        module: "diagnostics",
        source: "diagnostics.export",
        correlationId: String(request.id),
        processingId: null,
        metadata: { debugExport: false, limit: limit ?? null }
      });
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

  app.post("/diagnostics/export/debug", { preHandler }, async (request, reply) => {
    const input = parseDebugExportInput(request.body);
    if (input === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_DIAGNOSTICS_EXPORT_REQUEST",
        message: "Invalid diagnostics debug export request"
      });
    }

    try {
      reply.header("content-type", "application/json; charset=utf-8");
      await dependencies.runtimeLogger?.info("Diagnostics debug export generated", {
        module: "diagnostics",
        source: "diagnostics.export.debug",
        correlationId: String(request.id),
        processingId: null,
        metadata: {
          debugExport: true,
          limit: input.limit ?? null,
          runtimeLogLimit: input.runtimeLogLimit ?? null,
          sinceHours: input.sinceHours ?? null
        }
      });
      return await dependencies.diagnosticsService.createDebugExport(input);
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

function parseDebugExportInput(body: unknown): {
  readonly limit?: number | undefined;
  readonly runtimeLogLimit?: number | undefined;
  readonly sinceHours?: number | undefined;
} | null {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const candidate = body as {
    readonly limit?: unknown;
    readonly runtimeLogLimit?: unknown;
    readonly sinceHours?: unknown;
  };
  const limit = parseOptionalPositiveInteger(candidate.limit);
  const runtimeLogLimit = parseOptionalPositiveInteger(candidate.runtimeLogLimit);
  const sinceHours = parseOptionalPositiveInteger(candidate.sinceHours);
  if (limit === null || runtimeLogLimit === null || sinceHours === null) {
    return null;
  }

  return {
    ...(limit === undefined ? {} : { limit }),
    ...(runtimeLogLimit === undefined ? {} : { runtimeLogLimit }),
    ...(sinceHours === undefined ? {} : { sinceHours })
  };
}

function parseOptionalPositiveInteger(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
