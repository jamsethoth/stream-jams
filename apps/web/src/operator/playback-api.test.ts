import { describe, expect, it, vi } from "vitest";
import { createHttpPlaybackApi } from "./playback-api.js";

const snapshot = {
  current: null,
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
    await api.skip();
    await api.replay("recent-1");

    expect(requests.map(({ path }) => path)).toEqual([
      "/playback",
      "/playback/pause",
      "/playback/resume",
      "/playback/mute",
      "/playback/unmute",
      "/playback/do-not-disturb",
      "/playback/skip",
      "/playback/replay"
    ]);
    expect(requests[0]?.init?.headers).toMatchObject({ authorization: "Bearer mgmt_operator" });
    expect(requests.slice(1).every(({ init }) =>
      (init?.headers as Record<string, string>)["x-stream-jams-csrf"] === "csrf_operator"
    )).toBe(true);
    expect(requests[5]?.init?.body).toBe(JSON.stringify({ enabled: true }));
    expect(requests[7]?.init?.body).toBe(JSON.stringify({ itemId: "recent-1" }));
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
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
