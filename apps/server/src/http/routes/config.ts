import type { FastifyInstance } from "fastify";
import {
  PortUnavailableError,
  ServerConfigValidationError,
  type ServerConfigService
} from "../../config/server-config-service.js";
import { sendHttpError } from "../errors.js";

export interface ServerConfigRouteDependencies {
  readonly serverConfigService: Pick<ServerConfigService, "getServerConfig" | "updateServerConfig">;
}

export function registerConfigRoutes(app: FastifyInstance, dependencies: ServerConfigRouteDependencies): void {
  app.get("/config/server", async () => dependencies.serverConfigService.getServerConfig());

  app.patch("/config/server", async (request, reply) => {
    try {
      return await dependencies.serverConfigService.updateServerConfig(request.body ?? {});
    } catch (error) {
      if (error instanceof ServerConfigValidationError) {
        return sendHttpError(reply, 400, {
          code: error.code,
          message: error.message
        });
      }

      if (error instanceof PortUnavailableError) {
        return sendHttpError(reply, 409, {
          code: error.code,
          message: error.message,
          host: error.host,
          port: error.port
        });
      }

      throw error;
    }
  });
}
