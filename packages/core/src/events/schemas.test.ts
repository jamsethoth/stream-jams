import { describe, expect, it } from "vitest";
import { normalizedStreamEventSchema } from "./schemas.js";

const baseEvent = {
  id: "evt-1",
  providerId: "twitch",
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
      occurredAt: baseEvent.occurredAt,
      actor: baseEvent.actor,
      message: baseEvent.message,
      metadata: baseEvent.metadata,
      type: "follow",
      amount: null
    };

    expect(normalizedStreamEventSchema.safeParse(payloadWithoutId).success).toBe(false);
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
