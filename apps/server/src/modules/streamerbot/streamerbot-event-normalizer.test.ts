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
