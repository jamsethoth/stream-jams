import { PlaybackQueueItemNotFoundError, type Logger, type PlaybackQueueSnapshot } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface PlaybackRouteCoordinator {
  getSnapshot(): PlaybackQueueSnapshot;
  pause(): Promise<PlaybackQueueSnapshot>;
  resume(): Promise<PlaybackQueueSnapshot>;
  mute(): Promise<PlaybackQueueSnapshot>;
  unmute(): Promise<PlaybackQueueSnapshot>;
  setDoNotDisturb(enabled: boolean): Promise<PlaybackQueueSnapshot>;
  skipCurrent(): PlaybackQueueSnapshot;
  replayRecent(itemId: string): PlaybackQueueSnapshot;
}

export interface PlaybackRouteDependencies {
  readonly playbackCoordinator: PlaybackRouteCoordinator;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly runtimeLogger?: Logger | undefined;
}

export function registerPlaybackRoutes(app: FastifyInstance, dependencies: PlaybackRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/playback", { preHandler }, async () => dependencies.playbackCoordinator.getSnapshot());
  app.post("/playback/pause", { preHandler }, async (request) => {
    const snapshot = await dependencies.playbackCoordinator.pause();
    await logPlaybackTransition(dependencies, request.id, "pause");
    return snapshot;
  });
  app.post("/playback/resume", { preHandler }, async (request) => {
    const snapshot = await dependencies.playbackCoordinator.resume();
    await logPlaybackTransition(dependencies, request.id, "resume");
    return snapshot;
  });
  app.post("/playback/mute", { preHandler }, async (request) => {
    const snapshot = await dependencies.playbackCoordinator.mute();
    await logPlaybackTransition(dependencies, request.id, "mute");
    return snapshot;
  });
  app.post("/playback/unmute", { preHandler }, async (request) => {
    const snapshot = await dependencies.playbackCoordinator.unmute();
    await logPlaybackTransition(dependencies, request.id, "unmute");
    return snapshot;
  });
  app.post("/playback/skip", { preHandler }, async (request) => {
    const snapshot = dependencies.playbackCoordinator.skipCurrent();
    await logPlaybackTransition(dependencies, request.id, "skip");
    return snapshot;
  });
  app.post("/playback/do-not-disturb", { preHandler }, async (request, reply) => {
    const payload = parseDoNotDisturbPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_PLAYBACK_DO_NOT_DISTURB_REQUEST",
        message: "Invalid playback do-not-disturb request"
      });
    }

    const snapshot = await dependencies.playbackCoordinator.setDoNotDisturb(payload.enabled);
    await logPlaybackTransition(dependencies, request.id, "do-not-disturb", { enabled: payload.enabled });
    return snapshot;
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
      const snapshot = dependencies.playbackCoordinator.replayRecent(payload.itemId);
      await logPlaybackTransition(dependencies, request.id, "replay", { itemId: payload.itemId });
      return snapshot;
    } catch (error) {
      if (isPlaybackQueueItemNotFoundError(error)) {
        return sendHttpError(reply, 404, {
          code: "PLAYBACK_QUEUE_ITEM_NOT_FOUND",
          message: error.message
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
