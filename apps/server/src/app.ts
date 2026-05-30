import Fastify, { type FastifyInstance } from "fastify";
import { registerConfigRoutes, type ServerConfigRouteDependencies } from "./http/routes/config.js";
import { registerHealthRoutes, type ServerAppMetadata } from "./http/routes/health.js";
import {
  registerManagementSessionRoutes,
  type ManagementSessionRouteDependencies
} from "./http/routes/management-session.js";
import { registerOverlayModuleRoutes, type OverlayModuleRouteDependencies } from "./http/routes/overlay-modules.js";

export interface ServerAppDependencies
  extends Partial<ServerConfigRouteDependencies>,
    Partial<ManagementSessionRouteDependencies>,
    Partial<OverlayModuleRouteDependencies> {
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

  if (dependencies.overlayModuleRegistry !== undefined || dependencies.overlayModuleConfigService !== undefined) {
    if (!hasOverlayModuleRouteDependencies(dependencies)) {
      throw new Error("Overlay module routes require registry, config service, management auth, and rate-limit hooks");
    }

    registerOverlayModuleRoutes(app, dependencies);
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

function hasOverlayModuleRouteDependencies(
  dependencies: ServerAppDependencies
): dependencies is ServerAppDependencies & OverlayModuleRouteDependencies {
  return (
    dependencies.overlayModuleRegistry !== undefined &&
    dependencies.overlayModuleConfigService !== undefined &&
    dependencies.managementAuthPreHandler !== undefined &&
    dependencies.managementRateLimitPreHandler !== undefined
  );
}
