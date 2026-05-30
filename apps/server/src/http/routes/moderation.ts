import {
  InvalidModerationSettingsError,
  type ModerationService,
  type ModerationSettingsUpdate
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface ModerationRouteDependencies {
  readonly moderationService: Pick<ModerationService, "getSettings" | "updateSettings">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerModerationRoutes(app: FastifyInstance, dependencies: ModerationRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/moderation/settings", { preHandler }, async () => dependencies.moderationService.getSettings());

  app.patch("/moderation/settings", { preHandler }, async (request, reply) => {
    try {
      return dependencies.moderationService.updateSettings(parseSettingsUpdate(request.body));
    } catch (error) {
      if (error instanceof InvalidModerationSettingsError) {
        return sendHttpError(reply, 400, {
          code: error.code,
          message: error.message
        });
      }

      throw error;
    }
  });
}

function parseSettingsUpdate(body: unknown): ModerationSettingsUpdate {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InvalidModerationSettingsError();
  }

  const candidate = body as ModerationSettingsUpdate;
  return {
    renderedText:
      candidate.renderedText === undefined ? undefined : parseTargetSettingsUpdate(candidate.renderedText),
    ttsText: candidate.ttsText === undefined ? undefined : parseTargetSettingsUpdate(candidate.ttsText)
  };
}

function parseTargetSettingsUpdate(value: unknown): NonNullable<ModerationSettingsUpdate["renderedText"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidModerationSettingsError();
  }

  const candidate = value as NonNullable<ModerationSettingsUpdate["renderedText"]>;
  return {
    maxLength: candidate.maxLength,
    blockedTerms: candidate.blockedTerms,
    stripUrls: candidate.stripUrls
  };
}
