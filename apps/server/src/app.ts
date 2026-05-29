import Fastify, { type FastifyInstance } from "fastify";
import { registerConfigRoutes, type ServerConfigRouteDependencies } from "./http/routes/config.js";
import { registerHealthRoutes, type ServerAppMetadata } from "./http/routes/health.js";
import {
  registerManagementSessionRoutes,
  type ManagementSessionRouteDependencies
} from "./http/routes/management-session.js";

export interface ServerAppDependencies
  extends Partial<ServerConfigRouteDependencies>,
    Partial<ManagementSessionRouteDependencies> {
  readonly metadata: ServerAppMetadata;
}

export function createServerApp(dependencies: ServerAppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  registerHealthRoutes(app, dependencies.metadata);
  if (dependencies.managementSessionService !== undefined) {
    if (dependencies.managementRateLimitPreHandler === undefined) {
      throw new Error("Management session routes require a rate-limit hook");
    }

    registerManagementSessionRoutes(app, {
      managementSessionService: dependencies.managementSessionService,
      managementRateLimitPreHandler: dependencies.managementRateLimitPreHandler
    });
  }

  if (dependencies.serverConfigService !== undefined) {
    if (!hasConfigRouteProtection(dependencies)) {
      throw new Error("Config routes require management auth and rate-limit hooks");
    }

    registerConfigRoutes(app, dependencies);
  }

  return app;
}

function hasConfigRouteProtection(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & ServerConfigRouteDependencies {
  return (
    dependencies.managementAuthPreHandler !== undefined && dependencies.managementRateLimitPreHandler !== undefined
  );
}
