import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  createTestManagementSecurity,
  managementTestHeaders
} from "./management-security-fixture.js";

describe("management security test fixture", () => {
  it("uses the production origin, bearer, and CSRF checks", async () => {
    const sessions = new LocalManagementSessionService({
      clock: () => new Date("2026-09-23T12:00:00.000Z"),
      generateId: () => "mgmt_fixture",
      generateCsrfToken: () => "csrf_fixture",
      sessionTtlMs: 60_000
    });
    const session = await sessions.createSession();
    const app = Fastify({ logger: false });
    const preHandler = createTestManagementSecurity(sessions);
    app.get("/management/test", { preHandler }, async () => ({ ok: true }));
    app.post("/management/test", { preHandler }, async () => ({ ok: true }));

    const validGet = await app.inject({ method: "GET", url: "/management/test", headers: managementTestHeaders(session) });
    const validPost = await app.inject({ method: "POST", url: "/management/test", headers: managementTestHeaders(session, "POST") });
    const missingCsrf = await app.inject({ method: "POST", url: "/management/test", headers: managementTestHeaders(session) });
    const foreignGet = await app.inject({
      method: "GET",
      url: "/management/test",
      headers: { ...managementTestHeaders(session), origin: "http://evil.invalid" }
    });
    const foreignPost = await app.inject({
      method: "POST",
      url: "/management/test",
      headers: { ...managementTestHeaders(session, "POST"), origin: "http://evil.invalid" }
    });

    expect(validGet.statusCode).toBe(200);
    expect(validPost.statusCode).toBe(200);
    expect(missingCsrf.statusCode).toBe(403);
    expect(missingCsrf.json()).toMatchObject({ error: { code: "MANAGEMENT_CSRF_REQUIRED" } });
    expect(foreignGet.statusCode).toBe(403);
    expect(foreignGet.json()).toMatchObject({ error: { code: "MANAGEMENT_ORIGIN_FORBIDDEN" } });
    expect(foreignPost.statusCode).toBe(403);
    expect(foreignPost.json()).toMatchObject({ error: { code: "MANAGEMENT_ORIGIN_FORBIDDEN" } });
  });
});
