import type { OverlayModuleRuntime, OverlayModuleSnapshot, OverlayModuleSnapshotRequest, OverlayPurpose, VideoQueueResponse, VideosModuleConfig, VideosProjection } from "@stream-jams/core";
import { videoInstructionPrefix } from "@stream-jams/core/videos";
import type { VideoRouteService } from "../../http/routes/videos.js";
import { toVideoQueueResponse } from "./video-queue-response.js";
import type { VideoItemCommand, VideoPlaybackPhase, VideoQueueCommand, VideoQueueService, VideoQueueView } from "./video-queue-service.js";
import type { VideoRequestContext, VideoRequestIntake, VideoRequestResult } from "./video-request-intake.js";
import type { VideoMirrorDirector } from "./video-mirror-director.js";

export interface VideosRuntimeOptions {
  readonly queue: VideoQueueService;
  readonly intake: Pick<VideoRequestIntake, "submit">;
  readonly getConfig: () => Promise<VideosModuleConfig>;
  readonly now: () => number;
  /** The desktop primary player, when the desktop app is running. */
  readonly mirror?: Pick<VideoMirrorDirector, "available" | "controlsFor"> | undefined;
}

/** What browser sources render for the current queue state. A playing item wins over a notice. */
export function toVideosProjection(view: VideoQueueView, config: Pick<VideosModuleConfig, "obsAudio" | "layout">, mirrorAvailable = false): VideosProjection {
  if (view.current !== null) {
    const { item, clock, phase } = view.current;
    return {
      status: "active",
      itemId: item.id,
      title: item.title,
      requester: item.requester,
      layout: { ...config.layout },
      // With the desktop app running, every output shows its primary player's mirror.
      // Without it, each browser source plays the item itself from the shared clock.
      delivery: mirrorAvailable
        ? { mode: "mirror", paused: phase === "paused", obsAudio: config.obsAudio }
        // A loading item waits for a player to start it, so fallback players are asked to play from its
        // start position (as the desktop player is); a paused loading clock would keep them from ever starting.
        : { mode: "player", source: item.source, clock: phase === "loading" ? { ...clock, state: "playing" } : { ...clock }, obsAudio: config.obsAudio }
    };
  }
  if (view.notice !== null) return { status: "notice", noticeId: view.notice.id, notice: "no-clip", displayName: view.notice.displayName, layout: { ...config.layout } };
  return { status: "idle" };
}

/** Joins the queue, intake and overlay projection behind the route and overlay runtime boundaries. */
export class VideosRuntime implements OverlayModuleRuntime, VideoRouteService {
  constructor(private readonly options: VideosRuntimeOptions) {}

  response(purpose: OverlayPurpose): VideoQueueResponse {
    return this.toResponse(this.options.queue.view(purpose));
  }

  submit(purpose: OverlayPurpose, input: unknown, context: VideoRequestContext): Promise<VideoRequestResult> {
    return this.options.intake.submit(purpose, input, context);
  }

  command(purpose: OverlayPurpose, expectedRevision: number, command: VideoQueueCommand): VideoQueueResponse {
    return this.toResponse(this.options.queue.command(purpose, expectedRevision, command));
  }

  control(purpose: OverlayPurpose, expectedItemId: string, command: VideoItemCommand): VideoQueueResponse {
    return this.toResponse(this.options.queue.control(purpose, expectedItemId, command));
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const config = await this.options.getConfig();
    return { moduleId: "videos", enabled: true, instructions: [], presentation: { kind: "videos", videos: toVideosProjection(this.options.queue.view(request.purpose), config, this.options.mirror?.available === true) } };
  }

  /**
   * Routes a browser player report. Video players report as `video:<itemId>`, so these
   * never reach the alert or effect coordinators. A failure from one output is ignored
   * once another output has started the item. A `duration` report carries the media length the
   * output learned, so an unknown-length item that turns out over the limit is cut and held.
   */
  reportPlayback(instructionId: string, status: "ready" | "started" | "completed" | "failed" | "duration", mediaDurationMs?: number): boolean {
    if (!instructionId.startsWith(videoInstructionPrefix)) return false;
    // The desktop primary player reports for itself; a browser fallback still finishing must not steer the queue.
    if (this.options.mirror?.available === true) return true;
    const itemId = instructionId.slice(videoInstructionPrefix.length);
    if (status === "duration") { if (mediaDurationMs !== undefined) this.options.queue.reportDuration(itemId, mediaDurationMs); }
    else if (status === "started") this.options.queue.reportStarted(itemId);
    else if (status === "completed") this.options.queue.reportEnded(itemId);
    else if (status === "failed" && this.currentPhase(itemId) === "loading") this.options.queue.reportFailed(itemId);
    return true;
  }

  private toResponse(view: VideoQueueView): VideoQueueResponse {
    const mirror = this.options.mirror;
    const available = mirror?.available === true;
    const controls = view.current === null || !available ? undefined : mirror?.controlsFor(view.current.item.id);
    return toVideoQueueResponse(view, this.options.now(), controls?.pause === true && controls.seek === true, available);
  }

  private currentPhase(itemId: string): VideoPlaybackPhase | null {
    for (const purpose of ["live", "test"] as const) {
      const current = this.options.queue.view(purpose).current;
      if (current?.item.id === itemId) return current.phase;
    }
    return null;
  }
}
