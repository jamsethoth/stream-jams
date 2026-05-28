import Fastify, { type FastifyInstance } from "fastify";
import { registerConfigRoutes, type ServerConfigRouteDependencies } from "./http/routes/config.js";
import { registerHealthRoutes, type ServerAppMetadata } from "./http/routes/health.js";

export interface ServerAppDependencies extends Partial<ServerConfigRouteDependencies> {
  readonly metadata: ServerAppMetadata;
}

export function createServerApp(dependencies: ServerAppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  registerHealthRoutes(app, dependencies.metadata);
  if (dependencies.serverConfigService !== undefined) {
    registerConfigRoutes(app, {
      serverConfigService: dependencies.serverConfigService
    });
  }

  return app;
}
