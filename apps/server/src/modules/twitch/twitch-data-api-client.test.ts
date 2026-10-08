import { describe, expect, it, vi } from "vitest";
import { DefaultTwitchApiClient, TwitchApiHttpError } from "./twitch-api-client.js";
// Synthetic documentation-derived fixtures, never recorded from Twitch accounts.
const request = { accessToken: "synthetic-secret", clientId: "synthetic-client", broadcasterId: "synthetic-user" };
const goal = { id: "goal-1", broadcaster_id: "synthetic-user", broadcaster_name: "Synthetic", broadcaster_login: "synthetic", type: "follower", description: "Synthetic follower goal", current_amount: 4, target_amount: 20, started_at: "2026-10-08T00:00:00Z" };
describe("Twitch documented data APIs", () => {
  it("uses total rather than page length and sends credentials only in headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ total: 1000, data: [], pagination: {} }, { headers: { "ratelimit-reset": "100" } }));
    const client = new DefaultTwitchApiClient({ fetch: fetcher });
    await expect(client.getFollowerTotal(request)).resolves.toEqual({ total: 1000, rateResetEpochMs: 100_000 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://api.twitch.tv/helix/channels/followers?broadcaster_id=synthetic-user");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ authorization: "Bearer synthetic-secret", "client-id": "synthetic-client" });
  });
  it("rejects malformed totals and goals while retaining unknown goal types as unbindable metadata", async () => {
    for (const total of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "5"]) {
      const client = new DefaultTwitchApiClient({ fetch: async () => Response.json({ total, data: [] }) });
      await expect(client.getFollowerTotal(request)).rejects.toThrow("invalid");
    }
    const client = new DefaultTwitchApiClient({ fetch: async () => Response.json({ data: [goal, { ...goal, id: "goal-2", type: "future-goal" }] }) });
    await expect(client.getCreatorGoals(request)).resolves.toMatchObject({ goals: [goal, { id: "goal-2", type: "future-goal" }] });
    const wrong = new DefaultTwitchApiClient({ fetch: async () => Response.json({ data: [{ ...goal, broadcaster_id: "other" }] }) });
    await expect(wrong.getCreatorGoals(request)).rejects.toThrow("invalid");
  });
  it("returns both retry-after and rate-reset metadata without raw response content", async () => {
    const client = new DefaultTwitchApiClient({ fetch: async () => new Response("sensitive provider payload", { status: 429, headers: { "ratelimit-reset": "200", "retry-after": "30" } }) });
    await expect(client.getFollowerTotal(request)).rejects.toMatchObject({ status: 429, rateResetEpochMs: 200_000, retryAfterMs: 30_000 });
    await expect(client.getFollowerTotal(request)).rejects.toBeInstanceOf(TwitchApiHttpError);
  });
});
