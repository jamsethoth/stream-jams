import { dataOverlayStateSchema, twitchDataSourceStatusSchema, twitchFollowerSourceInputSchema, type DataOverlayState, type TwitchDataSourceStatus, type TwitchFollowerSourceInput } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

export interface TwitchDataSourcesApi {
  getStatus(): Promise<TwitchDataSourceStatus>;
  createFollowers(input: TwitchFollowerSourceInput): Promise<DataOverlayState>;
}
export function createHttpTwitchDataSourcesApi(options: HttpManagementClientOptions = {}): TwitchDataSourcesApi {
  const client = createManagementHttpClient(options);
  return {
    async getStatus() { return twitchDataSourceStatusSchema.parse(await client.getJson("/data-overlays/sources/twitch", "Unable to load Twitch data status. Check Event sources and retry.")); },
    async createFollowers(input) { return dataOverlayStateSchema.parse(await client.postJson("/data-overlays/sources/twitch/followers", twitchFollowerSourceInputSchema.parse(input), "Unable to create the follower value. Check Twitch connection and retry.")); }
  };
}
export const defaultTwitchDataSourcesApi = createHttpTwitchDataSourcesApi();
