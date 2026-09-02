import { describe, expect, it } from "vitest";
import { twitchCustomRewardCatalogSchema, twitchCustomRewardSchema } from "../index.js";

const completeReward = {
  id: "reward-hydrate",
  title: "Hydrate",
  prompt: "Drink some water",
  cost: 500,
  backgroundColor: "#00E5CB",
  isUserInputRequired: false,
  isEnabled: true,
  isPaused: false,
  isInStock: true
};

describe("Twitch custom reward catalog contract", () => {
  it("accepts complete rewards, empty catalogs, and the 50-reward boundary", () => {
    expect(twitchCustomRewardCatalogSchema.parse({ rewards: [completeReward] }).rewards[0]?.id).toBe("reward-hydrate");
    expect(twitchCustomRewardCatalogSchema.parse({ rewards: [] })).toEqual({ rewards: [] });
    expect(twitchCustomRewardCatalogSchema.parse({
      rewards: Array.from({ length: 50 }, (_, index) => ({
        ...completeReward,
        id: `reward-${index}`
      }))
    }).rewards).toHaveLength(50);
  });

  it("rejects incomplete and malformed sanitized rewards", () => {
    expect(twitchCustomRewardSchema.safeParse({ ...completeReward, id: "" }).success).toBe(false);
    const { id: omittedId, ...rewardWithoutId } = completeReward;
    void omittedId;
    expect(twitchCustomRewardSchema.safeParse(rewardWithoutId).success).toBe(false);
    expect(twitchCustomRewardSchema.safeParse({ ...completeReward, title: "  " }).success).toBe(false);
    expect(twitchCustomRewardSchema.safeParse({ ...completeReward, cost: 0 }).success).toBe(false);
    expect(twitchCustomRewardSchema.safeParse({ ...completeReward, cost: 500.5 }).success).toBe(false);
    expect(twitchCustomRewardSchema.safeParse({ ...completeReward, backgroundColor: "00E5CB" }).success).toBe(false);
    const {
      isUserInputRequired: omittedUserInputRequired,
      ...rewardWithoutUserInputRequired
    } = completeReward;
    void omittedUserInputRequired;
    expect(twitchCustomRewardSchema.safeParse(rewardWithoutUserInputRequired).success).toBe(false);
    const { isEnabled: omittedEnabled, ...rewardWithoutEnabled } = completeReward;
    void omittedEnabled;
    expect(twitchCustomRewardSchema.safeParse(rewardWithoutEnabled).success).toBe(false);
    const { isPaused: omittedPaused, ...rewardWithoutPaused } = completeReward;
    void omittedPaused;
    expect(twitchCustomRewardSchema.safeParse(rewardWithoutPaused).success).toBe(false);
    const { isInStock: omittedInStock, ...rewardWithoutInStock } = completeReward;
    void omittedInStock;
    expect(twitchCustomRewardSchema.safeParse(rewardWithoutInStock).success).toBe(false);
  });

  it("rejects unsanitized provider fields and unknown catalog keys", () => {
    expect(twitchCustomRewardSchema.safeParse({
      ...completeReward,
      image: { url_1x: "https://cdn.example/reward.png" }
    }).success).toBe(false);
    expect(twitchCustomRewardSchema.safeParse({
      ...completeReward,
      url: "https://twitch.tv/rewards/reward-hydrate"
    }).success).toBe(false);
    expect(twitchCustomRewardCatalogSchema.safeParse({
      rewards: [completeReward],
      pagination: { cursor: "provider-cursor" }
    }).success).toBe(false);
  });

  it("rejects catalogs above the supported 50-reward limit", () => {
    expect(twitchCustomRewardCatalogSchema.safeParse({
      rewards: Array.from({ length: 51 }, (_, index) => ({
        ...completeReward,
        id: `reward-${index}`
      }))
    }).success).toBe(false);
  });
});
