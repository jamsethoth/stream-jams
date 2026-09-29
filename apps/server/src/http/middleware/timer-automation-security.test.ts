import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { LocalManagementRateLimiter } from "./local-management-rate-limit.js";
import { createTimerAutomationSecurityPreHandler } from "./timer-automation-security.js";

const token = "tmr_valid-generated-token_123456789012";

function createApp(maxRequests = 10) {
  const verify = vi.fn((candidate: string) => candidate === token);
  const warn = vi.fn().mockResolvedValue(undefined);
  const app = Fastify({ logger: false });
  app.get("/automation/timers", {
    preHandler: createTimerAutomationSecurityPreHandler({
      credentials: { verify },
      limiter: new LocalManagementRateLimiter({ maxRequests, windowMs: 60_000 }),
      logger: { warn }
    })
  }, async () => ({ ok: true }));
  return { app, verify, warn };
}

describe("createTimerAutomationSecurityPreHandler", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("accepts a valid bearer from loopback %s", async (remoteAddress) => {
    const { app } = createApp();
    const response = await app.inject({
      method: "GET", url: "/automation/timers", remoteAddress,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode, response.body).toBe(200);
    await app.close();
  });

  it("rejects non-loopback peers before credential verification", async () => {
    const { app, verify } = createApp();
    const response = await app.inject({
      method: "GET", url: "/automation/timers", remoteAddress: "192.168.1.20",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: "TIMER_AUTOMATION_LOOPBACK_REQUIRED", message: "Timer automation is available only from this computer" } });
    expect(verify).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects every browser Origin and never records the bearer", async () => {
    const { app, verify, warn } = createApp();
    const response = await app.inject({
      method: "GET", url: "/automation/timers", remoteAddress: "127.0.0.1",
      headers: { authorization: `Bearer ${token}`, origin: "http://127.0.0.1:39187" }
    });
    expect(response.statusCode).toBe(403);
    expect(verify).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
    await app.close();
  });

  it("rejects missing, malformed, management, overlay, URL, and invalid timer credentials", async () => {
    const { app } = createApp();
    const headers = [
      undefined,
      { authorization: token },
      { authorization: "Bearer mgmt_session_123456789012345678901234" },
      { authorization: "Bearer ovl_overlay_123456789012345678901234" },
      { authorization: "Bearer tmr_wrong-generated-token_1234567890" }
    ];
    for (const candidate of headers) {
      const response = await app.inject({ method: "GET", url: "/automation/timers", ...(candidate === undefined ? {} : { headers: candidate }) });
      expect(response.statusCode).toBe(401);
    }
    expect((await app.inject({ method: "GET", url: `/automation/timers?token=${token}` })).statusCode).toBe(401);
    await app.close();
  });

  it("applies a dedicated request limit before repeated authentication work", async () => {
    const { app, verify } = createApp(1);
    expect((await app.inject({ method: "GET", url: "/automation/timers", headers: { authorization: "Bearer tmr_wrong-generated-token_1234567890" } })).statusCode).toBe(401);
    const limited = await app.inject({ method: "GET", url: "/automation/timers", headers: { authorization: `Bearer ${token}` } });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect(verify).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
