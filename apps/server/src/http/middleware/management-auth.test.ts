import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { createManagementAuthPreHandler } from "./management-auth.js";

const now = new Date("2026-05-29T12:00:00.000Z");

describe("createManagementAuthPreHandler", () => {
  it("allows requests with a valid management bearer session", async () => {
    const sessionService = new LocalManagementSessionService({
      clock: () => now,
      generateId: () => "mgmt_valid-session",
      sessionTtlMs: 60_000
    });
    const session = await sessionService.createSession();
    const app = createProtectedApp(sessionService);

    const response = await app.inject({
      method: "GET",
      url: "/config/server",
      headers: {
        authorization: `Bearer ${session.id}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects missing, malformed, expired, revoked, and overlay-shaped credentials", async () => {
    const clock = createMutableClock(now);
    const sessionService = new LocalManagementSessionService({
      clock,
      generateId: () => "mgmt_expiring-session",
      sessionTtlMs: 60_000
    });
    const session = await sessionService.createSession();
    const app = createProtectedApp(sessionService);

    await expectUnauthorized(app, undefined, "MANAGEMENT_SESSION_REQUIRED");
    await expectUnauthorized(app, "Basic abc123", "MANAGEMENT_SESSION_REQUIRED");
    await expectUnauthorized(app, "Bearer ovl_not-management", "MANAGEMENT_SESSION_UNAUTHORIZED");

    clock.set(new Date("2026-05-29T12:01:00.001Z"));
    await expectUnauthorized(app, `Bearer ${session.id}`, "MANAGEMENT_SESSION_UNAUTHORIZED");

    const revokedService = new LocalManagementSessionService({
      clock: () => now,
      generateId: () => "mgmt_revoked-session",
      sessionTtlMs: 60_000
    });
    const revokedSession = await revokedService.createSession();
    await revokedService.revokeSession(revokedSession.id);
    await expectUnauthorized(createProtectedApp(revokedService), `Bearer ${revokedSession.id}`, "MANAGEMENT_SESSION_UNAUTHORIZED");
  });
});

function createProtectedApp(sessionService: LocalManagementSessionService) {
  const app = Fastify({ logger: false });
  app.get(
    "/config/server",
    {
      preHandler: createManagementAuthPreHandler({ sessionService })
    },
    async () => ({ ok: true })
  );
  return app;
}

async function expectUnauthorized(
  app: ReturnType<typeof createProtectedApp>,
  authorization: string | undefined,
  code: string
): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/config/server",
    headers: authorization === undefined ? {} : { authorization }
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({
    error: {
      code
    }
  });
}

function createMutableClock(initial: Date): (() => Date) & { set(next: Date): void } {
  let current = initial;
  const clock = (() => current) as (() => Date) & { set(next: Date): void };
  clock.set = (next: Date) => {
    current = next;
  };
  return clock;
}
