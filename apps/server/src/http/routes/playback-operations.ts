import type { MergedOperationsSnapshot } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  PlaybackOperationsConflictError,
  UnknownPlaybackOwnerError
} from "../../modules/playback/playback-operations-service.js";
import { sendHttpError } from "../errors.js";

export interface PlaybackOperationsRouteService {
  getSnapshot(): MergedOperationsSnapshot;
  skip(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot>;
  remove(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot>;
  replay(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot>;
  clear(moduleId: string, expectedPendingCount: number, observedRevision: number): Promise<MergedOperationsSnapshot>;
  setModulePaused(moduleId: string, paused: boolean): Promise<MergedOperationsSnapshot>;
}

export interface PlaybackOperationsRouteDependencies {
  readonly playbackOperationsService: PlaybackOperationsRouteService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerPlaybackOperationsRoutes(
  app: FastifyInstance,
  dependencies: PlaybackOperationsRouteDependencies
): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  app.get("/playback/operations", { preHandler }, async () => dependencies.playbackOperationsService.getSnapshot());

  for (const action of ["skip", "remove", "replay"] as const) {
    app.post(`/playback/operations/:moduleId/:occurrenceId/${action}`, { preHandler }, async (request, reply) => {
      const identifiers = readIdentifiers(request.params);
      if (identifiers === null) return invalidRequest(reply);
      try {
        return await dependencies.playbackOperationsService[action](identifiers.moduleId, identifiers.occurrenceId);
      } catch (error) {
        return sendOperationsError(reply, error);
      }
    });
  }

  app.post("/playback/operations/:moduleId/clear", { preHandler }, async (request, reply) => {
    const moduleId = readModuleId(request.params);
    const payload = readClearPayload(request.body);
    if (moduleId === null || payload === null) return invalidRequest(reply);
    try {
      return await dependencies.playbackOperationsService.clear(
        moduleId,
        payload.expectedPendingCount,
        payload.observedRevision
      );
    } catch (error) {
      return sendOperationsError(reply, error);
    }
  });

  app.post("/playback/operations/:moduleId/pause", { preHandler }, async (request, reply) => {
    const moduleId = readModuleId(request.params);
    const paused = readPaused(request.body);
    if (moduleId === null || paused === null) return invalidRequest(reply);
    try {
      return await dependencies.playbackOperationsService.setModulePaused(moduleId, paused);
    } catch (error) {
      return sendOperationsError(reply, error);
    }
  });
}

function readIdentifiers(params: unknown): { readonly moduleId: string; readonly occurrenceId: string } | null {
  if (typeof params !== "object" || params === null) return null;
  const value = params as { readonly moduleId?: unknown; readonly occurrenceId?: unknown };
  return typeof value.moduleId === "string" && value.moduleId.trim() !== ""
    && typeof value.occurrenceId === "string" && value.occurrenceId.trim() !== ""
    ? { moduleId: value.moduleId, occurrenceId: value.occurrenceId }
    : null;
}

function readModuleId(params: unknown): string | null {
  if (typeof params !== "object" || params === null) return null;
  const value = (params as { readonly moduleId?: unknown }).moduleId;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readClearPayload(body: unknown): { readonly expectedPendingCount: number; readonly observedRevision: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as { readonly expectedPendingCount?: unknown; readonly observedRevision?: unknown };
  return Number.isSafeInteger(value.expectedPendingCount) && Number(value.expectedPendingCount) >= 0
    && Number.isSafeInteger(value.observedRevision) && Number(value.observedRevision) >= 0
    ? { expectedPendingCount: Number(value.expectedPendingCount), observedRevision: Number(value.observedRevision) }
    : null;
}

function readPaused(body: unknown): boolean | null {
  if (typeof body !== "object" || body === null) return null;
  const paused = (body as { readonly paused?: unknown }).paused;
  return typeof paused === "boolean" ? paused : null;
}

function invalidRequest(reply: Parameters<typeof sendHttpError>[0]) {
  return sendHttpError(reply, 400, {
    code: "INVALID_PLAYBACK_OPERATION_REQUEST",
    message: "Invalid playback operation request"
  });
}

function sendOperationsError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof UnknownPlaybackOwnerError) {
    return sendHttpError(reply, 404, {
      code: "PLAYBACK_MODULE_NOT_FOUND",
      message: error.message,
      moduleId: error.moduleId
    });
  }
  if (error instanceof PlaybackOperationsConflictError) {
    return reply.status(409).send({
      error: { code: "PLAYBACK_OPERATION_CONFLICT", message: error.message },
      snapshot: error.snapshot
    });
  }
  throw error;
}
