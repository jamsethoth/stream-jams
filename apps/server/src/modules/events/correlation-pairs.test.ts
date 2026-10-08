import { streamEventTypes, twitchCorrelationKey, type NormalizedStreamEvent, type StreamEventType } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { normalizeStreamerBotEvent } from "../streamerbot/streamerbot-event-normalizer.js";
import { normalizeTwitchEventSubNotification } from "../twitch/twitch-event-normalizer.js";

const broadcaster = { broadcaster_user_id: "broadcaster-1", broadcaster_user_login: "broadcaster", broadcaster_user_name: "Broadcaster" };
const sbBroadcaster = { id: "broadcaster-1", login: "broadcaster", name: "Broadcaster" };
const viewer = { user_id: "viewer-1", user_login: "viewer", user_name: "Viewer" };
const sbViewer = { id: "viewer-1", login: "viewer", name: "Viewer" };

const pollChoices = [{ id: "choice-1", title: "One", votes: 10 }, { id: "choice-2", title: "Two", votes: 7 }];
const sbPollChoices = [{ id: "choice-1", title: "One", totalVotes: 10 }, { id: "choice-2", title: "Two", totalVotes: 7 }];
const outcomes = [{ id: "outcome-1", title: "Yes", users: 12, channel_points: 800 }, { id: "outcome-2", title: "No", users: 6, channel_points: 400 }];
const sbOutcomes = [{ id: "outcome-1", title: "Yes", totalUsers: 12, totalPoints: 800 }, { id: "outcome-2", title: "No", totalUsers: 6, totalPoints: 400 }];
const hypeTrain = { id: "train-1", level: 2, progress: 75, goal: 100, total: 175, started_at: "2026-10-08T11:55:00.000Z" };
const sbHypeTrain = { broadcaster: sbBroadcaster, id: "train-1", level: 2, progress: 75, goal: 100, total: 175, startedAt: "2026-10-08T11:55:00.000Z" };
const poll = { id: "poll-1", title: "Which game?", started_at: "2026-10-08T11:55:00.000Z" };
const sbPoll = { broadcaster: sbBroadcaster, id: "poll-1", title: "Which game?", startedAt: "2026-10-08T11:55:00.000Z" };
const prediction = { id: "prediction-1", title: "Will it happen?", started_at: "2026-10-08T11:55:00.000Z" };
const sbPrediction = { broadcaster: sbBroadcaster, id: "prediction-1", title: "Will it happen?", startedAt: "2026-10-08T11:55:00.000Z" };

interface PairedCase {
  readonly type: StreamEventType;
  readonly label?: string;
  readonly eventSub: { readonly type: string; readonly version: string; readonly event: Record<string, unknown> };
  readonly streamerBot: { readonly type: string; readonly data: Record<string, unknown> };
}

/** The same occurrence as direct EventSub and Streamer.bot report it, one or more per canonical type. */
const pairedCases: readonly PairedCase[] = [
  {
    type: "follow",
    eventSub: { type: "channel.follow", version: "2", event: { ...broadcaster, ...viewer, followed_at: "2026-10-08T12:00:00.000Z" } },
    streamerBot: { type: "Follow", data: { targetUser: sbViewer, followedAt: "2026-10-08T12:00:00.000Z" } }
  },
  {
    type: "subscription",
    eventSub: { type: "channel.subscribe", version: "1", event: { ...broadcaster, ...viewer, tier: "1000", is_gift: false } },
    streamerBot: { type: "Sub", data: { user: sbViewer, messageId: "sub-1", sub_tier: "1000", is_prime: false } }
  },
  {
    type: "subscription",
    label: "Prime, which EventSub reports as tier 1000",
    eventSub: { type: "channel.subscribe", version: "1", event: { ...broadcaster, ...viewer, tier: "1000", is_gift: false } },
    streamerBot: { type: "Sub", data: { user: sbViewer, messageId: "sub-2", sub_tier: "1000", is_prime: true } }
  },
  {
    type: "resubscription",
    eventSub: {
      type: "channel.subscription.message", version: "1",
      event: { ...broadcaster, ...viewer, tier: "2000", cumulative_months: 7, streak_months: 3, duration_months: 1, message: { text: "Seven months Kappa", emotes: [] } }
    },
    streamerBot: { type: "ReSub", data: { user: sbViewer, messageId: "resub-1", subTier: "Tier 2", cumulativeMonths: 7, streakMonths: 3, text: "Seven months Kappa" } }
  },
  {
    type: "cheer",
    eventSub: { type: "channel.cheer", version: "1", event: { ...broadcaster, ...viewer, is_anonymous: false, bits: 500, message: "Cheer500 great stream" } },
    streamerBot: { type: "Cheer", data: { user: sbViewer, messageId: "cheer-1", anonymous: false, bits: 500, text: "great stream" } }
  },
  {
    type: "cheer",
    label: "anonymous",
    eventSub: {
      type: "channel.cheer", version: "1",
      event: { ...broadcaster, user_id: null, user_login: null, user_name: null, is_anonymous: true, bits: 100, message: "Cheer100" }
    },
    streamerBot: { type: "Cheer", data: { user: null, messageId: "cheer-2", anonymous: true, bits: 100, text: "Cheer100" } }
  },
  {
    type: "raid",
    eventSub: {
      type: "channel.raid", version: "1",
      event: {
        from_broadcaster_user_id: "raider-1", from_broadcaster_user_login: "raider", from_broadcaster_user_name: "Raider",
        to_broadcaster_user_id: "broadcaster-1", to_broadcaster_user_login: "broadcaster", to_broadcaster_user_name: "Broadcaster", viewers: 42
      }
    },
    streamerBot: { type: "Raid", data: { user: { id: "raider-1", login: "raider", name: "Raider" }, messageId: "raid-1", viewers: 42 } }
  },
  {
    type: "channel_point_redemption",
    eventSub: {
      type: "channel.channel_points_custom_reward_redemption.add", version: "1",
      event: {
        ...broadcaster, ...viewer, id: "redemption-1", user_input: "hydrate please", status: "unfulfilled",
        reward: { id: "reward-1", title: "Hydrate", cost: 100, prompt: "" }, redeemed_at: "2026-10-08T12:00:00.000Z"
      }
    },
    streamerBot: { type: "RewardRedemption", data: { user: sbViewer, redemptionId: "redemption-1", rewardId: "reward-1", rewardName: "Hydrate", rawInput: "hydrate please" } }
  },
  {
    type: "gift_subscription",
    eventSub: {
      type: "channel.subscribe", version: "1",
      event: { ...broadcaster, user_id: "recipient-1", user_login: "recipient", user_name: "Recipient", tier: "1000", is_gift: true }
    },
    streamerBot: {
      type: "GiftSub",
      data: { user: sbViewer, recipient: { id: "recipient-1", login: "recipient", name: "Recipient" }, messageId: "gift-1", subTier: "Tier 1" }
    }
  },
  {
    type: "community_gift",
    eventSub: {
      type: "channel.subscription.gift", version: "1",
      event: { ...broadcaster, ...viewer, total: 5, tier: "2000", cumulative_total: 24, is_anonymous: false }
    },
    streamerBot: { type: "GiftBomb", data: { user: sbViewer, messageId: "bomb-1", total: 5, sub_tier: "Tier 2", cumulative_total: 24 } }
  },
  {
    type: "hype_train_start",
    eventSub: { type: "channel.hype_train.begin", version: "1", event: { ...broadcaster, ...hypeTrain, expires_at: "2026-10-08T12:05:00.000Z" } },
    streamerBot: { type: "HypeTrainStart", data: { ...sbHypeTrain, expiresAt: "2026-10-08T12:05:00.000Z" } }
  },
  {
    type: "hype_train_progress",
    eventSub: { type: "channel.hype_train.progress", version: "1", event: { ...broadcaster, ...hypeTrain, expires_at: "2026-10-08T12:05:00.000Z" } },
    streamerBot: { type: "HypeTrainUpdate", data: { ...sbHypeTrain, expiresAt: "2026-10-08T12:05:00.000Z" } }
  },
  {
    type: "hype_train_end",
    eventSub: {
      type: "channel.hype_train.end", version: "1",
      event: { ...broadcaster, ...hypeTrain, ended_at: "2026-10-08T12:05:00.000Z", cooldown_ends_at: "2026-10-08T13:05:00.000Z" }
    },
    streamerBot: { type: "HypeTrainEnd", data: { ...sbHypeTrain, endedAt: "2026-10-08T12:05:00.000Z", cooldownEndsAt: "2026-10-08T13:05:00.000Z" } }
  },
  {
    type: "poll_start",
    eventSub: { type: "channel.poll.begin", version: "1", event: { ...broadcaster, ...poll, choices: pollChoices.map(({ id, title }) => ({ id, title })), ends_at: "2026-10-08T12:05:00.000Z" } },
    streamerBot: { type: "PollCreated", data: { ...sbPoll, choices: sbPollChoices.map(({ id, title }) => ({ id, title })), endsAt: "2026-10-08T12:05:00.000Z" } }
  },
  {
    type: "poll_progress",
    eventSub: { type: "channel.poll.progress", version: "1", event: { ...broadcaster, ...poll, choices: pollChoices, ends_at: "2026-10-08T12:05:00.000Z" } },
    streamerBot: { type: "PollUpdated", data: { ...sbPoll, choices: sbPollChoices, endsAt: "2026-10-08T12:05:00.000Z" } }
  },
  {
    type: "poll_end",
    eventSub: { type: "channel.poll.end", version: "1", event: { ...broadcaster, ...poll, choices: pollChoices, status: "completed", ended_at: "2026-10-08T12:05:00.000Z" } },
    streamerBot: { type: "PollCompleted", data: { ...sbPoll, choices: sbPollChoices, endedAt: "2026-10-08T12:05:00.000Z" } }
  },
  {
    type: "prediction_start",
    eventSub: {
      type: "channel.prediction.begin", version: "1",
      event: { ...broadcaster, ...prediction, outcomes: outcomes.map(({ id, title }) => ({ id, title })), locks_at: "2026-10-08T12:03:00.000Z" }
    },
    streamerBot: { type: "PredictionCreated", data: { ...sbPrediction, outcomes: sbOutcomes.map(({ id, title }) => ({ id, title })), locksAt: "2026-10-08T12:03:00.000Z" } }
  },
  {
    type: "prediction_progress",
    eventSub: { type: "channel.prediction.progress", version: "1", event: { ...broadcaster, ...prediction, outcomes, locks_at: "2026-10-08T12:03:00.000Z" } },
    streamerBot: { type: "PredictionUpdated", data: { ...sbPrediction, outcomes: sbOutcomes, locksAt: "2026-10-08T12:03:00.000Z" } }
  },
  {
    type: "prediction_lock",
    eventSub: { type: "channel.prediction.lock", version: "1", event: { ...broadcaster, ...prediction, outcomes, locked_at: "2026-10-08T12:03:00.000Z" } },
    streamerBot: { type: "PredictionLocked", data: { ...sbPrediction, outcomes: sbOutcomes, lockedAt: "2026-10-08T12:03:00.000Z" } }
  },
  {
    type: "prediction_end",
    eventSub: {
      type: "channel.prediction.end", version: "1",
      event: { ...broadcaster, ...prediction, outcomes, status: "resolved", winning_outcome_id: "outcome-1", ended_at: "2026-10-08T12:05:00.000Z" }
    },
    streamerBot: { type: "PredictionCompleted", data: { ...sbPrediction, outcomes: sbOutcomes, winningOutcomeId: "outcome-1", endedAt: "2026-10-08T12:05:00.000Z" } }
  },
  {
    type: "stream_online",
    eventSub: { type: "stream.online", version: "1", event: { ...broadcaster, id: "stream-1", type: "live", started_at: "2026-10-08T12:00:00.000Z" } },
    streamerBot: { type: "StreamOnline", data: { broadcaster: sbBroadcaster, type: "live", startedAt: "2026-10-08T12:00:00.000Z" } }
  },
  {
    type: "stream_offline",
    eventSub: { type: "stream.offline", version: "1", event: { ...broadcaster } },
    streamerBot: { type: "StreamOffline", data: { broadcaster: sbBroadcaster, endedAt: "2026-10-08T12:00:00.000Z" } }
  }
];

describe("Twitch correlation keys across sources", () => {
  it("covers every canonical Twitch event type", () => {
    expect(new Set(pairedCases.map((pair) => pair.type))).toEqual(new Set(streamEventTypes));
  });

  it.each(pairedCases.map((pair) => [pair.label === undefined ? pair.type : `${pair.type} (${pair.label})`, pair] as const))(
    "gives the direct Twitch and Streamer.bot copies of %s the same key",
    (_name, pair) => {
      const direct = normalizeEventSub(pair);
      const forwarded = normalizeStreamerBot(pair);

      expect(direct.type).toBe(pair.type);
      expect(forwarded.type).toBe(pair.type);
      expect(direct.ingestProvider).toBe("twitch");
      expect(forwarded.ingestProvider).toBe("streamerbot");
      expect(twitchCorrelationKey(forwarded)).toBe(twitchCorrelationKey(direct));
    }
  );

  it("gives different occurrences different keys", () => {
    const keys = pairedCases.filter((pair) => pair.label === undefined).map((pair) => twitchCorrelationKey(normalizeEventSub(pair)));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ["another viewer", "cheer", { user_id: "viewer-2" }],
    ["another bit amount", "cheer", { bits: 501 }],
    ["another reward", "channel_point_redemption", { reward: { id: "reward-2", title: "Hydrate" } }],
    ["another poll tally", "poll_progress", { choices: [{ id: "choice-1", title: "One", votes: 11 }] }],
    ["another hype train level", "hype_train_progress", { level: 3 }]
  ] as const)("changes the key for %s", (_label, type, change) => {
    const pair = pairedCases.find((candidate) => candidate.type === type && candidate.label === undefined)!;
    const changed = { ...pair, eventSub: { ...pair.eventSub, event: { ...pair.eventSub.event, ...change } } };
    expect(twitchCorrelationKey(normalizeEventSub(changed))).not.toBe(twitchCorrelationKey(normalizeEventSub(pair)));
  });

  it("escapes key parts so separators inside IDs cannot collide", () => {
    const pair = pairedCases.find((candidate) => candidate.type === "channel_point_redemption")!;
    const event = normalizeEventSub({
      ...pair,
      eventSub: { ...pair.eventSub, event: { ...pair.eventSub.event, user_id: "viewer:1", reward: { id: "reward", title: "Hydrate" } } }
    });
    expect(twitchCorrelationKey(event)).toBe("twitch:channel_point_redemption:viewer%3A1:reward");
  });
});

let nextMessage = 1;

function normalizeEventSub(pair: PairedCase): NormalizedStreamEvent {
  const { type, version, event } = pair.eventSub;
  return normalizeTwitchEventSubNotification({
    metadata: {
      message_id: `eventsub-${nextMessage++}`,
      message_type: "notification",
      message_timestamp: "2026-10-08T12:00:00.000Z",
      subscription_type: type,
      subscription_version: version
    },
    payload: {
      subscription: { id: `subscription-${type}`, status: "enabled", type, version, cost: 0, condition: { broadcaster_user_id: "broadcaster-1" } },
      event
    }
  });
}

function normalizeStreamerBot(pair: PairedCase): NormalizedStreamEvent {
  const result = normalizeStreamerBotEvent({
    timeStamp: "2026-10-08T12:00:01.000Z",
    event: { source: "Twitch", type: pair.streamerBot.type },
    data: pair.streamerBot.data
  });
  if (result.status !== "normalized") throw new Error(`Streamer.bot ${pair.streamerBot.type} was not normalized`);
  return result.event;
}
