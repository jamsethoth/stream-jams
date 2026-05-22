import { describe, expect, it } from "vitest";
import { alertRuleSchema } from "./schemas.js";

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
  it("accepts a valid alert rule", () => {
    expect(alertRuleSchema.safeParse(validRule).success).toBe(true);
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
