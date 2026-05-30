import type { PlaybackQueueSnapshot } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("playback routes", () => {
  it("returns a protected playback snapshot", async () => {
    const { app, authHeaders } = await createAppWithPlayback();

    const response = await app.inject({
      method: "GET",
      url: "/playback",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      current: null,
      queued: [],
      recent: [],
      paused: false,
      muted: false,
      doNotDisturb: false
    });
  });

  it("delegates protected playback controls", async () => {
    const { app, playbackCoordinator, authHeaders } = await createAppWithPlayback();

    expect((await app.inject({ method: "POST", url: "/playback/pause", headers: authHeaders })).json()).toMatchObject({ paused: true });
    expect((await app.inject({ method: "POST", url: "/playback/resume", headers: authHeaders })).json()).toMatchObject({ paused: false });
    expect((await app.inject({ method: "POST", url: "/playback/mute", headers: authHeaders })).json()).toMatchObject({ muted: true });
    expect((await app.inject({ method: "POST", url: "/playback/unmute", headers: authHeaders })).json()).toMatchObject({ muted: false });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/playback/do-not-disturb",
          headers: authHeaders,
          payload: { enabled: true }
        })
      ).json()
    ).toMatchObject({ doNotDisturb: true });
    expect((await app.inject({ method: "POST", url: "/playback/skip", headers: authHeaders })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/playback/replay",
          headers: authHeaders,
          payload: { itemId: "recent-1" }
        })
      ).statusCode
    ).toBe(200);

    expect(playbackCoordinator.calls).toEqual([
      "pause",
      "resume",
      "mute",
      "unmute",
      "do-not-disturb:true",
      "skip",
      "replay:recent-1"
    ]);
  });

  it("rejects invalid playback control payloads", async () => {
    const { app, authHeaders } = await createAppWithPlayback();

    const doNotDisturb = await app.inject({
      method: "POST",
      url: "/playback/do-not-disturb",
      headers: authHeaders,
      payload: { enabled: "yes" }
    });
    const replay = await app.inject({
      method: "POST",
      url: "/playback/replay",
      headers: authHeaders,
      payload: { itemId: "" }
    });

    expect(doNotDisturb.statusCode).toBe(400);
    expect(doNotDisturb.json()).toEqual({
      error: {
        code: "INVALID_PLAYBACK_DO_NOT_DISTURB_REQUEST",
        message: "Invalid playback do-not-disturb request"
      }
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual({
      error: {
        code: "INVALID_PLAYBACK_REPLAY_REQUEST",
        message: "Invalid playback replay request"
      }
    });
  });

  it("returns 404 for unknown replay items", async () => {
    const { app, authHeaders } = await createAppWithPlayback();

    const response = await app.inject({
      method: "POST",
      url: "/playback/replay",
      headers: authHeaders,
      payload: { itemId: "missing" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "PLAYBACK_QUEUE_ITEM_NOT_FOUND",
        message: "Playback queue item \"missing\" was not found"
      }
    });
  });

  it("rejects missing management sessions before mutating playback state", async () => {
    const { app, playbackCoordinator } = await createAppWithPlayback();

    const response = await app.inject({
      method: "POST",
      url: "/playback/pause"
    });

    expect(response.statusCode).toBe(401);
    expect(playbackCoordinator.calls).toEqual([]);
  });
});

async function createAppWithPlayback() {
  const playbackCoordinator = new RecordingPlaybackCoordinator();
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => "mgmt_playback-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    playbackCoordinator,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    playbackCoordinator,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

class RecordingPlaybackCoordinator {
  calls: string[] = [];
  snapshot: PlaybackQueueSnapshot = {
    current: null,
    queued: [],
    recent: [],
    paused: false,
    muted: false,
    doNotDisturb: false
  };

  getSnapshot(): PlaybackQueueSnapshot {
    return this.snapshot;
  }

  pause(): PlaybackQueueSnapshot {
    this.calls.push("pause");
    this.snapshot = { ...this.snapshot, paused: true };
    return this.snapshot;
  }

  resume(): PlaybackQueueSnapshot {
    this.calls.push("resume");
    this.snapshot = { ...this.snapshot, paused: false };
    return this.snapshot;
  }

  mute(): PlaybackQueueSnapshot {
    this.calls.push("mute");
    this.snapshot = { ...this.snapshot, muted: true };
    return this.snapshot;
  }

  unmute(): PlaybackQueueSnapshot {
    this.calls.push("unmute");
    this.snapshot = { ...this.snapshot, muted: false };
    return this.snapshot;
  }

  setDoNotDisturb(enabled: boolean): PlaybackQueueSnapshot {
    this.calls.push(`do-not-disturb:${enabled}`);
    this.snapshot = { ...this.snapshot, doNotDisturb: enabled };
    return this.snapshot;
  }

  skipCurrent(): PlaybackQueueSnapshot {
    this.calls.push("skip");
    return this.snapshot;
  }

  replayRecent(itemId: string): PlaybackQueueSnapshot {
    if (itemId === "missing") {
      const error = new Error('Playback queue item "missing" was not found');
      error.name = "PlaybackQueueItemNotFoundError";
      throw error;
    }

    this.calls.push(`replay:${itemId}`);
    return this.snapshot;
  }
}
