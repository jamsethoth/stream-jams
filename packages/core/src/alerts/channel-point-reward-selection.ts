import { z } from "zod";
import { nonEmptyStringSchema } from "../shared/schemas.js";
import type { AlertCondition } from "./types.js";

export const channelPointRewardIdsSchema = z.array(nonEmptyStringSchema)
  .min(1)
  .max(50)
  .superRefine((rewardIds, refinement) => {
    if (new Set(rewardIds).size !== rewardIds.length) {
      refinement.addIssue({ code: "custom", message: "Reward selections must be unique" });
    }
  });

export const channelPointRewardSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("selected"), rewardIds: channelPointRewardIdsSchema })
]);

export type ChannelPointRewardSelection = z.infer<typeof channelPointRewardSelectionSchema>;

export function readChannelPointRewardSelection(
  conditions: readonly AlertCondition[]
): ChannelPointRewardSelection {
  const rewardCondition = conditions.find((condition) => condition.field === "channelPointReward");
  if (rewardCondition?.operator === "equals" && typeof rewardCondition.value === "string") {
    return { mode: "selected", rewardIds: [rewardCondition.value] };
  }
  if (rewardCondition?.operator === "oneOf") {
    return { mode: "selected", rewardIds: [...rewardCondition.value] };
  }
  return { mode: "all" };
}

export function replaceChannelPointRewardSelection(
  conditions: readonly AlertCondition[],
  selection: ChannelPointRewardSelection
): readonly AlertCondition[] {
  let hasReplacedRewardCondition = false;
  const replacement: AlertCondition | null = selection.mode === "selected"
    ? { field: "channelPointReward", operator: "oneOf", value: selection.rewardIds }
    : null;
  const replacedConditions = conditions.flatMap<AlertCondition>((condition) => {
    if (condition.field !== "channelPointReward") return [condition];
    if (replacement === null) return [];
    if (hasReplacedRewardCondition) return [];

    hasReplacedRewardCondition = true;
    return [replacement];
  });

  return replacement !== null && !hasReplacedRewardCondition
    ? [...replacedConditions, replacement]
    : replacedConditions;
}

export function channelPointRewardSelectionsMayOverlap(
  left: ChannelPointRewardSelection,
  right: ChannelPointRewardSelection
): boolean {
  if (left.mode === "all" || right.mode === "all") return true;
  const rightIds = new Set(right.rewardIds);
  return left.rewardIds.some((rewardId) => rightIds.has(rewardId));
}
