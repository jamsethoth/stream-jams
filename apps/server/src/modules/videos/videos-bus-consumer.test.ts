import type { BusEvent, EventBusHandleOutcome, NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { videoExternalIdentity } from "./streamerbot-video-intake.js";
import { createVideosBusConsumer } from "./videos-bus-consumer.js";

let sequence = 0;

function external(sourceKey: string, eventType: string, payload?: Record<string, unknown>): BusEvent {
  sequence += 1;
  const eventId = `sb-${sequence}`;
  return {
    kind: "external", sequence, busId: `bus-${sequence}`, eventId, sourceKind: "streamerbot", sourceRegistrationId: "provider-streamerbot",
    receivedAt: "2026-10-07T00:00:00.000Z", correlationKey: null,
    effectTriggers: [{ kind: "streamerbot-event", eventId, occurredAt: "2026-10-07T00:00:00.000Z", providerId: "provider-streamerbot", sourceKey, eventType, summary: "Custom", userName: "" }],
    ...(payload === undefined ? {} : { payload })
  };
}

function canonical(overrides: Partial<NormalizedStreamEvent> = {}): BusEvent {
  sequence += 1;
  const event = {
    id: `follow-${sequence}`, type: "follow", amount: null, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch",
    occurredAt: "2026-10-07T00:00:00.000Z", actor: { id: "friend", displayName: "Friend" }, message: null, metadata: {}, ...overrides
  } as NormalizedStreamEvent;
  return {
    kind: "canonical", event, sequence, busId: `bus-${sequence}`, eventId: event.id, sourceKind: "twitch",
    sourceRegistrationId: "provider-twitch", receivedAt: event.occurredAt, correlationKey: null, effectTriggers: []
  };
}

function createConsumer(options: { readonly failure?: Error; readonly outcome?: EventBusHandleOutcome } = {}) {
  const streamerBotEvents: BusEvent[] = [];
  const streamEvents: NormalizedStreamEvent[] = [];
  const errors: { error: unknown; event: BusEvent }[] = [];
  const consumer = createVideosBusConsumer({
    streamerBot: async event => { streamerBotEvents.push(event); return options.outcome ?? "admitted"; },
    channelPoints: {
      async handleEvent(event) {
        streamEvents.push(event);
        if (options.failure !== undefined) throw options.failure;
        return options.outcome ?? "admitted";
      }
    },
    onError: (error, event) => { errors.push({ error, event }); }
  });
  return { consumer, handle: (event: BusEvent) => consumer.handle(event, { checkpoint: () => {} }), streamerBotEvents, streamEvents, errors };
}

describe("Videos bus consumer", () => {
  it("registers for the General/Custom payload with one delivery attempt", () => {
    const { consumer } = createConsumer();
    expect(consumer).toMatchObject({ id: "videos", maxAttempts: 1, externalPayloads: [videoExternalIdentity] });
    expect(videoExternalIdentity).toEqual({ providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" });
    expect(consumer.expiresAfterReplayAge).toBeUndefined();
  });

  it("hands external events to the Streamer.bot intake and canonical events to the channel point intake", async () => {
    const { handle, streamerBotEvents, streamEvents } = createConsumer({ outcome: "no-match" });
    const broadcast = external("General", "Custom", { source: "StreamJams", type: "VideoRequest", link: "https://youtu.be/dQw4w9WgXcQ" });
    expect(await handle(broadcast)).toBe("no-match");
    const redemption = canonical({ type: "channel_point_redemption", rewardId: "reward-video", rewardTitle: "Play a video", userInput: "https://clips.twitch.tv/ClipOne" } as Partial<NormalizedStreamEvent>);
    expect(await handle(redemption)).toBe("no-match");
    expect(streamerBotEvents).toEqual([broadcast]);
    expect(streamEvents).toEqual([redemption.kind === "canonical" ? redemption.event : null]);
    expect(streamEvents[0]).toMatchObject({ userInput: "https://clips.twitch.tv/ClipOne" });
  });

  it("applies each journal row at most once", async () => {
    const { handle, streamerBotEvents } = createConsumer();
    const event = external("General", "Custom", { source: "StreamJams", type: "VideoRequest" });
    expect(await handle(event)).toBe("admitted");
    expect(await handle(event)).toBe("no-match");
    expect(streamerBotEvents).toHaveLength(1);
  });

  it("diagnoses an intake failure and reports it as failed instead of throwing", async () => {
    const failure = new Error("Video queue unavailable");
    const { handle, errors } = createConsumer({ failure });
    const redemption = canonical({ type: "channel_point_redemption", rewardId: "reward-video", rewardTitle: "Play a video", userInput: "x" } as Partial<NormalizedStreamEvent>);
    expect(await handle(redemption)).toBe("failed");
    expect(errors).toEqual([{ error: failure, event: redemption }]);
  });
});
