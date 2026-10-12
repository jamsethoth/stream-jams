import { dataOverlayStateSchema, twitchDataSourceStatusSchema, twitchFollowerSourceInputSchema, twitchGoalSourceInputSchema, type DataOverlayState, type TwitchDataSourceStatus, type TwitchFollowerSourceInput, type TwitchGoalSourceInput } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

export interface TwitchDataSourcesApi {
  getStatus(): Promise<TwitchDataSourceStatus>;
  createFollowers(input: TwitchFollowerSourceInput): Promise<DataOverlayState>;
  createGoal(input: TwitchGoalSourceInput): Promise<DataOverlayState>;
  rebindGoal(id: string, input: TwitchGoalSourceInput): Promise<DataOverlayState>;
}
export function createHttpTwitchDataSourcesApi(options: HttpManagementClientOptions = {}): TwitchDataSourcesApi {
  const client = createManagementHttpClient(options);
  return {
    async getStatus() { return twitchDataSourceStatusSchema.parse(await client.getJson("/data-overlays/sources/twitch", "Unable to load Twitch data status. Check Event sources and retry.")); },
    async createGoal(input) { return dataOverlayStateSchema.parse(await client.postJson("/data-overlays/sources/twitch/goals", twitchGoalSourceInputSchema.parse(input), "Unable to create Creator Goal. Check Twitch connection and retry.")); },
    async rebindGoal(id, input) { return dataOverlayStateSchema.parse(await client.putJson(`/data-overlays/sources/twitch/goals/${encodeURIComponent(id)}`, twitchGoalSourceInputSchema.parse(input), "Unable to rebind Creator Goal. Check Twitch connection and retry.")); },
    async createFollowers(input) { return dataOverlayStateSchema.parse(await client.postJson("/data-overlays/sources/twitch/followers", twitchFollowerSourceInputSchema.parse(input), "Unable to create the follower value. Check Twitch connection and retry.")); }
  };
}
export const defaultTwitchDataSourcesApi = createHttpTwitchDataSourcesApi();
