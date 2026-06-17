import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createLocalManagementOriginPolicy,
  createManagementSecurityPreHandler,
  registerManagementCorsPreflightRoute
} from "./management-security.js";

const now = new Date("2026-06-16T12:00:00.000Z");

describe("management security middleware", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "requires a session-bound CSRF token on %s management requests",
    async (method) => {
      const { app, authHeaders } = await createProtectedApp();

      const missingCsrf = await app.inject({
        method,
        url: "/management/unsafe",
        headers: {
          authorization: authHeaders.authorization
        }
      });
      const valid = await app.inject({
        method,
        url: "/management/unsafe",
        headers: authHeaders
      });

      expect(missingCsrf.statusCode).toBe(403);
      expect(missingCsrf.json()).toMatchObject({
        error: {
          code: "MANAGEMENT_CSRF_REQUIRED"
        }
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toEqual({ ok: true });
    }
  );

  it("allows safe management requests without CSRF proof after authorization", async () => {
    const { app, authHeaders } = await createProtectedApp();

    const response = await app.inject({
      method: "GET",
      url: "/playback",
      headers: {
        authorization: authHeaders.authorization
      }
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects explicit unapproved origins and allows configured origins", async () => {
    const { app, authHeaders } = await createProtectedApp();

    const rejected = await app.inject({
      method: "POST",
      url: "/playback/pause",
      headers: {
        ...authHeaders,
        origin: "http://evil.example"
      }
    });
    const accepted = await app.inject({
      method: "POST",
      url: "/playback/pause",
      headers: {
        ...authHeaders,
        origin: "http://127.0.0.1:39187"
      }
    });

    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_ORIGIN_FORBIDDEN"
      }
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:39187");
  });

  it("does not emit permissive CORS headers for missing or null origins", async () => {
    const { app, authHeaders } = await createProtectedApp();

    const missingOrigin = await app.inject({
      method: "POST",
      url: "/playback/pause",
      headers: authHeaders
    });
    const nullOrigin = await app.inject({
      method: "POST",
      url: "/playback/pause",
      headers: {
        ...authHeaders,
        origin: "null"
      }
    });

    expect(missingOrigin.statusCode).toBe(200);
    expect(missingOrigin.headers["access-control-allow-origin"]).toBeUndefined();
    expect(nullOrigin.statusCode).toBe(200);
    expect(nullOrigin.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers allowed management CORS preflights without affecting overlay paths", async () => {
    const { app } = await createProtectedApp({
      environment: {
        STREAM_JAMS_DEV_ORIGINS: "http://127.0.0.1:5173"
      }
    });

    const managementPreflight = await app.inject({
      method: "OPTIONS",
      url: "/playback/pause",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });
    const overlayPreflight = await app.inject({
      method: "OPTIONS",
      url: "/overlay/modules/alerts/live/ovl_key",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });

    expect(managementPreflight.statusCode).toBe(204);
    expect(managementPreflight.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(managementPreflight.headers["access-control-allow-headers"]).toContain("x-stream-jams-csrf");
    expect(overlayPreflight.statusCode).toBe(404);
  });
});

async function createProtectedApp(options: { readonly environment?: NodeJS.ProcessEnv | undefined } = {}) {
  const sessionService = new LocalManagementSessionService({
    clock: () => now,
    generateId: () => "mgmt_test",
    generateCsrfToken: () => "csrf_test",
    sessionTtlMs: 60_000
  });
  const session = await sessionService.createSession();
  const app = Fastify({ logger: false });
  const originPolicy = createLocalManagementOriginPolicy({
    host: "127.0.0.1",
    port: 39187,
    environment: options.environment ?? {}
  });
  const preHandler = createManagementSecurityPreHandler({
    sessionService,
    originPolicy
  });

  app.get("/playback", { preHandler }, async () => ({ ok: true }));
  app.post("/playback/pause", { preHandler }, async () => ({ ok: true }));
  app.post("/management/unsafe", { preHandler }, async () => ({ ok: true }));
  app.put("/management/unsafe", { preHandler }, async () => ({ ok: true }));
  app.patch("/management/unsafe", { preHandler }, async () => ({ ok: true }));
  app.delete("/management/unsafe", { preHandler }, async () => ({ ok: true }));
  registerManagementCorsPreflightRoute(app, originPolicy);

  return {
    app,
    authHeaders: {
      authorization: `Bearer ${session.id}`,
      "x-stream-jams-csrf": session.csrfToken
    }
  };
}
