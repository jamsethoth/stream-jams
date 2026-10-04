import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import { mediaVersionSnapshotSchema } from "@stream-jams/core";
import type { MediaPreviewService } from "../../modules/assets/media-preview-service.js";
import { MediaCapacityError, MediaUnavailableError } from "../../modules/assets/local-media-service.js";
import { extractBearerToken } from "../middleware/management-bearer-token.js";
import { sendHttpError } from "../errors.js";

export interface AssetPreviewRouteDependencies {
  readonly mediaPreviewService: MediaPreviewService;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}
export function registerAssetPreviewRoutes(app: FastifyInstance, dependencies: AssetPreviewRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  app.post("/assets/:assetId/preview", { preHandler }, async (request, reply) => {
    reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
    const assetId = parameter(request, "assetId");
    const snapshot = request.body === undefined ? null : mediaVersionSnapshotSchema.safeParse(
      typeof request.body === "object" && request.body !== null && "snapshot" in request.body
        ? (request.body as { snapshot: unknown }).snapshot : null
    );
    if (snapshot !== null && (!snapshot.success || snapshot.data.assetId !== assetId)) {
      return sendHttpError(reply, 400, { code: "INVALID_ASSET_PREVIEW_REQUEST", message: "Select a valid asset version." });
    }
    try { return reply.status(201).send(snapshot === null
      ? await dependencies.mediaPreviewService.create(session(request), assetId)
      : await dependencies.mediaPreviewService.createVersioned(session(request), snapshot.data)); }
    catch (error) { if (error instanceof MediaCapacityError) return sendHttpError(reply, 503, { code: "MEDIA_CAPACITY", message: error.message }); if (error instanceof MediaUnavailableError) return unavailable(reply); throw error; }
  });
  app.post("/assets/previews/:previewId/renew", { preHandler }, async (request, reply) => {
    reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
    try { return await dependencies.mediaPreviewService.renew(session(request), parameter(request, "previewId")); }
    catch (error) { if (error instanceof MediaCapacityError) return sendHttpError(reply, 503, { code: "MEDIA_CAPACITY", message: error.message }); if (error instanceof MediaUnavailableError) return unavailable(reply); throw error; }
  });
  app.delete("/assets/previews/:previewId", { preHandler }, async (request, reply) => {
    await dependencies.mediaPreviewService.release(session(request), parameter(request, "previewId"));
    return reply.status(204).send();
  });
}
function session(request: FastifyRequest): string { return extractBearerToken(request.headers.authorization) ?? ""; }
function parameter(request: FastifyRequest, name: string): string { return String((request.params as Record<string, unknown>)[name] ?? ""); }
function unavailable(reply: Parameters<typeof sendHttpError>[0]) {
  return sendHttpError(reply, 404, { code: "MEDIA_PREVIEW_UNAVAILABLE", message: "Preview unavailable. Reselect the asset and retry." });
}
