import { canonicalEventForSelector, type BusEvent, type EventBusHandleOutcome, type NormalizedStreamEvent } from "@stream-jams/core";
import type { EventBusConsumer } from "../events/event-bus.js";
import { rejectionOutcome, videoExternalIdentity } from "./streamerbot-video-intake.js";
import type { VideoRequestContext, VideoRequestIntake } from "./video-request-intake.js";

export interface VideosBusConsumerOptions {
  readonly intake?: Pick<VideoRequestIntake, "submit">;
  /** Handles Streamer.bot General/Custom broadcasts that carry a Videos marker. */
  readonly streamerBot: (event: BusEvent) => Promise<EventBusHandleOutcome>;
  /** Handles canonical stream events; only mapped channel point redemptions queue a video. */
  readonly channelPoints: { handleEvent(event: NormalizedStreamEvent, context?: VideoRequestContext): Promise<EventBusHandleOutcome> };
  readonly onError?: ((error: unknown, event: BusEvent) => void | Promise<void>) | undefined;
}

/**
 * The Videos module's event bus consumer: Streamer.bot video requests (including the retired VideoShoutout
 * payload) and channel point redemptions with text enter the queue through the same validated intake.
 */
export function createVideosBusConsumer(options: VideosBusConsumerOptions): EventBusConsumer {
  return {
    id: "videos",
    maxAttempts: 1,
    externalPayloads: [videoExternalIdentity],
    handle: async (event: BusEvent): Promise<EventBusHandleOutcome> => {
      try {
        const context: VideoRequestContext = {
          busIdentity: { busId: event.busId, eventId: event.eventId },
          via: event.kind === "manual" ? event.submission.channel : "channel-points",
          mayAutoplay: event.kind === "manual" ? event.submission.mayAutoplay : false
        };
        if (event.kind === "manual" && event.action.kind === "video-request") {
          if (options.intake === undefined) return "no-match";
          const result = await options.intake.submit("live", event.action.request, context);
          return result.status === "accepted" ? "admitted" : rejectionOutcome(result.reason);
        }
        const canonical = canonicalEventForSelector(event);
        if (canonical !== null) return await options.channelPoints.handleEvent(canonical, { ...context, policy: "channel-points" });
        if (event.kind === "manual" && event.action.kind !== "simulate-external") return "no-match";
        return await options.streamerBot(event);
      } catch (error) {
        // error-provenance: allow expected -- video request failures are diagnosed independently of other consumers
        await options.onError?.(error, event);
        return "failed";
      }
    }
  };
}
