import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { TwitchEventSubRuntimeService } from "../../modules/twitch/twitch-eventsub-runtime-service.js";

export interface TwitchEventSubRouteDependencies {
  readonly twitchEventSubStatusService: Pick<TwitchEventSubRuntimeService, "getStatus">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerTwitchEventSubRoutes(app: FastifyInstance, dependencies: TwitchEventSubRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/twitch/eventsub/status", { preHandler }, async () => dependencies.twitchEventSubStatusService.getStatus());
}
