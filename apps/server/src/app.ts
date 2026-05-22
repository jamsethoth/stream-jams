import Fastify, { type FastifyInstance } from "fastify";

export interface ServerAppDependencies {
  readonly appName: "stream-jams";
  readonly version: string;
}

export function createServerApp(
  dependencies: ServerAppDependencies = { appName: "stream-jams", version: "0.0.0" }
): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  app.get("/health", async () => ({
    status: "ok" as const,
    app: dependencies.appName,
    version: dependencies.version
  }));

  return app;
}
