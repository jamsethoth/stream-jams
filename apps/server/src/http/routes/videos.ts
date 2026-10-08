import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { overlayPurposeSchema, type OverlayPurpose, type VideoQueueResponse } from "@stream-jams/core";
import { getAutomationGrant } from "../middleware/automation-security.js";
import { sendHttpError } from "../errors.js";
import { VideoQueueConflictError } from "../../modules/videos/video-queue-repository.js";
import { VideoQueueCommandError, type VideoItemCommand, type VideoQueueCommand } from "../../modules/videos/video-queue-service.js";
import type { VideoRequestContext, VideoRequestResult } from "../../modules/videos/video-request-intake.js";

export interface VideoRouteService {
  response(purpose: OverlayPurpose): VideoQueueResponse;
  submit(purpose: OverlayPurpose, input: unknown, context: VideoRequestContext): VideoRequestResult;
  command(purpose: OverlayPurpose, expectedRevision: number, command: VideoQueueCommand): VideoQueueResponse;
  control(purpose: OverlayPurpose, expectedItemId: string, command: VideoItemCommand): VideoQueueResponse;
}

export interface VideoRouteDependencies {
  readonly videos: VideoRouteService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly automationAuthPreHandler: preHandlerHookHandler;
}

const itemIdSchema = z.string().min(1).max(128);
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("play-next") }).strict(),
  z.object({ kind: z.literal("play-all") }).strict(),
  z.object({ kind: z.literal("pause-queue") }).strict(),
  z.object({ kind: z.literal("resume-queue") }).strict(),
  z.object({ kind: z.literal("skip") }).strict(),
  z.object({ kind: z.literal("stop") }).strict(),
  z.object({ kind: z.literal("clear") }).strict(),
  z.object({ kind: z.literal("remove"), itemId: itemIdSchema }).strict(),
  z.object({ kind: z.literal("play-anyway"), itemId: itemIdSchema }).strict(),
  z.object({ kind: z.literal("reorder"), itemIds: z.array(itemIdSchema).max(500) }).strict()
]);
const commandBodySchema = z.object({ expectedRevision: revisionSchema, command: commandSchema }).strict();
const controlBodySchema = z.object({
  expectedItemId: itemIdSchema,
  positionMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional()
}).strict();
const controlActionSchema = z.enum(["pause", "resume", "seek"]);
const submitterSchema = z.enum(["management", "operator"]);

export function registerVideoRoutes(app: FastifyInstance, dependencies: VideoRouteDependencies): void {
  const management = { preHandler: [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler], bodyLimit: 16_384 };
  const automation = { preHandler: dependencies.automationAuthPreHandler, bodyLimit: 4_096 };
  const { videos } = dependencies;

  app.get("/videos/:purpose", management, async (request, reply) => handle(reply, () => videos.response(readPurpose(request))));
  app.post("/videos/:purpose/requests", management, async (request, reply) => handle(reply, () => {
    const via = submitterSchema.catch("management").parse((request.query as { readonly from?: unknown } | undefined)?.from);
    return submitted(reply, videos.submit(readPurpose(request), request.body, { via, mayAutoplay: true }));
  }));
  app.post("/videos/:purpose/commands", management, async (request, reply) => handle(reply, () => {
    const body = commandBodySchema.parse(request.body);
    return videos.command(readPurpose(request), body.expectedRevision, body.command);
  }));
  app.post("/videos/:purpose/current/:action", management, async (request, reply) => handle(reply, () => control(videos, request)));

  app.get("/automation/v1/videos/:purpose", automation, async (request, reply) => handle(reply, () => {
    requireScope(request, "videos:read");
    reply.header("cache-control", "no-store");
    return videos.response(readPurpose(request));
  }));
  app.post("/automation/v1/videos/:purpose/requests", automation, async (request, reply) => handle(reply, () => {
    requireScope(request, "videos:submit");
    const mayAutoplay = getAutomationGrant(request).scopes.includes("videos:control");
    return submitted(reply, videos.submit(readPurpose(request), request.body, { via: "automation", mayAutoplay }));
  }));
  app.post("/automation/v1/videos/:purpose/commands", automation, async (request, reply) => handle(reply, () => {
    requireScope(request, "videos:control");
    const body = commandBodySchema.parse(request.body);
    return videos.command(readPurpose(request), body.expectedRevision, body.command);
  }));
  app.post("/automation/v1/videos/:purpose/current/:action", automation, async (request, reply) => handle(reply, () => {
    requireScope(request, "videos:control");
    return control(videos, request);
  }));
}

class VideoScopeError extends Error {}

function requireScope(request: FastifyRequest, scope: "videos:read" | "videos:submit" | "videos:control"): void {
  if (!getAutomationGrant(request).scopes.includes(scope)) throw new VideoScopeError();
}

function readPurpose(request: FastifyRequest): OverlayPurpose {
  return z.object({ purpose: overlayPurposeSchema }).parse(request.params).purpose;
}

function control(videos: VideoRouteService, request: FastifyRequest): VideoQueueResponse {
  const action = z.object({ action: controlActionSchema }).parse(request.params).action;
  const body = controlBodySchema.parse(request.body);
  if (action === "seek") {
    if (body.positionMs === undefined) throw new z.ZodError([{ code: "custom", path: ["positionMs"], message: "Seek requires a position", input: undefined }]);
    return videos.control(readPurpose(request), body.expectedItemId, { kind: "seek", positionMs: body.positionMs });
  }
  return videos.control(readPurpose(request), body.expectedItemId, { kind: action });
}

function submitted(reply: FastifyReply, result: VideoRequestResult): unknown {
  if (result.status === "accepted") return reply.status(201).send({ item: result.item });
  const statusCode = result.reason === "module-disabled" ? 409 : result.reason === "queue-full" ? 429 : 422;
  return reply.status(statusCode).send({ error: { code: "VIDEO_REQUEST_REJECTED", message: rejectionMessage(result.reason), reason: result.reason }, fields: result.fields });
}

function rejectionMessage(reason: Extract<VideoRequestResult, { status: "rejected" }>["reason"]): string {
  switch (reason) {
    case "module-disabled": return "The Videos module is turned off. Turn it on in Videos settings.";
    case "invalid-request": return "The request is missing a link or has invalid fields.";
    case "invalid-link": return "That link is not a recognizable Twitch, YouTube or direct video link.";
    case "unsafe-link": return "Links must use HTTPS with no login, port or # fragment.";
    case "unsupported-source": return "That site is not allowed. Add direct-file hosts in Videos settings.";
    case "queue-full": return "The video queue is full. Remove or clear videos first.";
  }
}

async function handle(reply: FastifyReply, work: () => unknown): Promise<unknown> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof VideoScopeError) return sendHttpError(reply, 403, { code: "AUTOMATION_SCOPE_REQUIRED", message: "This installation has not been granted this operation." });
    if (error instanceof z.ZodError) return sendHttpError(reply, 400, { code: "VIDEO_INVALID_INPUT", message: "Invalid video request. Refresh and try again." });
    if (error instanceof VideoQueueConflictError) return sendHttpError(reply, 409, { code: "VIDEO_QUEUE_CONFLICT", message: "The video queue changed. Refresh before trying again." });
    if (error instanceof VideoQueueCommandError) {
      return sendHttpError(reply, error.code === "invalid-order" ? 400 : error.code === "queue-full" ? 429 : 409, { code: "VIDEO_QUEUE_COMMAND_REJECTED", message: error.message, reason: error.code });
    }
    throw error;
  }
}
