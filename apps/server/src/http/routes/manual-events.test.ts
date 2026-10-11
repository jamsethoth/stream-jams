import { expect, it, vi } from "vitest";
import { createBaseServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { ManualSubmissionRejectedError } from "../../modules/events/manual-event-service.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";
import { registerManualEventRoutes } from "./manual-events.js";

const simulation = { action: { kind: "simulate-canonical", event: { type: "follow", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", actor: { id: null, displayName: "Viewer" }, amount: null, metadata: {}, message: null } } };
it("protects simulations with management session origin and CSRF; rejects forged or targeted actions", async () => {
  const sessions = new LocalManagementSessionService({ generateId: () => "session" });
  const session = await sessions.createSession();
  const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "test" } });
  const submit = vi.fn(async () => ({ status: "accepted" as const, busId: "bus", eventId: "manual", consumers: [{ consumerId: "alerts", outcome: "pending" as const, referenceId: null }] }));
  registerManualEventRoutes(app, submit, [createTestManagementSecurity(sessions)]);
  try {
    const headers = managementTestHeaders(session, "POST");
    expect((await app.inject({ method: "POST", url: "/management/events/manual", payload: simulation })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/management/events/manual", headers: { authorization: headers.authorization! }, payload: simulation })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/management/events/manual", headers: { ...headers, origin: "https://untrusted.example" }, payload: simulation })).statusCode).toBe(403);
    for (const payload of [{ ...simulation, recipients: ["desktop"] }, { action: { kind: "effect-test", effectId: "e", variantId: "v", confirmLiveImpact: true } }, { action: { ...simulation.action, event: { ...simulation.action.event, sourceRegistrationId: "forged" } } }]) {
      expect((await app.inject({ method: "POST", url: "/management/events/manual", headers, payload })).statusCode).toBe(400);
    }
    expect(submit).not.toHaveBeenCalled();
    const result = await app.inject({ method: "POST", url: "/management/events/manual", headers, payload: simulation });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ status: "accepted", eventId: "manual", consumers: [{ outcome: "pending" }] });
    expect(submit).toHaveBeenCalledOnce();
    submit.mockRejectedValueOnce(new ManualSubmissionRejectedError("invalid-reference", "ref-invalid"));
    const rejected = await app.inject({ method: "POST", url: "/management/events/manual", headers, payload: simulation });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().error.message).toContain("ref-invalid");
  } finally { await app.close(); }
});
