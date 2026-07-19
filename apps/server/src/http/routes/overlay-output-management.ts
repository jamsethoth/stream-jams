import type {
  CreateOverlayKeyInput,
  OverlayPurpose,
  OverlayScope,
  OverlayTargetProfileId
} from "@stream-jams/core";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import {
  UnknownOverlayOutputError,
  UnrecoverableOverlayRouteKeyError,
  type OverlayOutputManagementService
} from "../../modules/overlays/overlay-output-management-service.js";
import type { OverlayGateway } from "../../websocket/overlay-gateway.js";
import { sendHttpError } from "../errors.js";

export interface OverlayOutputManagementRouteDependencies {
  readonly overlayOutputManagementService: OverlayOutputManagementService;
  readonly overlayGateway: OverlayGateway;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerOverlayOutputManagementRoutes(
  app: FastifyInstance,
  dependencies: OverlayOutputManagementRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/management/overlay-outputs", { preHandler }, async (request) =>
    dependencies.overlayOutputManagementService.listOutputs(originFor(request))
  );

  app.post("/management/overlay-outputs/keys", { preHandler }, async (request, reply) => {
    const input = parseOutputInput(request.body);
    if (input === null) {
      return sendInvalidRequest(reply);
    }

    try {
      return await dependencies.overlayOutputManagementService.createKey(input, originFor(request));
    } catch (error) {
      return sendOverlayOutputError(reply, error);
    }
  });

  app.post("/management/overlay-outputs/keys/regenerate", { preHandler }, async (request, reply) => {
    const input = parseOutputInput(request.body);
    if (input === null) {
      return sendInvalidRequest(reply);
    }

    try {
      return await dependencies.overlayOutputManagementService.regenerateKey(input, originFor(request));
    } catch (error) {
      return sendOverlayOutputError(reply, error);
    }
  });

  app.delete("/management/overlay-outputs/keys/:keyId", { preHandler }, async (request, reply) => {
    const revoked = await dependencies.overlayOutputManagementService.revokeKey(readKeyId(request.params));
    if (revoked === null) {
      return sendHttpError(reply, 404, {
        code: "OVERLAY_ROUTE_KEY_NOT_FOUND",
        message: "Overlay route key not found"
      });
    }

    return reply.status(204).send();
  });

  app.get("/management/overlay-clients", { preHandler }, async () => dependencies.overlayGateway.clientStates);
}

function parseOutputInput(body: unknown): CreateOverlayKeyInput | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as {
    readonly overlayId?: unknown;
    readonly scope?: unknown;
    readonly moduleId?: unknown;
    readonly purpose?: unknown;
    readonly targetProfileId?: unknown;
  };
  const scope = parseScope(candidate.scope);
  const purpose = parsePurpose(candidate.purpose);
  const targetProfile = parseTargetProfile(candidate.targetProfileId);
  if (scope === null || purpose === null || !targetProfile.valid || (scope === "unified" && targetProfile.value !== null)) {
    return null;
  }

  return {
    overlayId: typeof candidate.overlayId === "string" && candidate.overlayId.trim() !== "" ? candidate.overlayId : "default",
    scope,
    purpose,
    moduleId: scope === "module" && typeof candidate.moduleId === "string" ? candidate.moduleId : null,
    targetProfileId: targetProfile.value
  };
}

function parseScope(value: unknown): OverlayScope | null {
  return value === "module" || value === "unified" ? value : null;
}

function parsePurpose(value: unknown): OverlayPurpose | null {
  return value === "live" || value === "test" ? value : null;
}

function parseTargetProfile(value: unknown): {
  readonly valid: boolean;
  readonly value: OverlayTargetProfileId | null;
} {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }

  return value === "landscape" || value === "vertical"
    ? { valid: true, value }
    : { valid: false, value: null };
}

function originFor(request: FastifyRequest): string {
  const host = request.headers.host ?? "127.0.0.1";
  return `http://${host}`;
}

function readKeyId(params: unknown): string {
  return String((params as { readonly keyId?: string }).keyId ?? "");
}

function sendInvalidRequest(reply: Parameters<typeof sendHttpError>[0]) {
  return sendHttpError(reply, 400, {
    code: "INVALID_OVERLAY_OUTPUT_REQUEST",
    message: "Invalid overlay output request"
  });
}

function sendOverlayOutputError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof UnknownOverlayOutputError) {
    return sendHttpError(reply, 404, {
      code: error.code,
      message: error.message
    });
  }

  if (error instanceof UnrecoverableOverlayRouteKeyError) {
    return sendHttpError(reply, 409, {
      code: error.code,
      message: error.message
    });
  }

  throw error;
}
