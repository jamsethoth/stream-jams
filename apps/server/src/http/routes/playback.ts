import { PlaybackQueueItemNotFoundError, type PlaybackQueueSnapshot } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface PlaybackRouteCoordinator {
  getSnapshot(): PlaybackQueueSnapshot;
  pause(): PlaybackQueueSnapshot;
  resume(): PlaybackQueueSnapshot;
  mute(): PlaybackQueueSnapshot;
  unmute(): PlaybackQueueSnapshot;
  setDoNotDisturb(enabled: boolean): PlaybackQueueSnapshot;
  skipCurrent(): PlaybackQueueSnapshot;
  replayRecent(itemId: string): PlaybackQueueSnapshot;
}

export interface PlaybackRouteDependencies {
  readonly playbackCoordinator: PlaybackRouteCoordinator;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

export function registerPlaybackRoutes(app: FastifyInstance, dependencies: PlaybackRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];

  app.get("/playback", { preHandler }, async () => dependencies.playbackCoordinator.getSnapshot());
  app.post("/playback/pause", { preHandler }, async () => dependencies.playbackCoordinator.pause());
  app.post("/playback/resume", { preHandler }, async () => dependencies.playbackCoordinator.resume());
  app.post("/playback/mute", { preHandler }, async () => dependencies.playbackCoordinator.mute());
  app.post("/playback/unmute", { preHandler }, async () => dependencies.playbackCoordinator.unmute());
  app.post("/playback/skip", { preHandler }, async () => dependencies.playbackCoordinator.skipCurrent());
  app.post("/playback/do-not-disturb", { preHandler }, async (request, reply) => {
    const payload = parseDoNotDisturbPayload(request.body);
    if (payload === null) {
      return sendHttpError(reply, 400, {
        code: "INVALID_PLAYBACK_DO_NOT_DISTURB_REQUEST",
        message: "Invalid playback do-not-disturb request"
      });
    }

    return dependencies.playbackCoordinator.setDoNotDisturb(payload.enabled);
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
      return dependencies.playbackCoordinator.replayRecent(payload.itemId);
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
