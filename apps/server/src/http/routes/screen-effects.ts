import { screenEffectDocumentSchema, screenEffectSetInputSchema, ScreenEffectSetError } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  EffectBindingUnavailableError,
  EffectDefinitionConflictError,
  EffectDefinitionNotFoundError,
  EffectLiveImpactConfirmationRequiredError,
  type EffectManagementService,
  EffectTestDisabledError,
  EffectTestVariantUnavailableError
} from "../../modules/screen-effects/effect-management-service.js";
import { sendHttpError } from "../errors.js";

export interface ScreenEffectRouteDependencies {
  readonly effectSets?: Pick<EffectManagementService, "listSets" | "createSet" | "renameSet" | "activateSet" | "removeSet">;
  readonly effectManagementService: Pick<
    EffectManagementService,
    "list" | "get" | "create" | "update" | "remove" | "test"
  >;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerScreenEffectRoutes(
  app: FastifyInstance,
  dependencies: ScreenEffectRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  const sets = dependencies.effectSets;
  if (sets !== undefined) {
    app.get("/screen-effect-sets", { preHandler }, async () => sets.listSets());
    app.post("/screen-effect-sets", { preHandler }, async (request, reply) => {
      try {
        const body = readObject(request.body, ["id", "name", "sourceId"]);
        const input = screenEffectSetInputSchema.parse({ id: body.id, name: body.name });
        const sourceId = body.sourceId === undefined ? undefined : parseEffectId(body.sourceId);
        return reply.status(201).send(await sets.createSet(input, sourceId));
      } catch (error) { return sendScreenEffectError(reply, error); }
    });
    app.put("/screen-effect-sets/:effectId", { preHandler }, async (request, reply) => {
      try {
        const body = readObject(request.body, ["name"]);
        const input = screenEffectSetInputSchema.parse({ id: readEffectId(request.params), name: body.name });
        return await sets.renameSet(input.id, input.name);
      } catch (error) { return sendScreenEffectError(reply, error); }
    });
    app.post("/screen-effect-sets/:effectId/activate", { preHandler }, async (request, reply) => {
      try {
        const body = readObject(request.body, ["confirmLiveImpact"]);
        await sets.activateSet(readEffectId(request.params), body.confirmLiveImpact === true);
        return reply.status(204).send();
      } catch (error) { return sendScreenEffectError(reply, error); }
    });
    app.delete("/screen-effect-sets/:effectId", { preHandler }, async (request, reply) => {
      try {
        await sets.removeSet(readEffectId(request.params));
        return reply.status(204).send();
      } catch (error) { return sendScreenEffectError(reply, error); }
    });
  }

  app.get("/screen-effects", { preHandler }, async () => dependencies.effectManagementService.list());

  app.get("/screen-effects/:effectId", { preHandler }, async (request, reply) => {
    try {
      return await dependencies.effectManagementService.get(readEffectId(request.params));
    } catch (error) {
      return sendScreenEffectError(reply, error);
    }
  });

  app.post("/screen-effects", { preHandler }, async (request, reply) => {
    try {
      const document = screenEffectDocumentSchema.parse(request.body);
      const query = readObject(request.query, ["set"]);
      const setId = query.set === undefined ? undefined : parseEffectId(query.set);
      return reply.status(201).send(await dependencies.effectManagementService.create(document, setId));
    } catch (error) {
      return sendScreenEffectError(reply, error);
    }
  });

  app.put("/screen-effects/:effectId", { preHandler }, async (request, reply) => {
    try {
      const input = parseUpdateRequest(request.body);
      return await dependencies.effectManagementService.update(
        readEffectId(request.params),
        input.document,
        input.confirmLiveImpact
      );
    } catch (error) {
      return sendScreenEffectError(reply, error);
    }
  });

  app.delete("/screen-effects/:effectId", { preHandler }, async (request, reply) => {
    try {
      await dependencies.effectManagementService.remove(readEffectId(request.params));
      return reply.status(204).send();
    } catch (error) {
      return sendScreenEffectError(reply, error);
    }
  });

  app.post("/screen-effects/:effectId/test", { preHandler }, async (request, reply) => {
    try {
      const input = parseTestRequest(request.body);
      return await dependencies.effectManagementService.test(
        readEffectId(request.params),
        input.variantId,
        input.confirmLiveImpact
      );
    } catch (error) {
      return sendScreenEffectError(reply, error);
    }
  });
}

function readEffectId(params: unknown): string {
  return parseEffectId((params as { readonly effectId?: unknown }).effectId);
}

function parseUpdateRequest(body: unknown): {
  readonly document: ReturnType<typeof screenEffectDocumentSchema.parse>;
  readonly confirmLiveImpact: boolean;
} {
  const input = readObject(body, ["document", "confirmLiveImpact"]);
  return {
    document: screenEffectDocumentSchema.parse(input.document),
    confirmLiveImpact: input.confirmLiveImpact === true
  };
}

function parseTestRequest(body: unknown): { readonly variantId: string; readonly confirmLiveImpact: true } {
  const input = readObject(body, ["variantId", "confirmLiveImpact"]);
  if (input.confirmLiveImpact !== true) throw new TypeError("Live test confirmation is required");
  return { variantId: parseEffectId(input.variantId), confirmLiveImpact: true };
}

function parseEffectId(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a Screen Effect ID");
  const parsed = value.trim();
  if (parsed.length === 0 || parsed.length > 120 || !/^[A-Za-z0-9_-]+$/u.test(parsed)) {
    throw new TypeError("Invalid Screen Effect ID");
  }
  return parsed;
}

function readObject(body: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new TypeError("Expected an object request body");
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new TypeError("Unexpected Screen Effect request field");
  }
  return value;
}

function sendScreenEffectError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof ScreenEffectSetError) {
    return sendHttpError(reply, 409, { code: "SCREEN_EFFECT_SET_CONFLICT", message: error.message });
  }
  if (error instanceof EffectDefinitionNotFoundError) {
    return sendHttpError(reply, 404, { code: "SCREEN_EFFECT_NOT_FOUND", message: error.message });
  }
  if (error instanceof EffectDefinitionConflictError) {
    return sendHttpError(reply, 409, { code: "SCREEN_EFFECT_ID_CONFLICT", message: error.message });
  }
  if (error instanceof EffectLiveImpactConfirmationRequiredError) {
    return sendHttpError(reply, 409, {
      code: "SCREEN_EFFECT_LIVE_IMPACT_CONFIRMATION_REQUIRED",
      message: error.message
    });
  }
  if (error instanceof EffectBindingUnavailableError) {
    return sendHttpError(reply, 409, { code: "SCREEN_EFFECT_BINDING_UNAVAILABLE", message: error.message });
  }
  if (error instanceof EffectTestDisabledError) {
    return sendHttpError(reply, 409, { code: "SCREEN_EFFECT_DISABLED", message: error.message });
  }
  if (error instanceof EffectTestVariantUnavailableError) {
    return sendHttpError(reply, 409, {
      code: "SCREEN_EFFECT_VARIANT_UNAVAILABLE",
      message: error.message
    });
  }
  if (error instanceof Error && /^Screen Effect (visual asset|sound asset|audio route)/u.test(error.message)) {
    return sendHttpError(reply, 409, {
      code: "SCREEN_EFFECT_REFERENCE_UNAVAILABLE",
      message: error.message
    });
  }
  if (error instanceof TypeError || (error instanceof Error && error.name === "ZodError")) {
    return sendHttpError(reply, 400, {
      code: "INVALID_SCREEN_EFFECT_REQUEST",
      message: "Invalid Screen Effect request"
    });
  }
  throw error;
}
