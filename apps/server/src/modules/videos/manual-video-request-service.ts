import type { VideoQueuePurpose, VideoSubmissionResult } from "@stream-jams/core";
import { videoRequestInputSchema } from "@stream-jams/core/videos";
import type { ManualEventService } from "../events/manual-event-service.js";
import type { SqliteEventBusJournalRepository } from "../events/sqlite-event-bus-journal-repository.js";
import type { VideoBusAdmissionRepository } from "./video-bus-admission-repository.js";
import type { VideoRequestContext } from "./video-request-intake.js";

export interface ManualVideoRequestServiceOptions {
  readonly manualEvents: Pick<ManualEventService, "submit">;
  readonly admissions: VideoBusAdmissionRepository;
  readonly journal: Pick<SqliteEventBusJournalRepository, "findByBusId" | "consumerOutcomes">;
}

/** HTTP adapter publishes once; the consumer's durable receipt is the only admission result. */
export class ManualVideoRequestService {
  constructor(private readonly options: ManualVideoRequestServiceOptions) {}

  async submit(purpose: VideoQueuePurpose, input: unknown, context: VideoRequestContext): Promise<VideoSubmissionResult> {
    if (purpose !== "live") throw new Error("The Videos test queue was retired. Use the ordinary queue explicitly.");
    const parsed = videoRequestInputSchema.safeParse(input);
    if (!parsed.success) return { status: "rejected", reason: "invalid-request", fields: [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "request")))] };
    const receipt = await this.options.manualEvents.submit({ action: { kind: "video-request", request: parsed.data } },
      context.via === "automation"
        ? { channel: "automation", scopes: context.scopes ?? [] }
        : { channel: context.via === "operator" ? "operator" : "management" });
    return this.submission(receipt.busId) ?? { status: "pending", busId: receipt.busId, eventId: receipt.eventId };
  }

  submission(busId: string): VideoSubmissionResult | null {
    const receipt = this.options.admissions.find(busId);
    if (receipt !== null) return { ...receipt.result, busId, eventId: receipt.eventId };
    const event = this.options.journal.findByBusId(busId);
    if (event === null || event.kind !== "manual" || event.action.kind !== "video-request") return null;
    const outcome = this.options.journal.consumerOutcomes(event.sequence).find(candidate => candidate.consumerId === "videos");
    if (outcome !== undefined && (outcome.outcome === "expired" || outcome.outcome === "failed" || outcome.outcome === "no-match")) {
      return { status: "unavailable", busId, eventId: event.eventId, outcome: outcome.outcome, referenceId: outcome.referenceId };
    }
    return { status: "pending", busId, eventId: event.eventId };
  }
}
