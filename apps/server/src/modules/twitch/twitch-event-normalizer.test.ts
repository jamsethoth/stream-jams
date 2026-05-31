import { describe, expect, it } from "vitest";
import { normalizedStreamEventSchema } from "@stream-jams/core";
import {
  getTwitchEventSubMessageId,
  normalizeTwitchEventSubNotification,
  TwitchEventNormalizationError
} from "./twitch-event-normalizer.js";

describe("normalizeTwitchEventSubNotification", () => {
  it("normalizes MVP Twitch EventSub notification payloads", () => {
    const cases = [
      {
        input: notification("msg-follow", "channel.follow", "2", {
          user_id: "user-1",
          user_login: "viewer",
          user_name: "Viewer",
          broadcaster_user_id: "broadcaster-1",
          broadcaster_user_login: "streamer",
          broadcaster_user_name: "Streamer",
          followed_at: "2026-05-30T12:00:01.000Z"
        }),
        expected: {
          id: "msg-follow",
          type: "follow",
          actor: {
            id: "user-1",
            displayName: "Viewer"
          },
          amount: null,
          occurredAt: "2026-05-30T12:00:01.000Z"
        }
      },
      {
        input: notification("msg-sub", "channel.subscribe", "1", {
          user_id: "user-2",
          user_login: "subscriber",
          user_name: "Subscriber",
          broadcaster_user_id: "broadcaster-1",
          broadcaster_user_login: "streamer",
          broadcaster_user_name: "Streamer",
          tier: "1000",
          is_gift: false
        }),
        expected: {
          id: "msg-sub",
          type: "subscription",
          amount: 1,
          tier: "1000"
        }
      },
      {
        input: notification("msg-resub", "channel.subscription.message", "1", {
          user_id: "user-3",
          user_login: "resubscriber",
          user_name: "Resubscriber",
          broadcaster_user_id: "broadcaster-1",
          broadcaster_user_login: "streamer",
          broadcaster_user_name: "Streamer",
          tier: "2000",
          cumulative_months: 7,
          streak_months: 3,
          duration_months: 1,
          message: {
            text: "seven months!"
          }
        }),
        expected: {
          id: "msg-resub",
          type: "resubscription",
          amount: 7,
          tier: "2000",
          streakMonths: 3,
          message: "seven months!"
        }
      },
      {
        input: notification("msg-cheer", "channel.cheer", "1", {
          is_anonymous: false,
          user_id: "user-4",
          user_login: "cheerer",
          user_name: "Cheerer",
          broadcaster_user_id: "broadcaster-1",
          broadcaster_user_login: "streamer",
          broadcaster_user_name: "Streamer",
          message: "great stream",
          bits: 500
        }),
        expected: {
          id: "msg-cheer",
          type: "cheer",
          amount: 500,
          message: "great stream"
        }
      },
      {
        input: notification("msg-raid", "channel.raid", "1", {
          from_broadcaster_user_id: "raider-1",
          from_broadcaster_user_login: "raider",
          from_broadcaster_user_name: "Raider",
          to_broadcaster_user_id: "broadcaster-1",
          to_broadcaster_user_login: "streamer",
          to_broadcaster_user_name: "Streamer",
          viewers: 42
        }),
        expected: {
          id: "msg-raid",
          type: "raid",
          actor: {
            id: "raider-1",
            displayName: "Raider"
          },
          amount: 42
        }
      },
      {
        input: notification("msg-redemption", "channel.channel_points_custom_reward_redemption.add", "1", {
          id: "redemption-1",
          broadcaster_user_id: "broadcaster-1",
          broadcaster_user_login: "streamer",
          broadcaster_user_name: "Streamer",
          user_id: "user-5",
          user_login: "redeemer",
          user_name: "Redeemer",
          user_input: "hydrate please",
          status: "unfulfilled",
          redeemed_at: "2026-05-30T12:00:02.000Z",
          reward: {
            id: "reward-1",
            title: "Hydrate",
            cost: 100,
            prompt: "Drink water"
          }
        }),
        expected: {
          id: "msg-redemption",
          type: "channel_point_redemption",
          rewardId: "reward-1",
          rewardTitle: "Hydrate",
          userInput: "hydrate please",
          occurredAt: "2026-05-30T12:00:02.000Z"
        }
      }
    ];

    for (const testCase of cases) {
      const normalized = normalizeTwitchEventSubNotification(testCase.input);
      expect(normalizedStreamEventSchema.safeParse(normalized).success).toBe(true);
      expect(normalized).toMatchObject(testCase.expected);
      expect(normalized.metadata).toMatchObject({
        twitchEventSubType: testCase.input.metadata.subscription_type,
        twitchSubscriptionId: "subscription-" + testCase.input.metadata.subscription_type
      });
    }
  });

  it("handles anonymous cheers without user identity", () => {
    const normalized = normalizeTwitchEventSubNotification(
      notification("msg-anonymous-cheer", "channel.cheer", "1", {
        is_anonymous: true,
        user_id: null,
        user_login: null,
        user_name: null,
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        message: "anonymous hype",
        bits: 100
      })
    );

    expect(normalized).toMatchObject({
      type: "cheer",
      actor: {
        id: null,
        displayName: "Anonymous"
      },
      amount: 100
    });
  });

  it("rejects unsupported and malformed notifications", () => {
    expect(() =>
      normalizeTwitchEventSubNotification(notification("msg-stream", "stream.online", "1", {}))
    ).toThrow(TwitchEventNormalizationError);
    expect(() =>
      normalizeTwitchEventSubNotification(notification("msg-follow", "channel.follow", "2", { user_id: "user-1" }))
    ).toThrow(TwitchEventNormalizationError);
  });

  it("extracts EventSub message IDs for deduplication", () => {
    expect(getTwitchEventSubMessageId(notification("msg-follow", "channel.follow", "2", {}))).toBe("msg-follow");
    expect(getTwitchEventSubMessageId({ metadata: { message_id: "" } })).toBeNull();
    expect(getTwitchEventSubMessageId({})).toBeNull();
  });
});

function notification(messageId: string, type: string, version: string, event: Record<string, unknown>) {
  return {
    metadata: {
      message_id: messageId,
      message_type: "notification",
      message_timestamp: "2026-05-30T12:00:00.000Z",
      subscription_type: type,
      subscription_version: version
    },
    payload: {
      subscription: {
        id: "subscription-" + type,
        status: "enabled",
        type,
        version,
        cost: 0,
        condition: {
          broadcaster_user_id: "broadcaster-1"
        },
        transport: {
          method: "websocket",
          session_id: "session-1"
        },
        created_at: "2026-05-30T11:59:00.000Z"
      },
      event
    }
  };
}
