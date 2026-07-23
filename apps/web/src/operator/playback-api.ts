import { playbackQueueSnapshotSchema, type PlaybackQueueSnapshot } from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management/management-http-client.js";

export interface PlaybackApi {
  getSnapshot(): Promise<PlaybackQueueSnapshot>;
  pause(): Promise<PlaybackQueueSnapshot>;
  resume(): Promise<PlaybackQueueSnapshot>;
  mute(): Promise<PlaybackQueueSnapshot>;
  unmute(): Promise<PlaybackQueueSnapshot>;
  setDoNotDisturb(enabled: boolean): Promise<PlaybackQueueSnapshot>;
  skip(): Promise<PlaybackQueueSnapshot>;
  replay(itemId: string): Promise<PlaybackQueueSnapshot>;
}

export function createHttpPlaybackApi(options: HttpManagementClientOptions = {}): PlaybackApi {
  const client = createManagementHttpClient(options);
  const get = async (path: string, fallback: string): Promise<PlaybackQueueSnapshot> =>
    playbackQueueSnapshotSchema.parse(await client.getJson(path, fallback));
  const post = async (path: string, body: unknown | undefined, fallback: string): Promise<PlaybackQueueSnapshot> =>
    playbackQueueSnapshotSchema.parse(await client.postJson(path, body, fallback));

  return {
    getSnapshot: () => get("/playback", "Unable to load playback state."),
    pause: () => post("/playback/pause", undefined, "Unable to pause playback."),
    resume: () => post("/playback/resume", undefined, "Unable to resume playback."),
    mute: () => post("/playback/mute", undefined, "Unable to mute alert audio."),
    unmute: () => post("/playback/unmute", undefined, "Unable to unmute alert audio."),
    setDoNotDisturb: (enabled) =>
      post("/playback/do-not-disturb", { enabled }, "Unable to change do-not-disturb."),
    skip: () => post("/playback/skip", undefined, "Unable to skip the current alert."),
    replay: (itemId) => post("/playback/replay", { itemId }, "Unable to replay the alert.")
  };
}
