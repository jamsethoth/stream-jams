import { sceneOutputCanvas } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { describedVideos, queuedVideos, recentVideos, videoItem } from "../../stories/video-queue-fixtures.js";
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
  layout: { schemaVersion: 2 as const, content: { width: 1382, height: 876 }, desktopPlacement: { x: 269, y: 140, scale: 1 } } };

describe("createHttpVideosApi", () => {
  it("retains pending identity and reads a late outcome without repeating submission", async () => {
    const pending = { status: "pending", busId: "pending-bus", eventId: "pending-event" };
    const fetcher = createFetch(url => url.includes("/submissions/") ? json({ item: videoItem("late"), busId: pending.busId, eventId: pending.eventId }, 201) : json(pending, 202));
    const api = createHttpVideosApi({ fetch: fetcher });
    await expect(api.submit({ link: "https://youtu.be/new" })).resolves.toEqual(pending);
    await expect(api.submission("pending-bus")).resolves.toMatchObject({ id: "late" });
    expect(fetcher.mock.calls.filter(call => String(call[0]).includes("/requests"))).toHaveLength(1);
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/videos/live/submissions/pending-bus");
  });
  it("attributes Operator submissions and sends guarded commands", async () => {
    const queue = queuedVideos();
    const fetcher = createFetch((url) => {
      if (url === "/videos/live/requests?from=operator") return json({ item: videoItem("new") }, 201);
      return json(queue);
    });
    const api = createHttpVideosApi({ fetch: fetcher, from: "operator" });
    await expect(api.submit({ link: "https://youtu.be/new", title: "  " })).resolves.toMatchObject({ id: "new" });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ link: "https://youtu.be/new" });
    await expect(api.getQueue()).resolves.toEqual(queue);
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live", expect.objectContaining({ headers: expect.any(Headers) }));
    await api.command(4, { kind: "reorder", itemIds: ["b", "a"] });
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live/commands", expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedRevision: 4, command: { kind: "reorder", itemIds: ["b", "a"] } }) }));
    await api.control("seek", "a", 1_000);
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live/current/seek", expect.objectContaining({ body: JSON.stringify({ expectedItemId: "a", positionMs: 1_000 }) }));
    await api.requeue(7, "video:done");
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live/recent/requeue?from=operator", expect.objectContaining({ method: "POST", body: JSON.stringify({ expectedRevision: 7, itemId: "video:done" }) }));
  });

  it("accepts Recent items and rejects malformed ones", async () => {
    const valid = recentVideos();
    let body: unknown = valid;
    const api = createHttpVideosApi({ fetch: createFetch(() => json(body)) });
    await expect(api.getQueue()).resolves.toMatchObject({ recent: [{ id: "done" }, { id: "broken", status: "failed" }, { id: "file" }] });
    for (const recent of [undefined, [{ ...valid.recent[0], status: "removed" }], [{ ...valid.recent[0], finishedAt: "later" }], [{ ...valid.recent[0], link: undefined }]]) {
      body = { ...valid, recent };
      await expect(api.getQueue()).rejects.toThrow("invalid response");
    }
  });

  it("accepts provider titles and channels and rejects malformed ones", async () => {
    const valid = describedVideos();
    let body: unknown = valid;
    const api = createHttpVideosApi({ fetch: createFetch(() => json(body)) });
    await expect(api.getQueue()).resolves.toMatchObject({ items: [{ id: "yt", providerTitle: "Never Gonna Give You Up (Official Video)", channelName: "Rick Astley" }, {}, {}, {}, {}] });
    for (const change of [{ providerTitle: 5 }, { channelName: { name: "x" } }, { providerTitle: undefined }]) {
      body = { ...valid, items: [{ ...valid.items[0], ...change }] };
      await expect(api.getQueue()).rejects.toThrow("invalid response");
    }
  });

  it("defaults submissions to management", async () => {
    const fetcher = createFetch(() => json({ item: videoItem("new") }, 201));
    await createHttpVideosApi({ fetch: fetcher }).submit({ link: "https://youtu.be/new", title: "Pick" });
    expect(fetcher).toHaveBeenLastCalledWith("/videos/live/requests?from=management", expect.objectContaining({ body: JSON.stringify({ link: "https://youtu.be/new", title: "Pick" }) }));
  });

  it("recognizes revision conflicts and rejects malformed queues", async () => {
    const fetcher = createFetch(url => url.endsWith("/commands")
      ? json({ error: { code: "VIDEO_QUEUE_CONFLICT", message: "The video queue changed. Refresh before trying again." } }, 409)
      : json({ purpose: "live", revision: "1" }));
    const api = createHttpVideosApi({ fetch: fetcher });
    const failure = await api.command(1, { kind: "play-next" }).catch((error: unknown) => error);
    expect(isVideoQueueConflict(failure)).toBe(true);
    expect(isVideoQueueConflict(new Error("other"))).toBe(false);
    await expect(api.getQueue()).rejects.toThrow("invalid response");
  });

  it("loads settings and keeps only Videos module outputs", async () => {
    const fetcher = createFetch(url => {
      if (url === "/management/overlay-outputs") return json([
        { canvas: sceneOutputCanvas(0, 1920, 1080), id: "module:videos:live", label: "Videos Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "videos", targetProfileId: null, enabled: true, keyId: "k", url: "http://127.0.0.1/overlay/modules/videos/live/key", copyableUrlStatus: "available" },
        { canvas: sceneOutputCanvas(0, 1920, 1080), id: "module:videos:test", label: "Retired Videos", purpose: "test", overlayId: "default", scope: "module", moduleId: "videos", targetProfileId: null, enabled: true, keyId: "old", url: null, copyableUrlStatus: "create-required" },
        { canvas: sceneOutputCanvas(0, 1920, 1080), id: "module:timers:live", label: "Timers Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: null, enabled: true, keyId: null, url: null, copyableUrlStatus: "create-required" }
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
