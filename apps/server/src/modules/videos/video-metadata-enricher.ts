import type { OverlayPurpose, VideoRequestItem } from "@stream-jams/core";
import type { VideoMetadataLookup, VideoMetadataLookupResult } from "./video-metadata-lookup.js";
import type { VideoQueueService } from "./video-queue-service.js";

export interface VideoMetadataDiagnostic {
  /** `info` for a lookup that failed; `debug` for one that was skipped or arrived too late. */
  readonly level: "info" | "debug";
  readonly message: string;
  /** Bounded facts only: never the link, the provider answer or any token. */
  readonly metadata: Readonly<Record<string, string | number>>;
}

export interface VideoMetadataEnricherOptions {
  readonly lookup: Pick<VideoMetadataLookup, "lookup">;
  readonly queue: Pick<VideoQueueService, "applyMetadata">;
  readonly onDiagnostic?: ((entry: VideoMetadataDiagnostic) => void) | undefined;
}

/**
 * Fills in provider details for a request after it is queued, so a submission never waits on
 * YouTube or Twitch. Each request gets one bounded lookup; a failure leaves it as queued.
 */
export class VideoMetadataEnricher {
  readonly #options: VideoMetadataEnricherOptions;
  readonly #controller = new AbortController();

  constructor(options: VideoMetadataEnricherOptions) {
    this.#options = options;
  }

  /** Looks up the item's details unless it is a direct file or already described. Never rejects. */
  async enrich(purpose: OverlayPurpose, item: VideoRequestItem): Promise<void> {
    if (this.#controller.signal.aborted || item.source.provider === "direct") return;
    if (item.providerTitle !== null && item.channelName !== null && (item.durationMs !== null || item.source.provider === "youtube")) return;
    let result: VideoMetadataLookupResult;
    try {
      result = await this.#options.lookup.lookup(item.source, this.#controller.signal);
    }
    // error-provenance: allow expected -- the lookup reports failures as results; anything else is treated as a failed lookup
    catch {
      result = { status: "failed", reason: "network" };
    }
    if (this.#controller.signal.aborted) return;
    const facts = { itemId: item.id, purpose, provider: item.source.provider };
    if (result.status === "found") {
      const applied = this.#options.queue.applyMetadata(purpose, item.id, result.metadata);
      if (!applied) this.#options.onDiagnostic?.({ level: "debug", message: "Video details arrived after the request left the queue.", metadata: facts });
      return;
    }
    this.#options.onDiagnostic?.({
      level: result.status === "skipped" ? "debug" : "info",
      message: result.status === "skipped" ? "Video details were not looked up." : "Video details could not be looked up.",
      metadata: { ...facts, outcome: result.status, reason: result.reason, ...(result.status === "failed" && result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}) }
    });
  }

  /** Cancels lookups in flight; their results are dropped. */
  dispose(): void {
    this.#controller.abort();
  }
}
