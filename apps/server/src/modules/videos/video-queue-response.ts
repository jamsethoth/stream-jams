import type { VideoControlSupport, VideoQueueResponse, VideoSource } from "@stream-jams/core";
import { canonicalVideoLink } from "@stream-jams/core/videos";
import type { VideoQueueView } from "./video-queue-service.js";

/**
 * Pause and seek work for YouTube and direct files. Twitch control goes through the
 * desktop player host and is reported as available only while that host confirms it.
 */
export function videoControlSupport(source: VideoSource, twitchControlAvailable: boolean): VideoControlSupport {
  const supported = source.provider === "youtube" || source.provider === "direct" || twitchControlAvailable;
  return { pause: supported, seek: supported };
}

export function toVideoQueueResponse(view: VideoQueueView, now: number, twitchControlAvailable = false, mirrorAvailable = false): VideoQueueResponse {
  return {
    purpose: view.purpose,
    revision: view.revision,
    queuePaused: view.queuePaused,
    runRemaining: view.run?.remainingIds.length ?? 0,
    gapEndsAtEpochMs: view.gapEndsAtEpochMs,
    serverTimeEpochMs: now,
    mirror: { available: mirrorAvailable },
    items: view.items.map(item => ({ ...item, link: canonicalVideoLink(item.source) })),
    current: view.current === null ? null : {
      itemId: view.current.item.id,
      phase: view.current.phase,
      positionMs: view.current.clock.positionMs,
      atEpochMs: view.current.clock.atEpochMs,
      durationMs: view.current.item.durationMs,
      controls: videoControlSupport(view.current.item.source, twitchControlAvailable)
    }
  };
}
