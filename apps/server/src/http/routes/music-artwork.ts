import type { OverlayAccessService, OverlayRouteAccessRequest } from "@stream-jams/core";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { MusicRuntimeCoordinator } from "../../modules/music/music-runtime-coordinator.js";
import type { MusicArtworkRead, MusicArtworkService } from "../../modules/music/music-artwork-service.js";
import { createOverlayAuthPreHandler, parseOverlayTargetProfileQuery } from "../middleware/overlay-auth.js";
import { sendHttpError } from "../errors.js";
import { readModuleOverlayParams, readUnifiedOverlayParams } from "./overlay-route-params.js";

export interface MusicArtworkRouteDependencies {
  readonly musicArtworkService: Pick<MusicArtworkService, "resolve" | "read" | "readGrant">;
  readonly musicRuntimeCoordinator: Pick<MusicRuntimeCoordinator, "getCurrentArtwork">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
}

/** Only current live artwork is deliverable. Preview/test fixtures never consume the live source. */
export function registerMusicArtworkRoutes(app: FastifyInstance, dependencies: MusicArtworkRouteDependencies): void {
  const management = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  const moduleAuth = createOverlayAuthPreHandler({ overlayAccessService: dependencies.overlayAccessService, resolveAccessRequest: moduleAccess });
  const unifiedAuth = createOverlayAuthPreHandler({ overlayAccessService: dependencies.overlayAccessService, resolveAccessRequest: unifiedAccess });

  app.get("/management/music/artwork/:ref", { preHandler: management }, (request, reply) => sendCurrent(request, reply, dependencies));
  app.get("/overlay/modules/music/:purpose/:overlayKey/artwork/:ref", { preHandler: moduleAuth }, (request, reply) => sendCurrent(request, reply, dependencies));
  app.get("/overlay/unified/:purpose/:overlayKey/music/artwork/:ref", { preHandler: unifiedAuth }, (request, reply) => sendCurrent(request, reply, dependencies));
  app.get("/media/music-artwork/:handle", async (request, reply) => {
    const handle = parameter(request, "handle");
    return sendBytes(reply, await dependencies.musicArtworkService.readGrant(handle, "desktop-music"));
  });
}

async function sendCurrent(request: FastifyRequest, reply: FastifyReply, dependencies: MusicArtworkRouteDependencies): Promise<FastifyReply> {
  const current = dependencies.musicRuntimeCoordinator.getCurrentArtwork();
  const ref = parameter(request, "ref");
  if (current === null) return sendBytes(reply, null);
  // A renderer may use either the provider's opaque reference or a service-resolved reference.
  let artwork = await dependencies.musicArtworkService.read(ref, current.owner);
  if (artwork === null && ref === current.ref) {
    const resolved = await dependencies.musicArtworkService.resolve(current.descriptor, current.owner, AbortSignal.timeout(5_000));
    if (resolved !== null) artwork = await dependencies.musicArtworkService.read(resolved, current.owner);
  }
  return sendBytes(reply, artwork);
}

function sendBytes(reply: FastifyReply, artwork: MusicArtworkRead | null): FastifyReply {
  reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer").header("x-content-type-options", "nosniff");
  if (artwork === null) return sendHttpError(reply, 404, { code: "MUSIC_ARTWORK_UNAVAILABLE", message: "Artwork unavailable" });
  return reply.type(artwork.mimeType).send(Buffer.from(artwork.bytes));
}

function moduleAccess(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readModuleOverlayParams({ ...(request.params as object), moduleId: "music" });
  const profile = parseOverlayTargetProfileQuery(request.query, true);
  if (params.purpose !== "live" || !params.overlayKey || !profile.valid) return null;
  return { overlayId: "default", moduleId: "music", purpose: "live", scope: "module", targetProfileId: profile.targetProfileId, rawKey: params.overlayKey };
}

function unifiedAccess(request: FastifyRequest): OverlayRouteAccessRequest | null {
  const params = readUnifiedOverlayParams(request.params);
  const profile = parseOverlayTargetProfileQuery(request.query, false);
  if (params.purpose !== "live" || !params.overlayKey || !profile.valid) return null;
  return { overlayId: "default", moduleId: null, purpose: "live", scope: "unified", targetProfileId: null, rawKey: params.overlayKey };
}

function parameter(request: FastifyRequest, name: string): string {
  const candidate = (request.params as Record<string, unknown>)[name];
  return typeof candidate === "string" ? candidate : "";
}
