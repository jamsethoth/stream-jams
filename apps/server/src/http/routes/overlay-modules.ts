import {
  InvalidOverlayModuleConfigError,
  UnknownOverlayModuleError,
  type OverlayModuleConfigService,
  type OverlayModuleRegistry
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface OverlayModuleRouteDependencies {
  readonly overlayModuleRegistry: Pick<OverlayModuleRegistry, "listModules">;
  readonly overlayModuleConfigService: Pick<
    OverlayModuleConfigService,
    "getModuleConfig" | "saveModuleConfig" | "setModuleEnabled"
  >;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerOverlayModuleRoutes(app: FastifyInstance, dependencies: OverlayModuleRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/overlay-modules", { preHandler }, async () => dependencies.overlayModuleRegistry.listModules());

  app.get("/overlay-modules/:moduleId/config", { preHandler }, async (request, reply) => {
    try {
      return await dependencies.overlayModuleConfigService.getModuleConfig(readModuleId(request.params));
    } catch (error) {
      return sendOverlayModuleError(reply, error);
    }
  });

  app.put("/overlay-modules/:moduleId/config", { preHandler }, async (request, reply) => {
    const payload = parseConfigPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_OVERLAY_MODULE_CONFIG_REQUEST",
        message: "Invalid overlay module config request"
      });
    }

    try {
      return await dependencies.overlayModuleConfigService.saveModuleConfig({
        moduleId: readModuleId(request.params),
        enabled: payload.enabled,
        config: payload.config
      });
    } catch (error) {
      return sendOverlayModuleError(reply, error);
    }
  });

  app.patch("/overlay-modules/:moduleId/enabled", { preHandler }, async (request, reply) => {
    const payload = parseEnabledPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_OVERLAY_MODULE_ENABLED_REQUEST",
        message: "Invalid overlay module enabled request"
      });
    }

    try {
      return await dependencies.overlayModuleConfigService.setModuleEnabled(readModuleId(request.params), payload.enabled);
    } catch (error) {
      return sendOverlayModuleError(reply, error);
    }
  });
}

function readModuleId(params: unknown): string {
  return String((params as { readonly moduleId?: string }).moduleId ?? "");
}

function parseConfigPayload(body: unknown): { readonly enabled: boolean; readonly config: unknown } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as { readonly enabled?: unknown; readonly config?: unknown };
  if (typeof candidate.enabled !== "boolean" || !("config" in candidate)) {
    return null;
  }

  return {
    enabled: candidate.enabled,
    config: candidate.config
  };
}

function parseEnabledPayload(body: unknown): { readonly enabled: boolean } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as { readonly enabled?: unknown };
  if (typeof candidate.enabled !== "boolean") {
    return null;
  }

  return {
    enabled: candidate.enabled
  };
}

function sendOverlayModuleError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof UnknownOverlayModuleError) {
    return sendHttpError(reply, 404, {
      code: "OVERLAY_MODULE_NOT_FOUND",
      message: error.message,
      moduleId: error.moduleId
    });
  }

  if (error instanceof InvalidOverlayModuleConfigError) {
    return sendHttpError(reply, 400, {
      code: "INVALID_OVERLAY_MODULE_CONFIG",
      message: error.message,
      moduleId: error.moduleId
    });
  }

  throw error;
}
