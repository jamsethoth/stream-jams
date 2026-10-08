import type { VideoQueueResponse } from "@stream-jams/core";
import type { VideoQueueApi, VideoQueueItem, VideosApi } from "../management/videos/videos-api.js";

const createdAt = "2026-10-08T18:00:00.000Z";

export function videoItem(id: string, overrides: Partial<VideoQueueItem> = {}): VideoQueueItem {
  return {
    id, purpose: "live", source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title: `Video ${id}`, requester: "viewer_one",
    submittedVia: "streamerbot", durationMs: 95_000, status: "queued", holdReason: null, limitOverridden: false, autoplay: false,
    position: 1, createdAt, link: `https://youtu.be/${id}`, ...overrides
  };
}

export function videoQueue(overrides: Partial<VideoQueueResponse> = {}): VideoQueueResponse {
  return { purpose: "live", revision: 4, queuePaused: false, runRemaining: 0, gapEndsAtEpochMs: null, serverTimeEpochMs: Date.now(), items: [], current: null, ...overrides };
}

export const queuedVideos = (): VideoQueueResponse => videoQueue({ items: [
  videoItem("a", { title: "Cat plays keyboard", position: 1 }),
  videoItem("b", { title: "Speedrun highlight", requester: "speedy", submittedVia: "channel-points", durationMs: 42_000, position: 2 }),
  videoItem("c", { title: null, requester: null, submittedVia: "management", position: 3, source: { provider: "direct", url: "https://videos.example.com/clip.mp4" }, link: "https://videos.example.com/clip.mp4" })
] });

export const heldVideos = (): VideoQueueResponse => videoQueue({ items: [
  videoItem("long", { title: "Full concert", durationMs: 3_600_000, status: "held", holdReason: "over-limit", position: 1 }),
  videoItem("unknown", { title: "Mystery link", durationMs: null, status: "held", holdReason: "unknown-length", position: 2 }),
  videoItem("short", { title: "Short clip", position: 3 })
] });

export const playingVideo = (phase: "playing" | "paused" = "playing", seek = true): VideoQueueResponse => {
  const now = Date.now();
  return videoQueue({ serverTimeEpochMs: now, runRemaining: 1, items: [
    videoItem("now", { title: "Now playing clip", status: phase, durationMs: 180_000, position: 0 }),
    videoItem("next", { title: "Up next", position: 1 })
  ], current: { itemId: "now", phase, positionMs: 80_000, atEpochMs: now, durationMs: 180_000, controls: { pause: seek, seek } } });
};

export const twitchClipPlaying = (): VideoQueueResponse => {
  const now = Date.now();
  return videoQueue({ serverTimeEpochMs: now, items: [
    videoItem("clip", { title: "Big play clip", status: "playing", durationMs: 30_000, position: 0, source: { provider: "twitch-clip", clipSlug: "FunnyClip" }, link: "https://clips.twitch.tv/FunnyClip" })
  ], current: { itemId: "clip", phase: "playing", positionMs: 5_000, atEpochMs: now, durationMs: 30_000, controls: { pause: false, seek: false } } });
};

/** In-memory queue client for stories and tests; every call resolves with the configured queue. */
export function createStaticVideoQueueApi(queue: VideoQueueResponse, overrides: Partial<VideoQueueApi> = {}): VideoQueueApi {
  return {
    getQueue: async () => queue,
    submit: async (_purpose, input) => videoItem("added", { link: input.link, title: input.title ?? null, submittedVia: "management" }),
    command: async () => queue,
    control: async () => queue,
    ...overrides
  };
}

export function createStaticVideosApi(queue: VideoQueueResponse, overrides: Partial<VideosApi> = {}): VideosApi {
  return {
    ...createStaticVideoQueueApi(queue),
    getModuleConfig: async () => ({ enabled: true, config: { maxLengthSeconds: 120, gapSeconds: 3, allowedDirectHosts: ["videos.example.com"], obsAudio: true,
      audioDeviceIds: ["stream"], streamerBotAutoplay: true, rewardMappings: [{ rewardId: "reward-video", purpose: "live" }] } }),
    saveModuleConfig: async (enabled, config) => ({ enabled, config }),
    setModuleEnabled: async enabled => enabled,
    listBrowserSources: async () => [
      { id: "module:videos:live", label: "Videos Live", purpose: "live", overlayId: "default", enabled: true, url: "http://127.0.0.1:39187/overlay/modules/videos/live/story-placeholder", status: "available" },
      { id: "module:videos:test", label: "Videos Test", purpose: "test", overlayId: "default", enabled: true, url: null, status: "create-required" }
    ],
    createBrowserSource: async () => {},
    regenerateBrowserSource: async () => {},
    ...overrides
  };
}
