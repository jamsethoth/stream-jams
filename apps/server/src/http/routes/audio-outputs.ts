import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AudioOutputService } from "../../modules/audio/audio-output-service.js";
import { AudioOutputError } from "../../modules/audio/audio-output-error.js";
import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";

export interface AudioOutputRouteDependencies {
  readonly audioOutputService: AudioOutputService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerAudioOutputRoutes(app: FastifyInstance, dependencies: AudioOutputRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  const service = dependencies.audioOutputService;
  app.get("/audio/routes", { preHandler }, () => ({ routes: service.listRoutes() }));
  app.get("/audio/devices", { preHandler }, () => service.getDevices());
  app.get("/audio/status", { preHandler }, () => service.getStatus());
  app.post("/audio/routes", { preHandler }, async (request, reply) => {
    const route = await mutation(() => service.createRoute(request.body));
    return reply.status(201).send(route);
  });
  app.patch<{ Params: { routeId: string } }>("/audio/routes/:routeId", { preHandler }, request =>
    mutation(() => service.updateRoute(request.params.routeId, request.body)));
  app.delete<{ Params: { routeId: string } }>("/audio/routes/:routeId", { preHandler }, async (request, reply) => {
    await mutation(() => service.deleteRoute(request.params.routeId));
    return reply.status(204).send();
  });
  app.post<{ Params: { routeId: string } }>("/audio/routes/:routeId/test", { preHandler }, request =>
    mutation(() => service.testRoute(request.params.routeId, request.body)));
  app.post("/audio/retry", { preHandler }, async (request, reply) => {
    if (!isEmptyBody(request.body)) {
      throw new AudioOutputError(400, "INVALID_AUDIO_RETRY_INPUT", "The audio retry request is invalid.", "Remove unsupported request fields and retry.");
    }
    await mutation(() => service.retry());
    return reply.status(204).send();
  });
}

function isEmptyBody(candidate: unknown): boolean {
  return candidate === undefined || (
    typeof candidate === "object" && candidate !== null && !Array.isArray(candidate) && Object.keys(candidate).length === 0
  );
}

async function mutation<T>(work: () => T | Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof RuntimeMaintenanceUnavailableError) throw new AudioOutputError(409, "AUDIO_MAINTENANCE_ACTIVE", "Audio changes and tests are temporarily unavailable during maintenance or shutdown.", "Wait for maintenance to finish or restart the app, then retry.");
    throw error;
  }
}
