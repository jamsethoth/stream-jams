import { expect, it, vi } from "vitest";
import { createHttpOperatorTimersApi } from "./timers-api.js";

it("loads active timers and sends timer-specific commands through management auth", async () => {
  const state = { status: "paused", definitionId: "mitts", generation: "g1", remainingMs: 30_000,
    snapshot: { id: "mitts", label: "Wear oven mitts", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
      outputs: { browserSource: true, deviceRouteIds: [] } } } as const;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input); if (url === "/auth/management/sessions") return json({ id: "session", csrfToken: "csrf" });
    if (url === "/timers/state") return json([state]);
    expect(url).toBe("/timers/mitts/resume"); expect(init?.method).toBe("POST");
    return json({ changed: true, state: { ...state, status: "running", startedAtEpochMs: 1000, endsAtEpochMs: 31_000, remainingMs: undefined } });
  });
  const api = createHttpOperatorTimersApi({ fetch: fetcher });
  await expect(api.listStates()).resolves.toEqual([state]);
  await expect(api.command("mitts", "resume")).resolves.toMatchObject({ changed: true, state: { status: "running" } });
});
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
