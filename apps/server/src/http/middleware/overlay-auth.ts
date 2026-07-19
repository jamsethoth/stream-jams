import type {
  OverlayAccessService,
  OverlayRouteAccessRequest,
  OverlayTargetProfileId
} from "@stream-jams/core";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface OverlayAuthPreHandlerOptions {
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly resolveAccessRequest: (request: FastifyRequest) => OverlayRouteAccessRequest | null;
}

export function createOverlayAuthPreHandler(options: OverlayAuthPreHandlerOptions): preHandlerHookHandler {
  return async (request, reply) => {
    const accessRequest = options.resolveAccessRequest(request);
    if (accessRequest === null || accessRequest.rawKey.trim() === "") {
      return sendHttpError(reply, 401, {
        code: "OVERLAY_ROUTE_KEY_REQUIRED",
        message: "A valid overlay route key path segment is required"
      });
    }

    const verification = await options.overlayAccessService.verifyRouteAccess(accessRequest);
    if (!verification.authorized) {
      return sendHttpError(reply, 401, {
        code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED",
        message: "Overlay route key is not authorized for this output",
        reason: verification.reason
      });
    }
  };
}

export type OverlayTargetProfileQuery =
  | { readonly valid: true; readonly targetProfileId: OverlayTargetProfileId | null }
  | { readonly valid: false };

export function parseOverlayTargetProfileQuery(
  query: unknown,
  allowTargetProfile: boolean
): OverlayTargetProfileQuery {
  if (typeof query !== "object" || query === null || !("profile" in query)) {
    return { valid: true, targetProfileId: null };
  }

  if (!allowTargetProfile) {
    return { valid: false };
  }

  const profile = (query as { readonly profile?: unknown }).profile;
  return profile === "landscape" || profile === "vertical"
    ? { valid: true, targetProfileId: profile }
    : { valid: false };
}
