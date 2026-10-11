import type { BusEvent, EventBusHandleOutcome, NormalizedStreamEvent } from "@stream-jams/core";
import type { EventBusConsumer } from "../events/event-bus.js";
import { videoExternalIdentity } from "./streamerbot-video-intake.js";

export interface VideosBusConsumerOptions {
  /** Handles Streamer.bot General/Custom broadcasts that carry a Videos marker. */
  readonly streamerBot: (event: BusEvent) => Promise<EventBusHandleOutcome>;
  /** Handles canonical stream events; only mapped channel point redemptions queue a video. */
  readonly channelPoints: { handleEvent(event: NormalizedStreamEvent): Promise<EventBusHandleOutcome> };
  readonly onError?: ((error: unknown, event: BusEvent) => void | Promise<void>) | undefined;
}

/**
 * The Videos module's event bus consumer: Streamer.bot video requests (including the retired VideoShoutout
 * payload) and channel point redemptions with text enter the queue through the same validated intake.
 */
export function createVideosBusConsumer(options: VideosBusConsumerOptions): EventBusConsumer {
  // Queue submissions are not idempotent, so a failed delivery is never retried and a redelivered row is ignored.
  let lastSequence = 0;
  return {
    id: "videos",
    maxAttempts: 1,
    externalPayloads: [videoExternalIdentity],
    handle: async (event: BusEvent): Promise<EventBusHandleOutcome> => {
      if (event.sequence <= lastSequence) return "no-match";
      lastSequence = event.sequence;
      try {
        return event.kind === "canonical" ? await options.channelPoints.handleEvent(event.event) : await options.streamerBot(event);
      } catch (error) {
        // error-provenance: allow expected -- video request failures are diagnosed independently of other consumers
        await options.onError?.(error, event);
        return "failed";
      }
    }
  };
}
