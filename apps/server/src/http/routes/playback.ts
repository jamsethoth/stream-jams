import { PlaybackQueueItemNotFoundError, type Logger, type PlaybackQueueSnapshot } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { PlaybackOperationsConflictError } from "../../modules/playback/playback-operations-service.js";
import { sendHttpError } from "../errors.js";

export interface PlaybackRouteCoordinator {
  getSnapshot(): PlaybackQueueSnapshot;
}

export interface LegacyPlaybackOperationsService {
  setSafety(patch: Partial<Pick<PlaybackQueueSnapshot, "paused" | "muted" | "doNotDisturb">>): Promise<unknown>;
  skip(moduleId: "alerts", occurrenceId: string): Promise<unknown>;
  replay(moduleId: "alerts", occurrenceId: string): Promise<unknown>;
}

export interface PlaybackRouteDependencies {
  readonly playbackCoordinator: PlaybackRouteCoordinator;
  readonly legacyPlaybackOperationsService: LegacyPlaybackOperationsService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly runtimeLogger?: Logger | undefined;
}

export function registerPlaybackRoutes(app: FastifyInstance, dependencies: PlaybackRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/playback", { preHandler }, async () => dependencies.playbackCoordinator.getSnapshot());
  app.post("/playback/pause", { preHandler }, async (request) => {
    await dependencies.legacyPlaybackOperationsService.setSafety({ paused: true });
    await logPlaybackTransition(dependencies, request.id, "pause");
    return dependencies.playbackCoordinator.getSnapshot();
  });
  app.post("/playback/resume", { preHandler }, async (request) => {
    await dependencies.legacyPlaybackOperationsService.setSafety({ paused: false });
    await logPlaybackTransition(dependencies, request.id, "resume");
    return dependencies.playbackCoordinator.getSnapshot();
  });
  app.post("/playback/mute", { preHandler }, async (request) => {
    await dependencies.legacyPlaybackOperationsService.setSafety({ muted: true });
    await logPlaybackTransition(dependencies, request.id, "mute");
    return dependencies.playbackCoordinator.getSnapshot();
  });
  app.post("/playback/unmute", { preHandler }, async (request) => {
    await dependencies.legacyPlaybackOperationsService.setSafety({ muted: false });
    await logPlaybackTransition(dependencies, request.id, "unmute");
    return dependencies.playbackCoordinator.getSnapshot();
  });
  app.post("/playback/skip", { preHandler }, async (request) => {
    const current = dependencies.playbackCoordinator.getSnapshot().current;
    if (current !== null) await dependencies.legacyPlaybackOperationsService.skip("alerts", current.id);
    await logPlaybackTransition(dependencies, request.id, "skip");
    return dependencies.playbackCoordinator.getSnapshot();
  });
  app.post("/playback/do-not-disturb", { preHandler }, async (request, reply) => {
    const payload = parseDoNotDisturbPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_PLAYBACK_DO_NOT_DISTURB_REQUEST",
        message: "Invalid playback do-not-disturb request"
      });
    }

    await dependencies.legacyPlaybackOperationsService.setSafety({ doNotDisturb: payload.enabled });
    await logPlaybackTransition(dependencies, request.id, "do-not-disturb", { enabled: payload.enabled });
    return dependencies.playbackCoordinator.getSnapshot();
  });
  app.post("/playback/replay", { preHandler }, async (request, reply) => {
    const payload = parseReplayPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_PLAYBACK_REPLAY_REQUEST",
        message: "Invalid playback replay request"
      });
    }

    try {
      await dependencies.legacyPlaybackOperationsService.replay("alerts", payload.itemId);
      await logPlaybackTransition(dependencies, request.id, "replay", { itemId: payload.itemId });
      return dependencies.playbackCoordinator.getSnapshot();
    } catch (error) {
      if (isPlaybackQueueItemNotFoundError(error) || error instanceof PlaybackOperationsConflictError) {
        return sendHttpError(reply, 404, {
          code: "PLAYBACK_QUEUE_ITEM_NOT_FOUND",
          message: `Playback queue item "${payload.itemId}" was not found`
        });
      }

      throw error;
    }
  });
}

async function logPlaybackTransition(
  dependencies: PlaybackRouteDependencies,
  requestId: unknown,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await dependencies.runtimeLogger?.info("Playback transition requested", {
    module: "playback",
    source: "playback.transition",
    correlationId: String(requestId),
    processingId: null,
    metadata: {
      action,
      ...metadata
    }
  });
}

function parseDoNotDisturbPayload(body: unknown): { readonly enabled: boolean } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as { readonly enabled?: unknown };
  return typeof candidate.enabled === "boolean" ? { enabled: candidate.enabled } : null;
}

function parseReplayPayload(body: unknown): { readonly itemId: string } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as { readonly itemId?: unknown };
  return typeof candidate.itemId === "string" && candidate.itemId.trim() !== ""
    ? { itemId: candidate.itemId }
    : null;
}

function isPlaybackQueueItemNotFoundError(error: unknown): error is PlaybackQueueItemNotFoundError {
  return error instanceof PlaybackQueueItemNotFoundError || (error instanceof Error && error.name === "PlaybackQueueItemNotFoundError");
}
