import { describe, expect, it, vi } from "vitest";
import { createHttpPlaybackApi } from "./playback-api.js";

const snapshot = {
  revision: 4,
  owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
  current: [],
  queued: [],
  recent: [],
  paused: false,
  muted: false,
  doNotDisturb: false
};

describe("createHttpPlaybackApi", () => {
  it("uses the management session boundary for every parsed playback command", async () => {
    const requests: Array<{ readonly path: string; readonly init: RequestInit | undefined }> = [];
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/auth/management/sessions") {
        return jsonResponse({ id: "mgmt_operator", csrfToken: "csrf_operator" });
      }
      requests.push({ path, init });
      return jsonResponse(snapshot);
    });
    const api = createHttpPlaybackApi({ fetch: fetcher });

    await api.getSnapshot();
    await api.pause();
    await api.resume();
    await api.mute();
    await api.unmute();
    await api.setDoNotDisturb(true);
    await api.skip("screen-effects", "current-1");
    await api.remove("alerts", "pending-1");
    await api.replay("alerts", "recent-1");
    await api.clear("screen-effects", 2, 4);
    await api.setModulePaused("screen-effects", true);

    expect(requests.map(({ path }) => path)).toEqual([
      "/playback/operations",
      "/playback/pause",
      "/playback/operations",
      "/playback/resume",
      "/playback/operations",
      "/playback/mute",
      "/playback/operations",
      "/playback/unmute",
      "/playback/operations",
      "/playback/do-not-disturb",
      "/playback/operations",
      "/playback/operations/screen-effects/current-1/skip",
      "/playback/operations/alerts/pending-1/remove",
      "/playback/operations/alerts/recent-1/replay",
      "/playback/operations/screen-effects/clear",
      "/playback/operations/screen-effects/pause"
    ]);
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer mgmt_operator");
    expect(requests.filter(({ init }) => init?.method === "POST").every(({ init }) =>
      new Headers(init?.headers).get("x-stream-jams-csrf") === "csrf_operator"
    )).toBe(true);
    expect(requests.find(({ path }) => path === "/playback/do-not-disturb")?.init?.body).toBe(JSON.stringify({ enabled: true }));
    expect(requests.find(({ path }) => path.endsWith("/clear"))?.init?.body).toBe(JSON.stringify({ expectedPendingCount: 2, observedRevision: 4 }));
    expect(requests.at(-1)?.init?.body).toBe(JSON.stringify({ paused: true }));
    expect(setItem).not.toHaveBeenCalled();
  });

  it("rejects malformed playback snapshots", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? jsonResponse({ id: "mgmt_operator", csrfToken: "csrf_operator" })
        : jsonResponse({ paused: "yes" })
    );

    await expect(createHttpPlaybackApi({ fetch: fetcher }).getSnapshot()).rejects.toThrow();
  });

  it("retains the authoritative snapshot returned with an operation conflict", async () => {
    const conflictSnapshot = { ...snapshot, revision: 5, current: [] };
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/auth/management/sessions"
        ? jsonResponse({ id: "mgmt_operator", csrfToken: "csrf_operator" })
        : jsonResponse({
            error: {
              code: "PLAYBACK_OPERATION_CONFLICT",
              message: "The requested occurrence is no longer current."
            },
            snapshot: conflictSnapshot
          }, { status: 409 })
    );

    const error = await createHttpPlaybackApi({ fetch: fetcher })
      .skip("screen-effects", "stale-occurrence")
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({
      name: "PlaybackOperationsConflictError",
      snapshot: conflictSnapshot
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
