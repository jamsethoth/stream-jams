import { describe, expect, it } from "vitest";
import { alertRuleSchema, streamEventTypeSchema } from "./schemas.js";

const validRule = {
  id: "rule-1",
  name: "Follow alert",
  eventType: "follow",
  enabled: true,
  collectionIds: ["default"],
  conditions: [],
  variants: [
    {
      id: "variant-1",
      name: "Default",
      enabled: true,
      weight: 1,
      visualAssetId: null,
      audioAssetId: null,
      textTemplate: "Thanks {actor.displayName}",
      ttsConfig: null,
      durationMs: 5000,
      layout: {
        x: 0,
        y: 0,
        width: 400,
        height: 180,
        zIndex: 1
      }
    }
  ],
  cooldownSeconds: 0,
  priority: 0
} as const;

describe("alertRuleSchema", () => {
  it("accepts every canonical event type", () => {
    const eventTypes = [
      "follow", "subscription", "resubscription", "cheer", "raid", "channel_point_redemption",
      "gift_subscription", "community_gift",
      "hype_train_start", "hype_train_progress", "hype_train_end",
      "poll_start", "poll_progress", "poll_end",
      "prediction_start", "prediction_progress", "prediction_lock", "prediction_end",
      "stream_online", "stream_offline"
    ] as const;

    for (const eventType of eventTypes) {
      expect(streamEventTypeSchema.safeParse(eventType).success).toBe(true);
    }

    expect(streamEventTypeSchema.safeParse("donation").success).toBe(false);
  });

  it("accepts a valid alert rule", () => {
    expect(alertRuleSchema.safeParse(validRule).success).toBe(true);
  });

  it("preserves optional variant conditions and priority", () => {
    const rule = {
      ...validRule,
      variants: [
        {
          ...validRule.variants[0],
          conditions: [{ field: "amount", operator: "min", value: 500 }],
          priority: 5
        }
      ]
    };

    const parsed = alertRuleSchema.parse(rule);

    expect(parsed.variants[0]?.conditions).toEqual([{ field: "amount", operator: "min", value: 500 }]);
    expect(parsed.variants[0]?.priority).toBe(5);
  });

  it("rejects invalid alert duration", () => {
    const invalidRule = {
      ...validRule,
      variants: [
        {
          ...validRule.variants[0],
          durationMs: 0
        }
      ]
    };

    expect(alertRuleSchema.safeParse(invalidRule).success).toBe(false);
  });
});
