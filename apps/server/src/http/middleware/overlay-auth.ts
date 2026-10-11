import { isOrdinaryOverlayOutput } from "@stream-jams/core";
import type {
  OverlayAccessService,
  OverlayRouteAccessRequest,
  OverlayTargetProfileId,
  RetiredOverlayOutputKind
} from "@stream-jams/core";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface OverlayAuthPreHandlerOptions {
  readonly overlayAccessService: Pick<OverlayAccessService, "verifyRouteAccess">;
  readonly resolveAccessRequest: (request: FastifyRequest) => OverlayRouteAccessRequest | null;
  readonly shell?: boolean;
  /** Names the retired test/unified family a request's route targets, whether or not its key is valid. */
  readonly classifyRetiredRoute?: (request: FastifyRequest) => RetiredOverlayOutputKind | null;
  /** Records only the bounded retired kind; the response stays fail-closed and transparent. */
  readonly onRetiredOutput?: ((kind: RetiredOverlayOutputKind) => void) | undefined;
}

export function sendTransparentOverlayRejection(reply: import("fastify").FastifyReply) {
  return reply.status(401).header("cache-control", "no-store").header("referrer-policy", "no-referrer")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'")
    .type("text/html; charset=utf-8").send('<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body></body></html>');
}

export function createOverlayAuthPreHandler(options: OverlayAuthPreHandlerOptions): preHandlerHookHandler {
  return async (request, reply) => {
    const retired = options.classifyRetiredRoute?.(request) ?? null;
    if (retired !== null) options.onRetiredOutput?.(retired);
    const accessRequest = options.resolveAccessRequest(request);
    if (accessRequest === null || accessRequest.rawKey.trim() === "") {
      if (options.shell) return sendTransparentOverlayRejection(reply);
      return sendHttpError(reply, 401, {
        code: "OVERLAY_ROUTE_KEY_REQUIRED",
        message: "A valid overlay route key path segment is required"
      });
    }

    if (!isOrdinaryOverlayOutput(accessRequest, true)) {
      if (options.shell) return sendTransparentOverlayRejection(reply);
      return sendHttpError(reply, 401, { code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED",
        message: "This output was retired. Select the per-module Browser Source in management and replace the old source URL." });
    }

    const verification = await options.overlayAccessService.verifyRouteAccess(accessRequest);
    if (!verification.authorized) {
      if (options.shell) return sendTransparentOverlayRejection(reply);
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
  if (typeof query === "object" && query !== null && ("recipientKind" in query || "savedConfig" in query)) return { valid: false };
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
