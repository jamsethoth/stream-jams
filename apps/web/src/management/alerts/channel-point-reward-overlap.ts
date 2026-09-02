import {
  channelPointRewardSelectionsMayOverlap,
  readChannelPointRewardSelection,
  type AlertInventoryRow,
  type ChannelPointRewardSelection
} from "@stream-jams/core";

export function findOverlappingChannelPointAlertNames(
  inventory: readonly AlertInventoryRow[],
  selection: ChannelPointRewardSelection,
  excludedRuleId: string
): string[] {
  return inventory
    .filter((row) => (
      row.id !== excludedRuleId
      && row.kind === "default"
      && row.enabled
      && row.eventType === "channel_point_redemption"
      && channelPointRewardSelectionsMayOverlap(
        selection,
        readChannelPointRewardSelection(row.conditions)
      )
    ))
    .map((row) => row.name);
}
