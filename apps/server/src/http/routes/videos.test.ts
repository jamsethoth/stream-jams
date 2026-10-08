import Fastify, { type preHandlerHookHandler } from "fastify";
import { describe, expect, it } from "vitest";
import type { VideoQueueResponse } from "@stream-jams/core";
import { createAutomationSecurityPreHandler } from "../middleware/automation-security.js";
import { LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { VideoQueueConflictError } from "../../modules/videos/video-queue-repository.js";
import { VideoQueueCommandError } from "../../modules/videos/video-queue-service.js";
import type { VideoRequestContext, VideoRequestResult } from "../../modules/videos/video-request-intake.js";
import { registerVideoRoutes, type VideoRouteService } from "./videos.js";

const emptyResponse: VideoQueueResponse = { purpose: "live", revision: 3, queuePaused: false, runRemaining: 0, gapEndsAtEpochMs: null, serverTimeEpochMs: 0, mirror: { available: false }, items: [], current: null };

type Scope = "videos:read" | "videos:submit" | "videos:control";

function setup(options: { submitResult?: VideoRequestResult; commandError?: Error } = {}) {
  const calls: { kind: string; args: unknown[] }[] = [];
  const service: VideoRouteService = {
    response: purpose => { calls.push({ kind: "response", args: [purpose] }); return { ...emptyResponse, purpose }; },
    submit: async (purpose, input, context: VideoRequestContext) => {
      calls.push({ kind: "submit", args: [purpose, input, context] });
      return options.submitResult ?? { status: "accepted", item: { id: "item-1" } as never };
    },
    command: (purpose, revision, command) => {
      calls.push({ kind: "command", args: [purpose, revision, command] });
      if (options.commandError !== undefined) throw options.commandError;
      return emptyResponse;
    },
    control: (purpose, itemId, command) => { calls.push({ kind: "control", args: [purpose, itemId, command] }); return emptyResponse; }
  };
  const grants: Record<string, readonly Scope[]> = {
    reader: ["videos:read"],
    submitter: ["videos:read", "videos:submit"],
    controller: ["videos:read", "videos:submit", "videos:control"],
    timers: ["timers:read"] as unknown as Scope[]
  };
  const managementAuth: preHandlerHookHandler = async (request, reply) => {
    if (request.headers["x-management"] !== "yes") await reply.status(401).send({ error: { code: "UNAUTHORIZED" } });
  };
  const app = Fastify();
  registerVideoRoutes(app, {
    videos: service,
    managementAuthPreHandler: managementAuth,
    managementRateLimitPreHandler: async () => {},
    automationAuthPreHandler: createAutomationSecurityPreHandler({
      credentials: { verify: token => grants[token] === undefined ? null : { id: token, clientName: "Bot", scopes: grants[token], createdAt: new Date(0).toISOString(), revokedAt: null } as never },
      limiter: new LocalManagementRateLimiter({ maxRequests: 100, windowMs: 60_000 })
    })
  });
  return { app, calls };
}

const link = { link: "https://youtu.be/dQw4w9WgXcQ" };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("video routes", () => {
  it("requires management auth for the management queue", async () => {
    const { app, calls } = setup();
    expect((await app.inject({ method: "GET", url: "/videos/live" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/videos/live", headers: bearer("controller") })).statusCode).toBe(401);
    const response = await app.inject({ method: "GET", url: "/videos/test", headers: { "x-management": "yes" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ purpose: "test", revision: 3 });
    expect((await app.inject({ method: "GET", url: "/videos/staging", headers: { "x-management": "yes" } })).statusCode).toBe(400);
    expect(calls).toHaveLength(1);
    await app.close();
  });

  it("records operator submissions and lets management autoplay", async () => {
    const { app, calls } = setup();
    const response = await app.inject({ method: "POST", url: "/videos/live/requests?from=operator", headers: { "x-management": "yes" }, payload: link });
    expect(response.statusCode).toBe(201);
    expect(calls[0]?.args[2]).toEqual({ via: "operator", mayAutoplay: true });
    await app.inject({ method: "POST", url: "/videos/live/requests?from=automation", headers: { "x-management": "yes" }, payload: link });
    expect(calls[1]?.args[2]).toEqual({ via: "management", mayAutoplay: true });
    await app.close();
  });

  it("maps rejections to status codes without echoing the request", async () => {
    for (const [reason, status] of [["invalid-link", 422], ["module-disabled", 409], ["queue-full", 429]] as const) {
      const { app } = setup({ submitResult: { status: "rejected", reason, fields: ["link"] } });
      const response = await app.inject({ method: "POST", url: "/videos/live/requests", headers: { "x-management": "yes" }, payload: { link: "https://secret.example/x.mp4" } });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({ error: { code: "VIDEO_REQUEST_REJECTED", reason }, fields: ["link"] });
      expect(response.body).not.toContain("secret");
      await app.close();
    }
  });

  it("validates commands and maps conflicts and command errors", async () => {
    const { app, calls } = setup();
    const headers = { "x-management": "yes" };
    expect((await app.inject({ method: "POST", url: "/videos/live/commands", headers, payload: { expectedRevision: 3, command: { kind: "explode" } } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/videos/live/commands", headers, payload: { expectedRevision: 3, command: { kind: "skip", itemId: "x" } } })).statusCode).toBe(400);
    expect(calls).toHaveLength(0);
    expect((await app.inject({ method: "POST", url: "/videos/live/commands", headers, payload: { expectedRevision: 3, command: { kind: "play-all" } } })).statusCode).toBe(200);
    expect(calls[0]?.args).toEqual(["live", 3, { kind: "play-all" }]);
    await app.close();

    const conflict = setup({ commandError: new VideoQueueConflictError() });
    expect((await conflict.app.inject({ method: "POST", url: "/videos/live/commands", headers, payload: { expectedRevision: 1, command: { kind: "stop" } } })).json()).toMatchObject({ error: { code: "VIDEO_QUEUE_CONFLICT" } });
    await conflict.app.close();
    const rejected = setup({ commandError: new VideoQueueCommandError("not-playing", "Nothing is playing.") });
    const response = await rejected.app.inject({ method: "POST", url: "/videos/live/commands", headers, payload: { expectedRevision: 1, command: { kind: "play-next" } } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "VIDEO_QUEUE_COMMAND_REJECTED", reason: "not-playing" } });
    await rejected.app.close();
  });

  it("requires a position to seek and passes pause and resume through", async () => {
    const { app, calls } = setup();
    const headers = { "x-management": "yes" };
    expect((await app.inject({ method: "POST", url: "/videos/live/current/seek", headers, payload: { expectedItemId: "item-1" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/videos/live/current/rewind", headers, payload: { expectedItemId: "item-1" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/videos/live/current/seek", headers, payload: { expectedItemId: "item-1", positionMs: 5000 } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/videos/live/current/pause", headers, payload: { expectedItemId: "item-1" } })).statusCode).toBe(200);
    expect(calls.map(call => call.args)).toEqual([["live", "item-1", { kind: "seek", positionMs: 5000 }], ["live", "item-1", { kind: "pause" }]]);
    await app.close();
  });

  it("scopes automation reads, submissions and control", async () => {
    const { app, calls } = setup();
    const url = "/automation/v1/videos/live";
    expect((await app.inject({ method: "GET", url, headers: bearer("timers") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url, headers: { "x-management": "yes" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url, headers: { ...bearer("reader"), origin: "http://localhost" } })).statusCode).toBe(403);
    const read = await app.inject({ method: "GET", url, headers: bearer("reader") });
    expect(read.statusCode).toBe(200);
    expect(read.headers["cache-control"]).toBe("no-store");

    expect((await app.inject({ method: "POST", url: `${url}/requests`, headers: bearer("reader"), payload: link })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `${url}/requests`, headers: bearer("submitter"), payload: { ...link, autoplay: true } })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `${url}/requests`, headers: bearer("controller"), payload: { ...link, autoplay: true } })).statusCode).toBe(201);
    expect(calls.filter(call => call.kind === "submit").map(call => call.args[2])).toEqual([
      { via: "automation", mayAutoplay: false },
      { via: "automation", mayAutoplay: true }
    ]);

    expect((await app.inject({ method: "POST", url: `${url}/commands`, headers: bearer("submitter"), payload: { expectedRevision: 3, command: { kind: "stop" } } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `${url}/current/pause`, headers: bearer("submitter"), payload: { expectedItemId: "item-1" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `${url}/commands`, headers: bearer("controller"), payload: { expectedRevision: 3, command: { kind: "stop" } } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `${url}/current/pause`, headers: bearer("controller"), payload: { expectedItemId: "item-1" } })).statusCode).toBe(200);
    await app.close();
  });
});
