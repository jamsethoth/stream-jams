import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { EventIngestionService } from "../../modules/events/event-ingestion-service.js";

export interface TwitchEventSubRouteDependencies {
  readonly twitchEventIngestionService: Pick<EventIngestionService, "getStatus">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerTwitchEventSubRoutes(app: FastifyInstance, dependencies: TwitchEventSubRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/twitch/eventsub/status", { preHandler }, async () => dependencies.twitchEventIngestionService.getStatus());
}
