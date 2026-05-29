import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { sendHttpError } from "../errors.js";

export interface LocalManagementRateLimitRequest {
  readonly clientId: string;
  readonly routeId: string;
}

export type LocalManagementRateLimitDecision =
  | {
      readonly allowed: true;
      readonly remaining: number;
      readonly retryAfterSeconds: 0;
    }
  | {
      readonly allowed: false;
      readonly remaining: 0;
      readonly retryAfterSeconds: number;
    };

export interface LocalManagementRateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly clock?: () => Date;
}

export interface LocalManagementRateLimitPreHandlerOptions {
  readonly limiter: LocalManagementRateLimiter;
}

interface RateLimitBucket {
  readonly resetAtMs: number;
  readonly count: number;
}

/** Fixed-window limiter for localhost management routes with injectable time for deterministic tests. */
export class LocalManagementRateLimiter {
  readonly #maxRequests: number;
  readonly #windowMs: number;
  readonly #clock: () => Date;
  readonly #buckets = new Map<string, RateLimitBucket>();

  constructor(options: LocalManagementRateLimiterOptions) {
    if (options.maxRequests < 1) {
      throw new Error("maxRequests must be at least 1");
    }

    if (options.windowMs < 1) {
      throw new Error("windowMs must be at least 1");
    }

    this.#maxRequests = options.maxRequests;
    this.#windowMs = options.windowMs;
    this.#clock = options.clock ?? (() => new Date());
  }

  consume(request: LocalManagementRateLimitRequest): LocalManagementRateLimitDecision {
    const nowMs = this.#clock().getTime();
    const bucketKey = `${request.clientId}:${request.routeId}`;
    const existing = this.#buckets.get(bucketKey);
    const bucket =
      existing === undefined || existing.resetAtMs <= nowMs ? { count: 0, resetAtMs: nowMs + this.#windowMs } : existing;

    if (bucket.count >= this.#maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000))
      };
    }

    const nextCount = bucket.count + 1;
    this.#buckets.set(bucketKey, {
      count: nextCount,
      resetAtMs: bucket.resetAtMs
    });

    return {
      allowed: true,
      remaining: Math.max(0, this.#maxRequests - nextCount),
      retryAfterSeconds: 0
    };
  }
}

export function createLocalManagementRateLimitPreHandler(
  options: LocalManagementRateLimitPreHandlerOptions
): preHandlerHookHandler {
  return async (request, reply) => {
    const decision = options.limiter.consume({
      clientId: resolveClientId(request),
      routeId: resolveRouteId(request)
    });

    if (!decision.allowed) {
      reply.header("retry-after", decision.retryAfterSeconds.toString());
      return sendHttpError(reply, 429, {
        code: "MANAGEMENT_RATE_LIMITED",
        message: "Too many management requests",
        retryAfterSeconds: decision.retryAfterSeconds
      });
    }
  };
}

function resolveClientId(request: FastifyRequest): string {
  return request.ip;
}

function resolveRouteId(request: FastifyRequest): string {
  return `${request.method} ${request.routeOptions.url ?? request.url.split("?")[0]}`;
}
