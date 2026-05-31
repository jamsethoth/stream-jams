import type { NormalizedStreamEvent } from "@stream-jams/core";
import {
  getTwitchEventSubMessageId,
  normalizeTwitchEventSubNotification,
  TwitchEventNormalizationError
} from "../twitch/twitch-event-normalizer.js";

export type EventIngestionResult =
  | { readonly status: "accepted"; readonly event: NormalizedStreamEvent }
  | { readonly status: "duplicate"; readonly messageId: string }
  | { readonly status: "rejected"; readonly message: string };

export interface EventIngestionStatus {
  readonly state: "idle" | "ready" | "degraded";
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly lastEventAt: string | null;
  readonly lastErrorAt: string | null;
  readonly message: string | null;
}

export interface EventSink {
  handleEvent(event: NormalizedStreamEvent): void | Promise<void>;
}

export interface EventIngestionServiceOptions {
  readonly sink: EventSink;
  readonly now?: (() => Date) | undefined;
  readonly maxDedupeEntries?: number | undefined;
}

export class EventIngestionService {
  readonly #sink: EventSink;
  readonly #now: () => Date;
  readonly #maxDedupeEntries: number;
  readonly #seenMessageIds = new Set<string>();
  #status: EventIngestionStatus = {
    state: "idle",
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    lastEventAt: null,
    lastErrorAt: null,
    message: null
  };

  constructor(options: EventIngestionServiceOptions) {
    this.#sink = options.sink;
    this.#now = options.now ?? (() => new Date());
    this.#maxDedupeEntries = options.maxDedupeEntries ?? 1_000;
  }

  getStatus(): EventIngestionStatus {
    return this.#status;
  }

  async ingestTwitchEventSubNotification(message: unknown): Promise<EventIngestionResult> {
    const messageId = getTwitchEventSubMessageId(message);
    if (messageId !== null && this.#seenMessageIds.has(messageId)) {
      this.#status = {
        ...this.#status,
        state: this.#status.state === "idle" ? "ready" : this.#status.state,
        duplicateCount: this.#status.duplicateCount + 1,
        message: "Duplicate Twitch EventSub message ignored"
      };
      return {
        status: "duplicate",
        messageId
      };
    }

    try {
      const event = normalizeTwitchEventSubNotification(message);
      if (messageId !== null) {
        this.#rememberMessageId(messageId);
      }

      await this.#sink.handleEvent(event);
      this.#status = {
        state: "ready",
        acceptedCount: this.#status.acceptedCount + 1,
        duplicateCount: this.#status.duplicateCount,
        rejectedCount: this.#status.rejectedCount,
        lastEventAt: this.#now().toISOString(),
        lastErrorAt: this.#status.lastErrorAt,
        message: null
      };
      return {
        status: "accepted",
        event
      };
    } catch (error) {
      const messageText =
        error instanceof TwitchEventNormalizationError ? error.message : "Twitch EventSub ingestion failed";
      this.#status = {
        ...this.#status,
        state: "degraded",
        rejectedCount: this.#status.rejectedCount + 1,
        lastErrorAt: this.#now().toISOString(),
        message: messageText
      };
      return {
        status: "rejected",
        message: messageText
      };
    }
  }

  #rememberMessageId(messageId: string): void {
    this.#seenMessageIds.add(messageId);
    if (this.#seenMessageIds.size <= this.#maxDedupeEntries) {
      return;
    }

    const oldest = this.#seenMessageIds.values().next().value as string | undefined;
    if (oldest !== undefined) {
      this.#seenMessageIds.delete(oldest);
    }
  }
}
