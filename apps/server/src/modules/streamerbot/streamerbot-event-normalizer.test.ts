import { readFileSync } from "node:fs";
import { normalizedStreamEventSchema } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  normalizeStreamerBotEvent,
  StreamerBotEventNormalizationError,
  type StreamerBotNormalizationResult
} from "./streamerbot-event-normalizer.js";

describe("normalizeStreamerBotEvent", () => {
  it("normalizes supported Twitch envelopes into canonical alert events", () => {
    const cases = [
      {
        fixture: "twitch-follow.json",
        expected: {
          type: "follow",
          actor: { id: "user-follow", displayName: "Follower" },
          amount: null,
          occurredAt: "2026-07-17T11:59:59.000Z"
        }
      },
      {
        fixture: "twitch-sub.json",
        expected: {
          id: "streamerbot:twitch:Sub:message-sub",
          type: "subscription",
          actor: { id: "user-sub", displayName: "Subscriber" },
          amount: 1,
          tier: "1000"
        }
      },
      {
        fixture: "twitch-resub.json",
        expected: {
          id: "streamerbot:twitch:ReSub:message-resub",
          type: "resubscription",
          actor: { id: "user-resub", displayName: "Resubscriber" },
          amount: 7,
          tier: "2000",
          streakMonths: 3,
          message: "Seven months!"
        }
      },
      {
        fixture: "twitch-cheer.json",
        expected: {
          id: "streamerbot:twitch:Cheer:message-cheer",
          type: "cheer",
          actor: { id: "user-cheer", displayName: "Cheerer" },
          amount: 500,
          message: "Great stream"
        }
      },
      {
        fixture: "twitch-raid.json",
        expected: {
          type: "raid",
          actor: { id: "user-raid", displayName: "Raider" },
          amount: 42
        }
      },
      {
        fixture: "twitch-reward-redemption.json",
        expected: {
          id: "streamerbot:twitch:RewardRedemption:redemption-1",
          type: "channel_point_redemption",
          actor: { id: "user-reward", displayName: "Redeemer" },
          amount: null,
          rewardId: "reward-1",
          rewardTitle: "Hydrate",
          userInput: "hydrate please"
        }
      }
    ] as const;

    for (const testCase of cases) {
      const envelope = fixture(testCase.fixture);
      const result = normalizeStreamerBotEvent(envelope);
      expect(result.status).toBe("normalized");
      if (result.status !== "normalized") throw new Error("Expected a normalized event");
      expect(normalizedStreamEventSchema.safeParse(result.event).success).toBe(true);
      expect(result.event).toMatchObject({
        providerId: "twitch",
        sourcePlatform: "twitch",
        ingestProvider: "streamerbot",
        metadata: {
          ingestProvider: "streamerbot",
          upstreamSource: "Twitch",
          upstreamType: envelope.event.type,
          streamerBotTimeStamp: envelope.timeStamp
        }
      });
      expect(result.event).toMatchObject(testCase.expected);
    }
  });

  it("normalizes expanded Twitch event fixtures with canonical payload parity", () => {
    const hypeTrain = fixture("twitch-hype-train.json");
    const poll = fixture("twitch-poll.json");
    const prediction = fixture("twitch-prediction.json");
    const stream = fixture("twitch-stream.json");
    const cases = [
      {
        envelope: fixture("twitch-gift-sub.json"),
        expected: {
          id: "streamerbot:twitch:GiftSub:gift-sub-1",
          type: "gift_subscription",
          actor: { id: "recipient-1", displayName: "Recipient" },
          amount: 1,
          tier: "1000",
          recipient: { id: "recipient-1", displayName: "Recipient" },
          gifter: { id: "gifter-1", displayName: "Gifter" }
        }
      },
      {
        envelope: fixture("twitch-gift-bomb.json"),
        expected: {
          id: "streamerbot:twitch:GiftBomb:gift-bomb-1",
          type: "community_gift",
          actor: { id: "gifter-1", displayName: "Gifter" },
          amount: 5,
          tier: "2000",
          cumulativeTotal: 24,
          anonymous: false
        }
      },
      ...(["HypeTrainStart", "HypeTrainUpdate", "HypeTrainEnd"] as const).map((type) => ({
        envelope: { ...hypeTrain, event: { ...hypeTrain.event, type } },
        expected: {
          type: type === "HypeTrainStart" ? "hype_train_start" : type === "HypeTrainUpdate" ? "hype_train_progress" : "hype_train_end",
          actor: { id: "broadcaster-1", displayName: "Broadcaster" },
          amount: 175,
          trainId: "train-1",
          level: 2,
          progress: 75,
          goal: 100,
          total: 175,
          startedAt: "2026-07-17T12:00:00.000Z",
          expiresAt: "2026-07-17T12:05:00.000Z",
          endedAt: "2026-07-17T12:05:00.000Z",
          cooldownEndsAt: "2026-07-17T13:05:00.000Z"
        }
      })),
      ...(["PollCreated", "PollUpdated", "PollCompleted", "PollArchived", "PollTerminated"] as const).map((type) => ({
        envelope: { ...poll, event: { ...poll.event, type } },
        expected: {
          type: type === "PollCreated" ? "poll_start" : type === "PollUpdated" ? "poll_progress" : "poll_end",
          actor: { id: "broadcaster-1", displayName: "Broadcaster" },
          amount: 17,
          pollId: "poll-1",
          title: "Which game?",
          choices: [
            { id: "choice-1", title: "Game One", totalVotes: 10 },
            { id: "choice-2", title: "Game Two", totalVotes: 7 }
          ],
          totalVotes: 17,
          startedAt: "2026-07-17T12:00:00.000Z",
          endsAt: "2026-07-17T12:05:00.000Z",
          status: type === "PollCompleted" ? "completed" : type === "PollArchived" ? "archived" : type === "PollTerminated" ? "terminated" : "active"
        }
      })),
      ...(["PredictionCreated", "PredictionUpdated", "PredictionLocked", "PredictionCompleted", "PredictionCanceled"] as const).map((type) => ({
        envelope: { ...prediction, event: { ...prediction.event, type } },
        expected: {
          type: type === "PredictionCreated" ? "prediction_start" : type === "PredictionUpdated" ? "prediction_progress" : type === "PredictionLocked" ? "prediction_lock" : "prediction_end",
          actor: { id: "broadcaster-1", displayName: "Broadcaster" },
          amount: 1200,
          predictionId: "prediction-1",
          title: "Will it happen?",
          outcomes: [
            { id: "outcome-1", title: "Yes", totalUsers: 12, totalPoints: 800 },
            { id: "outcome-2", title: "No", totalUsers: 6, totalPoints: 400 }
          ],
          totalUsers: 18,
          totalPoints: 1200,
          startedAt: "2026-07-17T12:00:00.000Z",
          locksAt: type === "PredictionLocked" ? "2026-07-17T12:03:00.000Z" : type === "PredictionCompleted" || type === "PredictionCanceled" ? null : "2026-07-17T12:03:00.000Z",
          endedAt: type === "PredictionCompleted" || type === "PredictionCanceled" ? "2026-07-17T12:05:00.000Z" : null,
          status: type === "PredictionCompleted" ? "resolved" : type === "PredictionCanceled" ? "canceled" : type === "PredictionLocked" ? "locked" : "active",
          winningOutcomeId: type === "PredictionCompleted" ? "outcome-1" : null
        }
      })),
      ...(["StreamOnline", "StreamOffline"] as const).map((type) => ({
        envelope: { ...stream, event: { ...stream.event, type } },
        expected: {
          type: type === "StreamOnline" ? "stream_online" : "stream_offline",
          actor: { id: "broadcaster-1", displayName: "Broadcaster" },
          amount: null,
          streamId: type === "StreamOnline" ? "stream-1" : null,
          streamType: type === "StreamOnline" ? "live" : null,
          startedAt: type === "StreamOnline" ? "2026-07-17T12:00:00.000Z" : null,
          endedAt: type === "StreamOffline" ? "2026-07-17T12:05:00.000Z" : null
        }
      }))
    ];

    for (const testCase of cases) {
      const event = normalized(normalizeStreamerBotEvent(testCase.envelope));
      expect(normalizedStreamEventSchema.safeParse(event).success).toBe(true);
      expect(event).toMatchObject(testCase.expected);
    }
  });

  it("uses deterministic fallback IDs when no upstream event ID exists", () => {
    const follow = fixture("twitch-follow.json");
    const first = normalized(normalizeStreamerBotEvent(follow));
    const second = normalized(normalizeStreamerBotEvent(follow));
    const later = normalized(normalizeStreamerBotEvent({ ...follow, timeStamp: "2026-07-17T12:00:01.000Z" }));

    expect(first.id).toMatch(/^streamerbot:sha256:[a-f0-9]{64}$/);
    expect(second.id).toBe(first.id);
    expect(later.id).not.toBe(first.id);
  });

  it("normalizes Prime and display tier names", () => {
    const subscription = fixture("twitch-sub.json");
    const prime = normalized(normalizeStreamerBotEvent({
      ...subscription,
      data: { ...subscription.data, is_prime: true, sub_tier: null }
    }));
    const tierThree = normalized(normalizeStreamerBotEvent({
      ...subscription,
      data: { ...subscription.data, is_prime: false, sub_tier: "Tier 3" }
    }));

    expect(prime).toMatchObject({ type: "subscription", tier: "prime" });
    expect(tierThree).toMatchObject({ type: "subscription", tier: "3000" });
  });

  it("handles anonymous cheers without user identity", () => {
    const cheer = fixture("twitch-cheer.json");
    const event = normalized(normalizeStreamerBotEvent({
      ...cheer,
      data: { ...cheer.data, anonymous: true, user: null }
    }));

    expect(event).toMatchObject({
      type: "cheer",
      actor: { id: null, displayName: "Anonymous" }
    });
  });

  it("returns unsupported without forcing unknown events into alert types", () => {
    expect(normalizeStreamerBotEvent({
      timeStamp: "2026-07-17T12:06:00.000Z",
      event: { source: "OBS", type: "SceneChanged" },
      data: { sceneName: "Live" }
    })).toEqual({ status: "unsupported", source: "OBS", type: "SceneChanged" });
    expect(normalizeStreamerBotEvent({
      ...fixture("twitch-hype-train.json"),
      event: { source: "Twitch", type: "HypeTrainLevelUp" }
    })).toEqual({ status: "unsupported", source: "Twitch", type: "HypeTrainLevelUp" });
  });

  it("rejects malformed supported payloads with a safe typed error", () => {
    const raid = fixture("twitch-raid.json");
    expect(() => normalizeStreamerBotEvent({ ...raid, data: { viewers: 42 } })).toThrow(
      StreamerBotEventNormalizationError
    );
  });
});

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as {
    readonly timeStamp: string;
    readonly event: { readonly source: string; readonly type: string };
    readonly data: Record<string, unknown>;
  };
}

function normalized(result: StreamerBotNormalizationResult) {
  if (result.status !== "normalized") throw new Error("Expected a normalized event");
  return result.event;
}
