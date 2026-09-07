import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { DesktopConfigError, type DesktopConfigService } from "../../config/desktop-config-service.js";
import { sendHttpError } from "../errors.js";

export interface DesktopConfigRouteDependencies {
  readonly desktopConfigService: DesktopConfigService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerDesktopConfigRoutes(app: FastifyInstance, dependencies: DesktopConfigRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  app.get("/config/desktop", { preHandler }, () => dependencies.desktopConfigService.getConfig());
  app.patch("/config/desktop", { preHandler }, async (request, reply) => {
    try { return await dependencies.desktopConfigService.updateConfig(request.body); }
    catch (error) {
      if (error instanceof DesktopConfigError) return sendHttpError(reply, error.statusCode, { code: error.code, message: error.message });
      throw error;
    }
  });
}
