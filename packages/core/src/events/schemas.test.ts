import { describe, expect, it } from "vitest";
import {
  externalStreamEventSchema,
  ingestProviderIdSchema,
  normalizedStreamEventSchema,
  sourcePlatformIdSchema,
  streamerBotSubscriptionSelectionSchema
} from "./schemas.js";

const baseEvent = {
  id: "evt-1",
  providerId: "twitch",
  sourcePlatform: "twitch",
  ingestProvider: "twitch",
  occurredAt: "2026-05-22T12:34:56.000Z",
  actor: {
    id: "user-1",
    displayName: "JamSeth"
  },
  message: null,
  metadata: {}
} as const;

describe("normalizedStreamEventSchema", () => {
  it("accepts representative MVP event payloads", () => {
    const payloads = [
      { ...baseEvent, type: "follow", amount: null },
      { ...baseEvent, id: "evt-2", type: "subscription", amount: 1, tier: "1000" },
      { ...baseEvent, id: "evt-3", type: "cheer", amount: 500, message: "great stream" },
      { ...baseEvent, id: "evt-4", type: "raid", amount: 42 },
      {
        ...baseEvent,
        id: "evt-5",
        type: "channel_point_redemption",
        amount: null,
        rewardId: "reward-1",
        rewardTitle: "Hydrate",
        userInput: "please drink water"
      }
    ];

    for (const payload of payloads) {
      expect(normalizedStreamEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects missing required event identity", () => {
    const payloadWithoutId = {
      providerId: baseEvent.providerId,
      sourcePlatform: baseEvent.sourcePlatform,
      ingestProvider: baseEvent.ingestProvider,
      occurredAt: baseEvent.occurredAt,
      actor: baseEvent.actor,
      message: baseEvent.message,
      metadata: baseEvent.metadata,
      type: "follow",
      amount: null
    };

    expect(normalizedStreamEventSchema.safeParse(payloadWithoutId).success).toBe(false);
  });

  it("requires normalized source identity fields", () => {
    const payload = { ...baseEvent, type: "follow", amount: null };
    const withoutSourcePlatform: Record<string, unknown> = { ...payload };
    const withoutIngestProvider: Record<string, unknown> = { ...payload };
    delete withoutSourcePlatform.sourcePlatform;
    delete withoutIngestProvider.ingestProvider;

    expect(normalizedStreamEventSchema.safeParse(withoutSourcePlatform).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse(withoutIngestProvider).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...payload, sourcePlatform: "streamerbot" }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...payload, ingestProvider: "speakerbot" }).success).toBe(false);
  });

  it("rejects unsupported event types", () => {
    const payload = {
      ...baseEvent,
      type: "hype_train_begin",
      amount: null
    };

    expect(normalizedStreamEventSchema.safeParse(payload).success).toBe(false);
  });
});

describe("event source schemas", () => {
  it("accept expected source platforms and ingest providers", () => {
    expect(sourcePlatformIdSchema.safeParse("twitch").success).toBe(true);
    expect(sourcePlatformIdSchema.safeParse("streamerbot").success).toBe(false);
    expect(ingestProviderIdSchema.safeParse("twitch").success).toBe(true);
    expect(ingestProviderIdSchema.safeParse("streamerbot").success).toBe(true);
    expect(ingestProviderIdSchema.safeParse("speakerbot").success).toBe(false);
  });

  it("accepts generic external events with subscription source identity", () => {
    const externalEvent = {
      id: "external-event-1",
      ingestProvider: "streamerbot",
      subscriptionSourceKey: "streamerbot:twitch",
      upstreamSource: "twitch",
      upstreamType: "channel.follow",
      occurredAt: "2026-05-22T12:34:56.000Z",
      receivedAt: "2026-05-22T12:34:57.000Z",
      payload: {
        user_name: "Viewer"
      },
      metadata: {
        socketProfileId: "default"
      }
    };

    expect(externalStreamEventSchema.parse(externalEvent)).toEqual(externalEvent);
    expect(externalStreamEventSchema.safeParse({ ...externalEvent, subscriptionSourceKey: null }).success).toBe(true);
    expect(externalStreamEventSchema.safeParse({ ...externalEvent, subscriptionSourceKey: "" }).success).toBe(false);
    expect(externalStreamEventSchema.safeParse({ ...externalEvent, ingestProvider: "twitch" }).success).toBe(false);
  });

  it("accepts Streamer.bot subscription selections for later runtime wiring", () => {
    const selection = {
      sourceKey: "streamerbot:twitch",
      eventTypes: ["channel.follow", "channel.cheer"]
    };

    expect(streamerBotSubscriptionSelectionSchema.parse(selection)).toEqual(selection);
    expect(streamerBotSubscriptionSelectionSchema.safeParse({ ...selection, sourceKey: "" }).success).toBe(false);
    expect(streamerBotSubscriptionSelectionSchema.safeParse({ ...selection, eventTypes: [] }).success).toBe(false);
  });
});
