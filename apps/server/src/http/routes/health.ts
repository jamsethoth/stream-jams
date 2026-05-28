import type { FastifyInstance } from "fastify";

export interface ServerAppMetadata {
  readonly appName: "stream-jams";
  readonly version: string;
}

export function registerHealthRoutes(app: FastifyInstance, metadata: ServerAppMetadata): void {
  app.get("/health", async () => ({
    status: "ok" as const,
    app: metadata.appName,
    version: metadata.version
  }));
}
