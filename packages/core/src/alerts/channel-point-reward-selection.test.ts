import { describe, expect, it } from "vitest";
import {
  channelPointRewardSelectionSchema,
  channelPointRewardSelectionsMayOverlap,
  readChannelPointRewardSelection,
  replaceChannelPointRewardSelection
} from "./channel-point-reward-selection.js";

describe("channel-point reward selection", () => {
  it("accepts selected reward IDs and rejects an empty selection", () => {
    expect(channelPointRewardSelectionSchema.parse({
      mode: "selected",
      rewardIds: ["reward-a", "reward-b"]
    })).toEqual({
      mode: "selected",
      rewardIds: ["reward-a", "reward-b"]
    });
    expect(channelPointRewardSelectionSchema.safeParse({ mode: "selected", rewardIds: [] }).success).toBe(false);
  });

  it("reads catch-all, legacy exact-ID, and membership conditions without rewriting them", () => {
    expect(readChannelPointRewardSelection([{ field: "amount", operator: "min", value: 100 }])).toEqual({ mode: "all" });
    expect(readChannelPointRewardSelection([
      { field: "channelPointReward", operator: "equals", value: "reward-a" }
    ])).toEqual({ mode: "selected", rewardIds: ["reward-a"] });
    expect(readChannelPointRewardSelection([
      { field: "channelPointReward", operator: "oneOf", value: ["reward-a", "reward-b"] }
    ])).toEqual({ mode: "selected", rewardIds: ["reward-a", "reward-b"] });
  });

  it("replaces reward conditions only after an explicit selected-mode conversion", () => {
    const conditions = [
      { field: "amount", operator: "min", value: 100 },
      { field: "channelPointReward", operator: "equals", value: "reward-a" },
      { field: "tier", operator: "equals", value: "1000" },
      { field: "channelPointReward", operator: "oneOf", value: ["reward-b"] }
    ] as const;

    expect(replaceChannelPointRewardSelection(conditions, {
      mode: "selected",
      rewardIds: ["reward-c", "reward-d"]
    })).toEqual([
      { field: "amount", operator: "min", value: 100 },
      { field: "channelPointReward", operator: "oneOf", value: ["reward-c", "reward-d"] },
      { field: "tier", operator: "equals", value: "1000" }
    ]);
  });

  it("removes all reward conditions when explicitly converted to catch-all", () => {
    expect(replaceChannelPointRewardSelection([
      { field: "channelPointReward", operator: "equals", value: "reward-a" },
      { field: "amount", operator: "min", value: 100 },
      { field: "channelPointReward", operator: "oneOf", value: ["reward-b"] }
    ], { mode: "all" })).toEqual([
      { field: "amount", operator: "min", value: 100 }
    ]);
  });

  it("identifies intersections and catch-all coverage as potential overlap", () => {
    expect(channelPointRewardSelectionsMayOverlap(
      { mode: "selected", rewardIds: ["reward-a", "reward-b"] },
      { mode: "selected", rewardIds: ["reward-b", "reward-c"] }
    )).toBe(true);
    expect(channelPointRewardSelectionsMayOverlap(
      { mode: "selected", rewardIds: ["reward-a"] },
      { mode: "selected", rewardIds: ["reward-b"] }
    )).toBe(false);
    expect(channelPointRewardSelectionsMayOverlap(
      { mode: "all" },
      { mode: "selected", rewardIds: ["reward-a"] }
    )).toBe(true);
    expect(channelPointRewardSelectionsMayOverlap(
      { mode: "selected", rewardIds: ["reward-a"] },
      { mode: "all" }
    )).toBe(true);
  });
});
