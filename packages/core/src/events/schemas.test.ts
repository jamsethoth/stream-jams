import { describe, expect, it } from "vitest";
import {
  externalStreamEventSchema,
  ingestProviderIdSchema,
  normalizedStreamEventSchema,
  sourcePlatformIdSchema,
  streamEventTypeSchema,
  streamerBotSubscriptionSelectionSchema
} from "./schemas.js";
import { streamEventTypes } from "./types.js";

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
  it("accepts every canonical event type and rejects unknown types", () => {
    const eventTypes = [
      "follow", "subscription", "resubscription", "cheer", "raid", "channel_point_redemption",
      "gift_subscription", "community_gift",
      "hype_train_start", "hype_train_progress", "hype_train_end",
      "poll_start", "poll_progress", "poll_end",
      "prediction_start", "prediction_progress", "prediction_lock", "prediction_end",
      "stream_online", "stream_offline"
    ] as const;

    expect(streamEventTypes).toEqual(eventTypes);

    for (const type of eventTypes) {
      expect(streamEventTypeSchema.safeParse(type).success).toBe(true);
    }

    expect(streamEventTypeSchema.safeParse("donation").success).toBe(false);
  });

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

  it("accepts representative canonical event payloads", () => {
    const payloads = [
      {
        ...baseEvent,
        id: "evt-gift-subscription",
        type: "gift_subscription",
        amount: 1,
        tier: "1000",
        recipient: { id: "recipient-1", displayName: "Recipient" },
        gifter: null
      },
      {
        ...baseEvent,
        id: "evt-community-gift",
        type: "community_gift",
        amount: 5,
        tier: "2000",
        cumulativeTotal: 20,
        anonymous: true
      },
      ...(["start", "progress", "end"] as const).map((phase) => ({
        ...baseEvent,
        id: `evt-hype-train-${phase}`,
        type: `hype_train_${phase}`,
        amount: 500,
        trainId: "train-1",
        level: 2,
        progress: 500,
        goal: 1000,
        total: 500,
        startedAt: "2026-05-22T12:34:56.000Z",
        expiresAt: "2026-05-22T12:39:56.000Z",
        endedAt: phase === "end" ? "2026-05-22T12:39:56.000Z" : null,
        cooldownEndsAt: phase === "end" ? "2026-05-22T13:39:56.000Z" : null
      })),
      ...(["start", "progress", "end"] as const).map((phase) => ({
        ...baseEvent,
        id: `evt-poll-${phase}`,
        type: `poll_${phase}`,
        amount: 12,
        pollId: "poll-1",
        title: "What should we play?",
        choices: [{ id: "choice-1", title: "Game A", totalVotes: 12 }],
        totalVotes: 12,
        startedAt: "2026-05-22T12:34:56.000Z",
        endsAt: "2026-05-22T12:39:56.000Z",
        status: phase === "end" ? "completed" : "active"
      })),
      ...(["start", "progress", "lock", "end"] as const).map((phase) => ({
        ...baseEvent,
        id: `evt-prediction-${phase}`,
        type: `prediction_${phase}`,
        amount: 1000,
        predictionId: "prediction-1",
        title: "Will we win?",
        outcomes: [{ id: "outcome-1", title: "Yes", totalUsers: 10, totalPoints: 1000 }],
        totalUsers: 10,
        totalPoints: 1000,
        startedAt: "2026-05-22T12:34:56.000Z",
        locksAt: "2026-05-22T12:39:56.000Z",
        endedAt: phase === "end" ? "2026-05-22T12:39:56.000Z" : null,
        status: phase === "end" ? "resolved" : phase === "lock" ? "locked" : "active",
        winningOutcomeId: phase === "end" ? "outcome-1" : null
      })),
      {
        ...baseEvent,
        id: "evt-stream-online",
        type: "stream_online",
        amount: null,
        streamId: "stream-1",
        streamType: "live",
        startedAt: "2026-05-22T12:34:56.000Z",
        endedAt: null
      },
      {
        ...baseEvent,
        id: "evt-stream-offline",
        type: "stream_offline",
        amount: null,
        streamId: "stream-1",
        streamType: "live",
        startedAt: "2026-05-22T12:34:56.000Z",
        endedAt: "2026-05-22T13:34:56.000Z"
      }
    ];

    for (const payload of payloads) {
      expect(normalizedStreamEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects incomplete poll choices and prediction outcomes", () => {
    const poll = {
      ...baseEvent,
      type: "poll_progress",
      amount: 12,
      pollId: "poll-1",
      title: "What should we play?",
      choices: [{ id: "choice-1", title: "Game A", totalVotes: 12 }],
      totalVotes: 12,
      startedAt: "2026-05-22T12:34:56.000Z",
      endsAt: "2026-05-22T12:39:56.000Z",
      status: "active"
    };
    const prediction = {
      ...baseEvent,
      type: "prediction_progress",
      amount: 1000,
      predictionId: "prediction-1",
      title: "Will we win?",
      outcomes: [{ id: "outcome-1", title: "Yes", totalUsers: 10, totalPoints: 1000 }],
      totalUsers: 10,
      totalPoints: 1000,
      startedAt: "2026-05-22T12:34:56.000Z",
      locksAt: "2026-05-22T12:39:56.000Z",
      endedAt: null,
      status: "active",
      winningOutcomeId: null
    };

    expect(normalizedStreamEventSchema.safeParse({ ...poll, choices: [{ title: "Game A", totalVotes: 12 }] }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...poll, choices: [{ id: "choice-1", totalVotes: 12 }] }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...poll, choices: [{ id: "choice-1", title: "Game A", totalVotes: 12.5 }] }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...prediction, outcomes: [{ title: "Yes", totalUsers: 10, totalPoints: 1000 }] }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...prediction, outcomes: [{ id: "outcome-1", totalUsers: 10, totalPoints: 1000 }] }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...prediction, outcomes: [{ id: "outcome-1", title: "Yes", totalUsers: 10.5, totalPoints: 1000 }] }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...prediction, outcomes: [{ id: "outcome-1", title: "Yes", totalUsers: 10, totalPoints: 1000.5 }] }).success).toBe(false);
  });

  it("requires canonical aggregate amounts", () => {
    const hypeTrain = {
      ...baseEvent,
      type: "hype_train_progress",
      amount: 500,
      trainId: "train-1",
      level: 2,
      progress: 500,
      goal: 1000,
      total: 500,
      startedAt: "2026-05-22T12:34:56.000Z",
      expiresAt: "2026-05-22T12:39:56.000Z",
      endedAt: null,
      cooldownEndsAt: null
    };
    const poll = {
      ...baseEvent,
      type: "poll_progress",
      amount: 12,
      pollId: "poll-1",
      title: "What should we play?",
      choices: [{ id: "choice-1", title: "Game A", totalVotes: 12 }],
      totalVotes: 12,
      startedAt: "2026-05-22T12:34:56.000Z",
      endsAt: "2026-05-22T12:39:56.000Z",
      status: "active"
    };
    const prediction = {
      ...baseEvent,
      type: "prediction_progress",
      amount: 1000,
      predictionId: "prediction-1",
      title: "Will we win?",
      outcomes: [{ id: "outcome-1", title: "Yes", totalUsers: 10, totalPoints: 1000 }],
      totalUsers: 10,
      totalPoints: 1000,
      startedAt: "2026-05-22T12:34:56.000Z",
      locksAt: "2026-05-22T12:39:56.000Z",
      endedAt: null,
      status: "active",
      winningOutcomeId: null
    };

    expect(normalizedStreamEventSchema.safeParse({ ...hypeTrain, amount: 499 }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...hypeTrain, amount: null, total: 500 }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...hypeTrain, amount: null, total: null }).success).toBe(true);
    expect(normalizedStreamEventSchema.safeParse({ ...poll, amount: 11 }).success).toBe(false);
    expect(normalizedStreamEventSchema.safeParse({ ...prediction, amount: 999 }).success).toBe(false);
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
