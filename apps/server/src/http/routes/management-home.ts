import { homeSetupSummarySchema } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ManagementOverviewService } from "../../modules/providers/management-overview-service.js";

export interface ManagementHomeRouteDependencies {
  readonly overview: Pick<ManagementOverviewService, "getHomeSetupSummary">;
  readonly preHandlers: preHandlerHookHandler[];
}

export function registerManagementHomeRoutes(
  app: FastifyInstance,
  dependencies: ManagementHomeRouteDependencies
): void {
  app.get("/management/home", { preHandler: dependencies.preHandlers }, async () =>
    homeSetupSummarySchema.parse(await dependencies.overview.getHomeSetupSummary())
  );
}
