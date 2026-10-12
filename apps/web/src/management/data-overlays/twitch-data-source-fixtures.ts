import type { TwitchDataSourceStatus } from "@stream-jams/core";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import type { TwitchDataSourcesApi } from "./twitch-data-sources-api.js";
export function twitchDataStatus(follower: TwitchDataSourceStatus["follower"]["state"] = "unconfigured", goals: TwitchDataSourceStatus["goals"]["state"] = "waiting"): TwitchDataSourceStatus {
  return { follower: { state: follower, broadcasterId: follower === "disconnected" ? null : "123", valueIds: follower === "unconfigured" ? [] : ["followers"], updatedAt: follower === "current" || follower === "stale" ? "2026-10-08T12:00:00.000Z" : null }, goals: { state: goals, missingScopes: goals === "reauthorization-required" ? ["channel:read:goals"] : [], broadcasterId: goals === "disconnected" ? null : "123", updatedAt: null, activeGoals: [], bindings: [] } };
}
export function createTwitchDataFixture(status = twitchDataStatus()): TwitchDataSourcesApi {
  return { createGoal: async () => dataPreviewFixture(), rebindGoal: async () => dataPreviewFixture(), getStatus: async () => structuredClone(status), createFollowers: async input => {
    const state = dataPreviewFixture(); state.revision++;
    state.values.push({ id: "followers", name: input.name, kind: "integer", content: 990, resetDefault: 0, resetGroupId: null, revision: 1, createdAt: "2026-10-08T12:00:00.000Z", updatedAt: "2026-10-08T12:00:00.000Z", source: { provider: "twitch", kind: "follower-total", broadcasterId: "123" } });
    return state;
  } };
}

/** Synthetic examples following Twitch documented goal field names; no real account. */
export function creatorGoalsStatus(state: TwitchDataSourceStatus["goals"]["state"] = "current"): TwitchDataSourceStatus {
  const status = twitchDataStatus("current", state);
  const base = { broadcaster_id: "123", broadcaster_name: "Synthetic", broadcaster_login: "synthetic", started_at: "2026-10-11T12:00:00Z" };
  status.goals.activeGoals = [
    { ...base, id: "follower-goal", type: "follower", description: "Community followers", current_amount: 40, target_amount: 100 },
    { ...base, id: "points-goal", type: "subscription", description: "Community points", current_amount: 75, target_amount: 200 },
    { ...base, id: "unsupported-goal", type: "future-type", description: "Future goal", current_amount: 10, target_amount: 50 }
  ];
  status.goals.bindings = [{ goalId: "goal", valueId: "counter", selectedGoalId: state === "ended" ? null : "follower-goal", state, units: "followers" }];
  return status;
}
