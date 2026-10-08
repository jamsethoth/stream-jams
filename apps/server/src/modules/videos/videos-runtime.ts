import type { OverlayModuleRuntime, OverlayModuleSnapshot, OverlayModuleSnapshotRequest, OverlayPurpose, VideoQueueResponse, VideosModuleConfig, VideosProjection } from "@stream-jams/core";
import { videoInstructionPrefix } from "@stream-jams/core/videos";
import type { VideoRouteService } from "../../http/routes/videos.js";
import { toVideoQueueResponse } from "./video-queue-response.js";
import type { VideoItemCommand, VideoPlaybackPhase, VideoQueueCommand, VideoQueueService, VideoQueueView } from "./video-queue-service.js";
import type { VideoRequestContext, VideoRequestIntake, VideoRequestResult } from "./video-request-intake.js";

export interface VideosRuntimeOptions {
  readonly queue: VideoQueueService;
  readonly intake: Pick<VideoRequestIntake, "submit">;
  readonly getConfig: () => Promise<VideosModuleConfig>;
  readonly now: () => number;
}

/** What browser sources render for the current queue state. A playing item wins over a notice. */
export function toVideosProjection(view: VideoQueueView, config: Pick<VideosModuleConfig, "obsAudio">): VideosProjection {
  if (view.current !== null) {
    const { item, clock } = view.current;
    return {
      status: "active",
      itemId: item.id,
      title: item.title,
      requester: item.requester,
      // Until the desktop primary player is available, each browser source plays from the shared clock.
      delivery: { mode: "player", source: item.source, clock: { ...clock }, obsAudio: config.obsAudio }
    };
  }
  if (view.notice !== null) return { status: "notice", noticeId: view.notice.id, notice: "no-clip", displayName: view.notice.displayName };
  return { status: "idle" };
}

/** Joins the queue, intake and overlay projection behind the route and overlay runtime boundaries. */
export class VideosRuntime implements OverlayModuleRuntime, VideoRouteService {
  constructor(private readonly options: VideosRuntimeOptions) {}

  response(purpose: OverlayPurpose): VideoQueueResponse {
    return toVideoQueueResponse(this.options.queue.view(purpose), this.options.now());
  }

  submit(purpose: OverlayPurpose, input: unknown, context: VideoRequestContext): Promise<VideoRequestResult> {
    return this.options.intake.submit(purpose, input, context);
  }

  command(purpose: OverlayPurpose, expectedRevision: number, command: VideoQueueCommand): VideoQueueResponse {
    return toVideoQueueResponse(this.options.queue.command(purpose, expectedRevision, command), this.options.now());
  }

  control(purpose: OverlayPurpose, expectedItemId: string, command: VideoItemCommand): VideoQueueResponse {
    return toVideoQueueResponse(this.options.queue.control(purpose, expectedItemId, command), this.options.now());
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const config = await this.options.getConfig();
    return { moduleId: "videos", enabled: true, instructions: [], presentation: { kind: "videos", videos: toVideosProjection(this.options.queue.view(request.purpose), config) } };
  }

  /**
   * Routes a browser player report. Video players report as `video:<itemId>`, so these
   * never reach the alert or effect coordinators. A failure from one output is ignored
   * once another output has started the item.
   */
  reportPlayback(instructionId: string, status: "ready" | "started" | "completed" | "failed"): boolean {
    if (!instructionId.startsWith(videoInstructionPrefix)) return false;
    const itemId = instructionId.slice(videoInstructionPrefix.length);
    if (status === "started") this.options.queue.reportStarted(itemId);
    else if (status === "completed") this.options.queue.reportEnded(itemId);
    else if (status === "failed" && this.currentPhase(itemId) === "loading") this.options.queue.reportFailed(itemId);
    return true;
  }

  private currentPhase(itemId: string): VideoPlaybackPhase | null {
    for (const purpose of ["live", "test"] as const) {
      const current = this.options.queue.view(purpose).current;
      if (current?.item.id === itemId) return current.phase;
    }
    return null;
  }
}
