import type { TwitchDataSourceStatus } from "@stream-jams/core";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import type { TwitchDataSourcesApi } from "./twitch-data-sources-api.js";
export function twitchDataStatus(follower: TwitchDataSourceStatus["follower"]["state"] = "unconfigured", goals: TwitchDataSourceStatus["goals"]["state"] = "integration-pending"): TwitchDataSourceStatus {
  return { follower: { state: follower, broadcasterId: follower === "disconnected" ? null : "123", valueIds: follower === "unconfigured" ? [] : ["followers"], updatedAt: follower === "current" || follower === "stale" ? "2026-10-08T12:00:00.000Z" : null }, goals: { state: goals, missingScopes: goals === "reauthorization-required" ? ["channel:read:goals"] : [] } };
}
export function createTwitchDataFixture(status = twitchDataStatus()): TwitchDataSourcesApi {
  return { getStatus: async () => structuredClone(status), createFollowers: async input => {
    const state = dataPreviewFixture(); state.revision++;
    state.values.push({ id: "followers", name: input.name, kind: "integer", content: 990, resetDefault: 0, resetGroupId: null, revision: 1, createdAt: "2026-10-08T12:00:00.000Z", updatedAt: "2026-10-08T12:00:00.000Z", source: { provider: "twitch", kind: "follower-total", broadcasterId: "123" } });
    return state;
  } };
}
