import { describe, expect, it, vi } from "vitest";
import { createHttpAutomationSettingsApi } from "./automation-api.js";
describe("automation management API", () => {
  it("uses management authorization and CSRF for approval without exchanging client credentials", async () => {
    const pairing = { id: "11111111-1111-4111-8111-111111111111", clientName: "Deck", scopes: ["timers:read"], comparisonCode: "A1B2C3D4", expiresAt: "2026-10-04T00:05:00Z", approvalUrl: "/manage/settings#automation", status: "approved" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: "management-session", csrfToken: "csrf-value" })).mockResolvedValueOnce(Response.json(pairing)).mockResolvedValueOnce(Response.json([]));
    const client = createHttpAutomationSettingsApi({ fetch: fetcher });
    expect(await client.approve(pairing.id, ["timers:read"])).toEqual(pairing);
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/automation/pairings/${pairing.id}/approve`);
    const approval = fetcher.mock.calls[1]?.[1];
    expect(new Headers(approval?.headers).get("authorization")).toBe("Bearer management-session");
    expect(new Headers(approval?.headers).get("x-stream-jams-csrf")).toBe("csrf-value");
    expect(JSON.parse(approval?.body as string)).toEqual({ scopes: ["timers:read"] });
    await client.listGrants();
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).has("x-stream-jams-csrf")).toBe(false);
  });
  it("rejects malformed responses at the typed client boundary", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: "session", csrfToken: "csrf" })).mockResolvedValueOnce(Response.json([{ token: "unexpected" }]));
    await expect(createHttpAutomationSettingsApi({ fetch: fetcher }).listGrants()).rejects.toThrow();
  });
});
