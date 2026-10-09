import { describe, expect, it, vi } from "vitest";
import { queuedVideos, videoItem } from "../../stories/video-queue-fixtures.js";
import { createHttpVideosApi, isVideoQueueConflict } from "./videos-api.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function createFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/auth/management/sessions") return json({ id: "session", csrfToken: "csrf" });
    return handler(url, init);
  });
}

const config = { maxLengthSeconds: 120, gapSeconds: 3, allowedDirectHosts: [], obsAudio: true, audioDeviceIds: [], audioDeviceDelaysMs: {}, streamerBotAutoplay: true, rewardMappings: [],
  layout: { x: 269, y: 140, width: 1382, height: 876 } };

describe("createHttpVideosApi", () => {
  it("attributes Operator submissions and sends guarded commands", async () => {
    const queue = queuedVideos();
    const fetcher = createFetch((url, init) => {
      if (url === "/videos/live/requests?from=operator") return json({ item: videoItem("new") }, 201);
      if (url === "/videos/test" && init?.method === undefined) return json({ ...queue, purpose: "test" });
      return json(queue);
    });
    const api = createHttpVideosApi({ fetch: fetcher, from: "operator" });
    await expect(api.submit("live", { link: "https://youtu.be/new", title: "  " })).resolves.toMatchObject({ id: "new" });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ link: "https://youtu.be/new" });
    await expect(api.getQueue("test")).resolves.toMatchObject({ purpose: "test" });
    await api.command("live", 4, { kind: "reorder", itemIds: ["b", "a"] });
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live/commands", expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedRevision: 4, command: { kind: "reorder", itemIds: ["b", "a"] } }) }));
    await api.control("live", "seek", "a", 1_000);
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live/current/seek", expect.objectContaining({ body: JSON.stringify({ expectedItemId: "a", positionMs: 1_000 }) }));
  });

  it("defaults submissions to management", async () => {
    const fetcher = createFetch(() => json({ item: videoItem("new") }, 201));
    await createHttpVideosApi({ fetch: fetcher }).submit("test", { link: "https://youtu.be/new", title: "Pick" });
    expect(fetcher).toHaveBeenLastCalledWith("/videos/test/requests?from=management", expect.objectContaining({ body: JSON.stringify({ link: "https://youtu.be/new", title: "Pick" }) }));
  });

  it("recognizes revision conflicts and rejects malformed queues", async () => {
    const fetcher = createFetch(url => url.endsWith("/commands")
      ? json({ error: { code: "VIDEO_QUEUE_CONFLICT", message: "The video queue changed. Refresh before trying again." } }, 409)
      : json({ purpose: "live", revision: "1" }));
    const api = createHttpVideosApi({ fetch: fetcher });
    const failure = await api.command("live", 1, { kind: "play-next" }).catch((error: unknown) => error);
    expect(isVideoQueueConflict(failure)).toBe(true);
    expect(isVideoQueueConflict(new Error("other"))).toBe(false);
    await expect(api.getQueue("live")).rejects.toThrow("invalid response");
  });

  it("loads settings and keeps only Videos module outputs", async () => {
    const fetcher = createFetch(url => {
      if (url === "/management/overlay-outputs") return json([
        { id: "module:videos:live", label: "Videos Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "videos", targetProfileId: null, enabled: true, keyId: "k", url: "http://127.0.0.1/overlay/modules/videos/live/key", copyableUrlStatus: "available" },
        { id: "module:timers:live", label: "Timers Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: null, enabled: true, keyId: null, url: null, copyableUrlStatus: "create-required" }
      ]);
      return json({ moduleId: "videos", enabled: false, config, updatedAt: "2026-10-08T00:00:00.000Z" });
    });
    const api = createHttpVideosApi({ fetch: fetcher });
    await expect(api.getModuleConfig()).resolves.toEqual({ enabled: false, config });
    await expect(api.saveModuleConfig(true, config)).resolves.toEqual({ enabled: false, config });
    expect(fetcher).toHaveBeenLastCalledWith("/overlay-modules/videos/config", expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: true, config }) }));
    await expect(api.listBrowserSources()).resolves.toEqual([expect.objectContaining({ id: "module:videos:live", status: "available" })]);
  });
});
