import type { AlertInventoryRow } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { findOverlappingChannelPointAlertNames } from "./channel-point-reward-overlap.js";

describe("findOverlappingChannelPointAlertNames", () => {
  it("returns intersecting selected and either-side catch-all alerts in stable inventory order", () => {
    const inventory = [
      alertRow("alert-general", "General channel points", []),
      alertRow("alert-hydrate", "Hydrate and stretch", [rewardSelection("reward-hydrate", "reward-stretch")]),
      alertRow("alert-other", "Posture check", [rewardSelection("reward-posture")]),
      alertRow("alert-current", "Current alert", [rewardSelection("reward-hydrate")])
    ];

    expect(findOverlappingChannelPointAlertNames(
      inventory,
      { mode: "selected", rewardIds: ["reward-hydrate"] },
      "alert-current"
    )).toEqual(["General channel points", "Hydrate and stretch"]);

    expect(findOverlappingChannelPointAlertNames(
      inventory,
      { mode: "all" },
      "alert-current"
    )).toEqual(["General channel points", "Hydrate and stretch", "Posture check"]);
  });

  it("ignores disabled rules, variations, other event types, disjoint sets, and the excluded rule", () => {
    const inventory = [
      alertRow("alert-disjoint", "Disjoint", [rewardSelection("reward-stretch")]),
      alertRow("alert-disabled", "Disabled", [], { enabled: false }),
      alertRow("alert-variation", "Variation", [], { kind: "variation", parentAlertId: "alert-parent" }),
      alertRow("alert-cheer", "Cheer", [], { eventType: "cheer" }),
      alertRow("alert-current", "Current alert", []),
      alertRow("alert-extra", "Conservative match", [
        rewardSelection("reward-hydrate"),
        { field: "amount", operator: "min", value: 100 }
      ])
    ];

    expect(findOverlappingChannelPointAlertNames(
      inventory,
      { mode: "selected", rewardIds: ["reward-hydrate"] },
      "alert-current"
    )).toEqual(["Conservative match"]);
  });
});

function rewardSelection(...rewardIds: string[]): AlertInventoryRow["conditions"][number] {
  return { field: "channelPointReward", operator: "oneOf", value: rewardIds };
}

function alertRow(
  id: string,
  name: string,
  conditions: AlertInventoryRow["conditions"],
  overrides: Partial<AlertInventoryRow> = {}
): AlertInventoryRow {
  return {
    id,
    parentAlertId: null,
    setId: "set-default",
    providerKind: "twitch",
    eventType: "channel_point_redemption",
    name,
    kind: "default",
    enabled: true,
    conditions,
    weight: 1,
    priority: null,
    reviewState: "ready",
    targetProfileIds: ["landscape"],
    previewText: "Reward redeemed",
    ...overrides
  };
}
