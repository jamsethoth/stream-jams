import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  PortUnavailableError,
  ServerConfigValidationError,
  type ServerConfigService
} from "../../config/server-config-service.js";
import { sendHttpError } from "../errors.js";

export interface ServerConfigRouteDependencies {
  readonly serverConfigService: Pick<ServerConfigService, "getServerConfig" | "updateServerConfig">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerConfigRoutes(app: FastifyInstance, dependencies: ServerConfigRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/config/server", { preHandler }, async () => dependencies.serverConfigService.getServerConfig());

  app.patch(
    "/config/server",
    {
      preHandler
    },
    async (request, reply) => {
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
    }
  );
}
