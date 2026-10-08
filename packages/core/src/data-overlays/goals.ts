import type { DataGoal, DataGoalProjection, DataValue } from "./types.js";
import { dataGoalSchema, dataValueSchema } from "./schemas.js";

function safeResult(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Goal arithmetic exceeds safe integer range");
  return Number(value);
}
export function projectDataGoal(goal: DataGoal, value: DataValue): DataGoalProjection {
  dataGoalSchema.parse(goal);
  dataValueSchema.parse(value);
  if (value.kind !== "integer" || value.id !== goal.valueId) throw new TypeError("Goal requires its referenced integer value");
  const baseline = goal.mode === "saved-baseline" ? goal.baseline : 0;
  const amount = goal.mode === "saved-baseline" ? goal.additionalAmount : goal.target;
  const target = safeResult(BigInt(baseline) + BigInt(amount));
  // Derived differences may exceed the safe integer range even when both stored inputs are exact.
  // BigInt avoids intermediate loss; conversion to finite Number is deliberate for display math.
  const achieved = Number(BigInt(value.content) - BigInt(baseline));
  const remaining = Math.max(0, amount - Math.max(0, achieved));
  const ratio = achieved / amount;
  return { current: value.content, baseline, target, achieved, remaining, percentage: ratio * 100, completed: value.content >= target, fill: Math.min(1, Math.max(0, ratio)) };
}
export function restartDataGoal(goal: DataGoal, value: DataValue): DataGoal {
  if (goal.mode !== "saved-baseline") throw new TypeError("Only saved-baseline goals can restart");
  const restarted = { ...goal, baseline: value.kind === "integer" ? value.content : NaN };
  projectDataGoal(restarted, value);
  return restarted;
}
