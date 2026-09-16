import { mergedOperationsSnapshotSchema, type MergedOperationsSnapshot } from "@stream-jams/core";
import {
  createManagementHttpClient,
  ManagementHttpError,
  type HttpManagementClientOptions
} from "../management/management-http-client.js";

export class PlaybackOperationsConflictError extends Error {
  constructor(
    message: string,
    readonly snapshot: MergedOperationsSnapshot
  ) {
    super(message);
    this.name = "PlaybackOperationsConflictError";
  }
}

export interface PlaybackApi {
  getSnapshot(): Promise<MergedOperationsSnapshot>;
  pause(): Promise<MergedOperationsSnapshot>;
  resume(): Promise<MergedOperationsSnapshot>;
  mute(): Promise<MergedOperationsSnapshot>;
  unmute(): Promise<MergedOperationsSnapshot>;
  setDoNotDisturb(enabled: boolean): Promise<MergedOperationsSnapshot>;
  skip(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot>;
  remove(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot>;
  replay(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot>;
  clear(moduleId: string, expectedPendingCount: number, observedRevision: number): Promise<MergedOperationsSnapshot>;
  setModulePaused(moduleId: string, paused: boolean): Promise<MergedOperationsSnapshot>;
}

export function createHttpPlaybackApi(options: HttpManagementClientOptions = {}): PlaybackApi {
  const client = createManagementHttpClient(options);
  const get = async (): Promise<MergedOperationsSnapshot> =>
    mergedOperationsSnapshotSchema.parse(await client.getJson("/playback/operations", "Unable to load playback state."));
  const operation = async (
    path: string,
    body: unknown | undefined,
    fallback: string
  ): Promise<MergedOperationsSnapshot> => {
    try {
      return mergedOperationsSnapshotSchema.parse(await client.postJson(path, body, fallback));
    } catch (error) {
      const conflictSnapshot = readConflictSnapshot(error);
      if (conflictSnapshot !== null) {
        throw new PlaybackOperationsConflictError(
          error instanceof Error ? error.message : fallback,
          conflictSnapshot
        );
      }
      throw error;
    }
  };
  const globalOperation = async (path: string, body: unknown | undefined, fallback: string): Promise<MergedOperationsSnapshot> => {
    await client.postJson(path, body, fallback);
    return get();
  };

  return {
    getSnapshot: get,
    pause: () => globalOperation("/playback/pause", undefined, "Unable to pause playback."),
    resume: () => globalOperation("/playback/resume", undefined, "Unable to resume playback."),
    mute: () => globalOperation("/playback/mute", undefined, "Unable to mute playback audio."),
    unmute: () => globalOperation("/playback/unmute", undefined, "Unable to unmute playback audio."),
    setDoNotDisturb: (enabled) => globalOperation("/playback/do-not-disturb", { enabled }, "Unable to change do-not-disturb."),
    skip: (moduleId, occurrenceId) => operation(`/playback/operations/${encodeURIComponent(moduleId)}/${encodeURIComponent(occurrenceId)}/skip`, undefined, "Unable to skip playback."),
    remove: (moduleId, occurrenceId) => operation(`/playback/operations/${encodeURIComponent(moduleId)}/${encodeURIComponent(occurrenceId)}/remove`, undefined, "Unable to remove queued playback."),
    replay: (moduleId, occurrenceId) => operation(`/playback/operations/${encodeURIComponent(moduleId)}/${encodeURIComponent(occurrenceId)}/replay`, undefined, "Unable to replay playback."),
    clear: (moduleId, expectedPendingCount, observedRevision) => operation(`/playback/operations/${encodeURIComponent(moduleId)}/clear`, { expectedPendingCount, observedRevision }, "Unable to clear queued playback."),
    setModulePaused: (moduleId, paused) => operation(`/playback/operations/${encodeURIComponent(moduleId)}/pause`, { paused }, "Unable to change module pause state.")
  };
}

function readConflictSnapshot(error: unknown): MergedOperationsSnapshot | null {
  if (
    !(error instanceof ManagementHttpError)
    || error.status !== 409
    || error.code !== "PLAYBACK_OPERATION_CONFLICT"
  ) {
    return null;
  }
  const parsed = mergedOperationsSnapshotSchema.safeParse(error.conflictSnapshot);
  return parsed.success ? parsed.data : null;
}
