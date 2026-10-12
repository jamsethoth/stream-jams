import { describe, expect, it } from "vitest";
import { selectTwitchGoal, TwitchGoalSnapshotState, twitchGoalUnits } from "./twitch-goal-snapshot.js";
import type { TwitchCreatorGoal } from "./twitch-api-client.js";
// Synthetic records from the official schema; future bus integration remains blocked.
const goal: TwitchCreatorGoal = { id: "synthetic-1", broadcaster_id: "synthetic-user", broadcaster_name: "Synthetic", broadcaster_login: "synthetic", type: "follower", description: "Synthetic goal", current_amount: 5, target_amount: 20, started_at: "2026-10-08T00:00:00Z" };
describe("independent Creator Goal snapshot algorithms", () => {
  it("converges progress-before-begin and decreases without regressing to older snapshot", () => {
    const state = new TwitchGoalSnapshotState(); const epoch = state.beginSnapshot(1000);
    state.update(epoch, { kind: "upsert", goal: { ...goal, current_amount: 4 }, occurredAtEpochMs: 1002 });
    state.update(epoch, { kind: "upsert", goal, occurredAtEpochMs: 1001 });
    expect(state.finishSnapshot(epoch, [goal])).toBe("applied");
    expect(state.list()[0]?.current_amount).toBe(4);
    state.update(epoch, { kind: "upsert", goal, occurredAtEpochMs: 1001 }); expect(state.list()[0]?.current_amount).toBe(4);
    state.update(epoch, { kind: "end", goalId: goal.id, occurredAtEpochMs: 1003 });
    state.update(epoch, { kind: "upsert", goal, occurredAtEpochMs: 1002 }); expect(state.list()).toEqual([]);
  });
  it("enforces epoch invalidation and the100-event buffer bound requiring a fresh snapshot", () => {
    const state = new TwitchGoalSnapshotState(); const epoch = state.beginSnapshot(1000);
    for (let i = 0; i <= 100; i++) state.update(epoch, { kind: "upsert", goal, occurredAtEpochMs: 1001 + i });
    expect(state.finishSnapshot(epoch, [goal])).toBe("resnapshot-required");
    const next = state.beginSnapshot(2000); expect(state.finishSnapshot(epoch, [goal])).toBe("obsolete");
    expect(state.finishSnapshot(next, [goal])).toBe("applied");
    state.invalidate(); expect(state.list()).toEqual([]); state.update(next, { kind: "upsert", goal, occurredAtEpochMs: 3000 }); expect(state.list()).toEqual([]);
  });
  it("selects latest supported active type, keeps pin ended, labels points and retains unknown types unbindable", () => {
    const newer = { ...goal, id: "new", started_at: "2026-10-08T00:01:00Z" };
    expect(selectTwitchGoal([goal, newer], { mode: "active-type", type: "follower" })?.id).toBe("new");
    expect(selectTwitchGoal([newer], { mode: "pinned", goalId: goal.id })).toBeNull();
    expect(selectTwitchGoal([{ ...goal, type: "unknown" }], { mode: "pinned", goalId: goal.id })).toBeNull();
    expect(twitchGoalUnits("subscription")).toBe("sub points"); expect(twitchGoalUnits("new_subscription")).toBe("sub points"); expect(twitchGoalUnits("subscription_count")).toBe("subscriptions");
  });
});
