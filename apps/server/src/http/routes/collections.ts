import {
  AlertCollectionNotFoundError,
  LastActiveAlertCollectionError,
  type AlertService,
  createAlertCollectionInputSchema,
  updateAlertCollectionInputSchema
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface AlertCollectionRouteDependencies {
  readonly alertService: AlertService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerAlertCollectionRoutes(
  app: FastifyInstance,
  dependencies: AlertCollectionRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/alert-collections", { preHandler }, async () => dependencies.alertService.listCollections());

  app.post("/alert-collections", { preHandler }, async (request, reply) => {
    try {
      const collection = await dependencies.alertService.createCollection(
        createAlertCollectionInputSchema.parse(request.body)
      );
      return reply.status(201).send(collection);
    } catch (error) {
      return sendCollectionError(reply, error);
    }
  });

  app.put("/alert-collections/:collectionId", { preHandler }, async (request, reply) => {
    try {
      return await dependencies.alertService.updateCollection(
        readCollectionId(request.params),
        updateAlertCollectionInputSchema.parse(request.body)
      );
    } catch (error) {
      return sendCollectionError(reply, error);
    }
  });

  app.patch("/alert-collections/:collectionId/enabled", { preHandler }, async (request, reply) => {
    const payload = parseEnabledPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_ALERT_COLLECTION_ENABLED_REQUEST",
        message: "Invalid alert collection enabled request"
      });
    }

    try {
      return await dependencies.alertService.setCollectionEnabled(readCollectionId(request.params), payload.enabled);
    } catch (error) {
      return sendCollectionError(reply, error);
    }
  });

  app.delete("/alert-collections/:collectionId", { preHandler }, async (request, reply) => {
    try {
      await dependencies.alertService.deleteCollection(readCollectionId(request.params));
      return reply.status(204).send();
    } catch (error) {
      return sendCollectionError(reply, error);
    }
  });
}

function readCollectionId(params: unknown): string {
  return String((params as { readonly collectionId?: string }).collectionId ?? "");
}

function parseEnabledPayload(body: unknown): { readonly enabled: boolean } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as { readonly enabled?: unknown };
  return typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : null;
}

function sendCollectionError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (isZodError(error)) {
    return sendHttpError(reply, 400, {
      code: "INVALID_ALERT_COLLECTION_REQUEST",
      message: "Invalid alert collection request"
    });
  }

  if (error instanceof AlertCollectionNotFoundError) {
    return sendHttpError(reply, 404, {
      code: "ALERT_COLLECTION_NOT_FOUND",
      message: error.message
    });
  }

  if (error instanceof LastActiveAlertCollectionError) {
    return sendHttpError(reply, 409, {
      code: "LAST_ACTIVE_ALERT_COLLECTION",
      message: error.message
    });
  }

  throw error;
}

function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}
