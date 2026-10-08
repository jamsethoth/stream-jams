import { z } from "zod";
import type { OverlayPurpose, VideoRequestItem, VideoSubmissionChannel, VideosModuleConfig } from "@stream-jams/core";
import { parseVideoLink, videoMaximumLinkLength, videoRequesterSchema, videoTitleSchema } from "@stream-jams/core/videos";
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

export interface VideoRequestIntakeOptions {
  readonly queue: Pick<VideoQueueService, "submit">;
  readonly getConfig: () => VideosModuleConfig;
  readonly isModuleEnabled: () => boolean;
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

  submit(purpose: OverlayPurpose, input: unknown, context: VideoRequestContext): VideoRequestResult {
    if (!this.options.isModuleEnabled()) return { status: "rejected", reason: "module-disabled", fields: [] };
    const parsed = videoRequestInputSchema.safeParse(input);
    if (!parsed.success) {
      return { status: "rejected", reason: "invalid-request", fields: [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "request")))] };
    }
    const config = this.options.getConfig();
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
      return { status: "accepted", item };
    } catch (error) {
      if (error instanceof VideoQueueCommandError && error.code === "queue-full") return { status: "rejected", reason: "queue-full", fields: [] };
      throw error;
    }
  }
}
