import { pearConfigurationSchema } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PearPairingService } from "../../modules/music/pear-pairing-service.js";
import { sendHttpError } from "../errors.js";
import { readParam } from "./management-route-errors.js";

export interface MusicManagementRouteDependencies {
  readonly pairing: Pick<PearPairingService, "begin" | "get" | "cancel">;
  readonly preHandlers: preHandlerHookHandler[];
}

export function registerMusicManagementRoutes(app: FastifyInstance, dependencies: MusicManagementRouteDependencies): void {
  const preHandler = dependencies.preHandlers;
  app.post("/management/music/pairing", { preHandler }, async (request, reply) => {
    const config = pearConfigurationSchema.parse(request.body);
    return reply.status(202).send(await dependencies.pairing.begin(config));
  });
  app.get("/management/music/pairing/:attemptId", { preHandler }, async (request, reply) => {
    try { return dependencies.pairing.get(readParam(request.params, "attemptId")); }
    catch { return sendHttpError(reply, 404, { code: "MUSIC_PAIRING_NOT_FOUND", message: "Music pairing attempt was not found" }); }
  });
  app.delete("/management/music/pairing/:attemptId", { preHandler }, async (request, reply) => {
    try { await dependencies.pairing.cancel(readParam(request.params, "attemptId")); }
    catch { return sendHttpError(reply, 404, { code: "MUSIC_PAIRING_NOT_FOUND", message: "Music pairing attempt was not found" }); }
    return reply.status(204).send();
  });
}
