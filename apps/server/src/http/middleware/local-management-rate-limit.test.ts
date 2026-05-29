import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "./local-management-rate-limit.js";

const start = new Date("2026-05-29T12:00:00.000Z");

describe("LocalManagementRateLimiter", () => {
  it("allows requests up to the configured route/client window and then blocks", () => {
    const limiter = new LocalManagementRateLimiter({
      maxRequests: 2,
      windowMs: 1_000,
      clock: () => start
    });

    expect(limiter.consume({ clientId: "127.0.0.1", routeId: "GET /config/server" })).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0
    });
    expect(limiter.consume({ clientId: "127.0.0.1", routeId: "GET /config/server" })).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0
    });
    expect(limiter.consume({ clientId: "127.0.0.1", routeId: "GET /config/server" })).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1
    });
  });

  it("isolates counters by route and client and resets after the fixed window", () => {
    const clock = createMutableClock(start);
    const limiter = new LocalManagementRateLimiter({
      maxRequests: 1,
      windowMs: 1_000,
      clock
    });

    expect(limiter.consume({ clientId: "client-a", routeId: "GET /config/server" }).allowed).toBe(true);
    expect(limiter.consume({ clientId: "client-a", routeId: "PATCH /config/server" }).allowed).toBe(true);
    expect(limiter.consume({ clientId: "client-b", routeId: "GET /config/server" }).allowed).toBe(true);
    expect(limiter.consume({ clientId: "client-a", routeId: "GET /config/server" }).allowed).toBe(false);

    clock.set(new Date("2026-05-29T12:00:01.001Z"));

    expect(limiter.consume({ clientId: "client-a", routeId: "GET /config/server" })).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0
    });
  });
});

describe("createLocalManagementRateLimitPreHandler", () => {
  it("returns HTTP 429 before the route handler runs", async () => {
    const app = Fastify({ logger: false });
    const limiter = new LocalManagementRateLimiter({
      maxRequests: 1,
      windowMs: 1_000,
      clock: () => start
    });
    let handlerCalls = 0;

    app.get(
      "/config/server",
      {
        preHandler: createLocalManagementRateLimitPreHandler({ limiter })
      },
      async () => {
        handlerCalls += 1;
        return { ok: true };
      }
    );

    expect((await app.inject({ method: "GET", url: "/config/server" })).statusCode).toBe(200);
    const rejected = await app.inject({ method: "GET", url: "/config/server" });

    expect(rejected.statusCode).toBe(429);
    expect(rejected.json()).toEqual({
      error: {
        code: "MANAGEMENT_RATE_LIMITED",
        message: "Too many management requests",
        retryAfterSeconds: 1
      }
    });
    expect(handlerCalls).toBe(1);
  });
});

function createMutableClock(initial: Date): (() => Date) & { set(next: Date): void } {
  let current = initial;
  const clock = (() => current) as (() => Date) & { set(next: Date): void };
  clock.set = (next: Date) => {
    current = next;
  };
  return clock;
}
