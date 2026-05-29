import type { ManagementSessionService } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

export interface ManagementSessionRouteDependencies {
  readonly managementSessionService: Pick<ManagementSessionService, "createSession">;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerManagementSessionRoutes(
  app: FastifyInstance,
  dependencies: ManagementSessionRouteDependencies
): void {
  app.post(
    "/auth/management/sessions",
    {
      preHandler: dependencies.managementRateLimitPreHandler
    },
    async (_request, reply) => {
      const session = await dependencies.managementSessionService.createSession();
      return reply.status(201).send(session);
    }
  );
}
