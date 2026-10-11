import type { VideoQueuePurpose, VideoRequestAdmissionResult, VideoRequestItem, VideoSubmissionChannel, VideosModuleConfig } from "@stream-jams/core";
import { isAllowedVideoSource, parseVideoLink } from "@stream-jams/core/videos";
import { VideoQueueCommandError, type VideoQueueService } from "./video-queue-service.js";
import type { VideoBusAdmissionRepository, VideoBusIdentity } from "./video-bus-admission-repository.js";
import type { AutomationScope } from "../automation/automation-credential-service.js";

export { videoRequestInputSchema } from "@stream-jams/core/videos";
import { videoRequestInputSchema } from "@stream-jams/core/videos";
export type { VideoRequestInput } from "@stream-jams/core/videos";

export type { VideoRequestRejection } from "@stream-jams/core";
import type { VideoRequestRejection } from "@stream-jams/core";
export type VideoRequestResult = VideoRequestAdmissionResult;

export type VideoRequeueResult =
  | { readonly status: "accepted"; readonly item: VideoRequestItem }
  | { readonly status: "rejected"; readonly reason: Extract<VideoRequestRejection, "module-disabled" | "unsupported-source"> };

export interface VideoRequestIntakeOptions {
  readonly admissions?: VideoBusAdmissionRepository;
  readonly queue: Pick<VideoQueueService, "submit" | "recentItem" | "requeue">;
  readonly getConfig: () => Promise<VideosModuleConfig> | VideosModuleConfig;
  readonly isModuleEnabled: () => Promise<boolean> | boolean;
  /**
   * Called once for every request this intake queues, after the queue accepted it, so provider
   * details can be looked up without delaying the submitter. It must not throw or block.
   */
  readonly onQueued?: ((purpose: VideoQueuePurpose, item: VideoRequestItem) => void) | undefined;
}

export interface VideoRequestContext {
  readonly scopes?: readonly AutomationScope[];
  readonly busIdentity?: VideoBusIdentity;
  /** Provider policy is independent from truthful submitted-via provenance for manual simulations. */
  readonly policy?: "streamerbot" | "channel-points";
  readonly via: VideoSubmissionChannel;
  /** Whether this caller may start playback immediately with `autoplay: true`. */
  readonly mayAutoplay: boolean;
  /** Accepted requests arrive held for operator review (for example, review-required reward mappings). */
  readonly reviewRequired?: boolean;
}

/**
 * The single validation boundary for every submission path. Values are never
 * echoed into rejections, so diagnostics cannot leak links or viewer input.
 */
export class VideoRequestIntake {
  constructor(private readonly options: VideoRequestIntakeOptions) {}

  /** Redelivery returns the committed snapshot even when the original payload is now retired. */
  findAdmission(identity: VideoBusIdentity): VideoRequestResult | null {
    const receipt = this.options.admissions?.find(identity.busId);
    if (receipt !== null && receipt !== undefined && receipt.eventId !== identity.eventId) throw new Error("Video admission identity does not match its durable receipt.");
    return receipt?.result ?? null;
  }

  async submit(purpose: VideoQueuePurpose, input: unknown, context: VideoRequestContext): Promise<VideoRequestResult> {
    const identity = context.busIdentity;
    if (identity !== undefined && this.options.admissions === undefined) throw new Error("Durable video admission is unavailable.");
    this.options.admissions?.prune();
    const receipt = identity === undefined ? null : this.findAdmission(identity);
    if (receipt !== null) return receipt;
    const reject = (reason: VideoRequestRejection, fields: readonly string[]): VideoRequestResult => {
      const result = { status: "rejected", reason, fields } as const;
      if (identity !== undefined) this.options.admissions?.record(identity, result);
      return result;
    };
    if (!(await this.options.isModuleEnabled())) return reject("module-disabled", []);
    const parsed = videoRequestInputSchema.safeParse(input);
    if (!parsed.success) {
      return reject("invalid-request", [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "request")))]);
    }
    const config = await this.options.getConfig();
    const link = parseVideoLink(parsed.data.link, { allowedDirectHosts: config.allowedDirectHosts });
    if (link.status === "rejected") return reject(link.reason, ["link"]);
    // Channel point viewers never start playback; bots only when the operator allows it.
    const policy = context.policy ?? context.via;
    const autoplay = parsed.data.autoplay === true && context.mayAutoplay && policy !== "channel-points" &&
      (policy !== "streamerbot" || config.streamerBotAutoplay);
    try {
      const item = this.options.queue.submit(purpose, {
        source: link.source,
        title: parsed.data.title ?? null,
        requester: parsed.data.requester ?? null,
        durationMs: parsed.data.durationSeconds === undefined ? null : Math.ceil(parsed.data.durationSeconds * 1000),
        autoplay,
        via: context.via,
        ...(context.reviewRequired === true ? { reviewRequired: true } : {})
      }, identity);
      this.options.onQueued?.(purpose, item);
      return { status: "accepted", item };
    } catch (error) {
      if (error instanceof VideoQueueCommandError && error.code === "queue-full") return reject("queue-full", []);
      throw error;
    }
  }

  /**
   * Replays a Recent item by queueing its source again. The same rules as a new request apply:
   * the module must be on and the link must still pass the current allowlist. Revision conflicts,
   * a missing Recent item and a full queue throw from the queue service.
   */
  async requeue(purpose: VideoQueuePurpose, expectedRevision: number, itemId: string, via: VideoSubmissionChannel): Promise<VideoRequeueResult> {
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
