import {
  InvalidModerationSettingsError,
  type ModerationService,
  type ModerationPreviewInput,
  type ModerationTargetSettings,
  type ModerationSettingsUpdate
} from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";
import { sendHttpError } from "../errors.js";

export interface ModerationRouteDependencies {
  readonly moderationService: Pick<ModerationService, "getSettings" | "updateSettings" | "preview">;
  readonly runConfigurationMutation: <T>(work: () => T) => T;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerModerationRoutes(app: FastifyInstance, dependencies: ModerationRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/moderation/settings", { preHandler }, async () => dependencies.moderationService.getSettings());

  app.patch("/moderation/settings", { preHandler }, async (request, reply) => {
    try {
      return dependencies.runConfigurationMutation(
        () => dependencies.moderationService.updateSettings(parseSettingsUpdate(request.body))
      );
    } catch (error) {
      return sendModerationError(reply, error);
    }
  });

  app.post("/moderation/preview", { preHandler }, async (request, reply) => {
    try {
      return dependencies.moderationService.preview(parsePreviewInput(request.body));
    } catch (error) {
      return sendModerationError(reply, error);
    }
  });
}

function sendModerationError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof InvalidModerationSettingsError) {
    return sendHttpError(reply, 400, {
      code: error.code,
      message: error.message
    });
  }

  if (error instanceof RuntimeMaintenanceUnavailableError) {
    return sendHttpError(reply, 409, {
      code: "CONFIGURATION_MAINTENANCE_ACTIVE",
      message: "Configuration restore is active. Wait for it to finish, then save again."
    });
  }

  throw error;
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

  const candidate = value as { readonly maxLength?: unknown; readonly blockedTerms?: unknown; readonly stripUrls?: unknown };
  if (
    (Object.hasOwn(candidate, "maxLength") && (
      typeof candidate.maxLength !== "number"
      || !Number.isInteger(candidate.maxLength)
      || candidate.maxLength < 1
      || candidate.maxLength > 10_000
    ))
    || (Object.hasOwn(candidate, "blockedTerms") && (
      !Array.isArray(candidate.blockedTerms)
      || !candidate.blockedTerms.every((blockedTerm) => typeof blockedTerm === "string")
    ))
    || (Object.hasOwn(candidate, "stripUrls") && typeof candidate.stripUrls !== "boolean")
  ) {
    throw new InvalidModerationSettingsError();
  }

  return {
    maxLength: candidate.maxLength as number | undefined,
    blockedTerms: candidate.blockedTerms as readonly string[] | undefined,
    stripUrls: candidate.stripUrls as boolean | undefined
  };
}

function parsePreviewInput(body: unknown): ModerationPreviewInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InvalidModerationSettingsError();
  }

  const candidate = body as { readonly target?: unknown; readonly text?: unknown; readonly settings?: unknown };
  if ((candidate.target !== "rendered" && candidate.target !== "tts") || typeof candidate.text !== "string") {
    throw new InvalidModerationSettingsError();
  }

  return {
    target: candidate.target,
    text: candidate.text,
    settings: candidate.settings === undefined ? undefined : parseTargetSettings(candidate.settings)
  };
}

function parseTargetSettings(value: unknown): ModerationTargetSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidModerationSettingsError();
  }

  const candidate = value as { readonly maxLength?: unknown; readonly blockedTerms?: unknown; readonly stripUrls?: unknown };
  if (
    typeof candidate.maxLength !== "number"
    || !Number.isInteger(candidate.maxLength)
    || candidate.maxLength < 1
    || candidate.maxLength > 10_000
    || !Array.isArray(candidate.blockedTerms)
    || !candidate.blockedTerms.every((blockedTerm) => typeof blockedTerm === "string")
    || typeof candidate.stripUrls !== "boolean"
  ) {
    throw new InvalidModerationSettingsError();
  }

  return {
    maxLength: candidate.maxLength,
    blockedTerms: candidate.blockedTerms,
    stripUrls: candidate.stripUrls
  };
}
