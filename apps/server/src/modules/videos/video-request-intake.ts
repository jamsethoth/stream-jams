import { z } from "zod";
import type { OverlayPurpose, VideoRequestItem, VideoSubmissionChannel, VideosModuleConfig } from "@stream-jams/core";
import { isAllowedVideoSource, parseVideoLink, videoMaximumLinkLength, videoRequesterSchema, videoTitleSchema } from "@stream-jams/core/videos";
import { VideoQueueCommandError, type VideoQueueService } from "./video-queue-service.js";

/** Longest duration a submitter may declare; the configured limit decides whether it plays. */
const maximumDeclaredDurationSeconds = 24 * 60 * 60;

export const videoRequestInputSchema = z.object({
  link: z.string().trim().min(1).max(videoMaximumLinkLength),
  title: videoTitleSchema.optional(),
  requester: videoRequesterSchema.optional(),
  durationSeconds: z.number().finite().positive().max(maximumDeclaredDurationSeconds).optional(),
  autoplay: z.boolean().optional()
}).strict();

export type VideoRequestInput = z.infer<typeof videoRequestInputSchema>;

export type VideoRequestRejection = "module-disabled" | "invalid-request" | "invalid-link" | "unsafe-link" | "unsupported-source" | "queue-full";

export type VideoRequestResult =
  | { readonly status: "accepted"; readonly item: VideoRequestItem }
  | { readonly status: "rejected"; readonly reason: VideoRequestRejection; readonly fields: readonly string[] };

export type VideoRequeueResult =
  | { readonly status: "accepted"; readonly item: VideoRequestItem }
  | { readonly status: "rejected"; readonly reason: Extract<VideoRequestRejection, "module-disabled" | "unsupported-source"> };

export interface VideoRequestIntakeOptions {
  readonly queue: Pick<VideoQueueService, "submit" | "recentItem" | "requeue">;
  readonly getConfig: () => Promise<VideosModuleConfig> | VideosModuleConfig;
  readonly isModuleEnabled: () => Promise<boolean> | boolean;
  /**
   * Called once for every request this intake queues, after the queue accepted it, so provider
   * details can be looked up without delaying the submitter. It must not throw or block.
   */
  readonly onQueued?: ((purpose: OverlayPurpose, item: VideoRequestItem) => void) | undefined;
}

export interface VideoRequestContext {
  readonly via: VideoSubmissionChannel;
  /** Whether this caller may start playback immediately with `autoplay: true`. */
  readonly mayAutoplay: boolean;
}

/**
 * The single validation boundary for every submission path. Values are never
 * echoed into rejections, so diagnostics cannot leak links or viewer input.
 */
export class VideoRequestIntake {
  constructor(private readonly options: VideoRequestIntakeOptions) {}

  async submit(purpose: OverlayPurpose, input: unknown, context: VideoRequestContext): Promise<VideoRequestResult> {
    if (!(await this.options.isModuleEnabled())) return { status: "rejected", reason: "module-disabled", fields: [] };
    const parsed = videoRequestInputSchema.safeParse(input);
    if (!parsed.success) {
      return { status: "rejected", reason: "invalid-request", fields: [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "request")))] };
    }
    const config = await this.options.getConfig();
    const link = parseVideoLink(parsed.data.link, { allowedDirectHosts: config.allowedDirectHosts });
    if (link.status === "rejected") return { status: "rejected", reason: link.reason, fields: ["link"] };
    // Channel point viewers never start playback; bots only when the operator allows it.
    const autoplay = parsed.data.autoplay === true && context.mayAutoplay && context.via !== "channel-points" &&
      (context.via !== "streamerbot" || config.streamerBotAutoplay);
    try {
      const item = this.options.queue.submit(purpose, {
        source: link.source,
        title: parsed.data.title ?? null,
        requester: parsed.data.requester ?? null,
        durationMs: parsed.data.durationSeconds === undefined ? null : Math.ceil(parsed.data.durationSeconds * 1000),
        autoplay,
        via: context.via
      });
      this.options.onQueued?.(purpose, item);
      return { status: "accepted", item };
    } catch (error) {
      if (error instanceof VideoQueueCommandError && error.code === "queue-full") return { status: "rejected", reason: "queue-full", fields: [] };
      throw error;
    }
  }

  /**
   * Replays a Recent item by queueing its source again. The same rules as a new request apply:
   * the module must be on and the link must still pass the current allowlist. Revision conflicts,
   * a missing Recent item and a full queue throw from the queue service.
   */
  async requeue(purpose: OverlayPurpose, expectedRevision: number, itemId: string, via: VideoSubmissionChannel): Promise<VideoRequeueResult> {
    const { queue } = this.options;
    if (!(await this.options.isModuleEnabled())) return { status: "rejected", reason: "module-disabled" };
    const config = await this.options.getConfig();
    const recent = queue.recentItem(purpose, itemId);
    if (!isAllowedVideoSource(recent.source, { allowedDirectHosts: config.allowedDirectHosts })) return { status: "rejected", reason: "unsupported-source" };
    const item = queue.requeue(purpose, expectedRevision, itemId, via);
    this.options.onQueued?.(purpose, item);
    return { status: "accepted", item };
  }
}
