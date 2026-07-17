import { randomBytes } from "node:crypto";
import type { NormalizedStreamEvent } from "@stream-jams/core";
import {
  getTwitchEventSubMessageId,
  normalizeTwitchEventSubNotification,
  TwitchEventNormalizationError
} from "../twitch/twitch-event-normalizer.js";

export type EventIngestionResult =
  | { readonly status: "accepted"; readonly event: NormalizedStreamEvent }
  | { readonly status: "duplicate"; readonly messageId: string }
  | { readonly status: "rejected"; readonly message: string; readonly referenceId: string };

export interface EventIngestionStatus {
  readonly state: "idle" | "ready" | "degraded";
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly lastEventAt: string | null;
  readonly lastErrorAt: string | null;
  readonly message: string | null;
  readonly referenceId: string | null;
}

export interface EventIngestionDiagnostic {
  readonly message: string;
  readonly referenceId: string;
}

export interface EventSink {
  handleEvent(event: NormalizedStreamEvent): void | Promise<void>;
}

export interface EventIngestionServiceOptions {
  readonly sink: EventSink;
  readonly now?: (() => Date) | undefined;
  readonly maxDedupeEntries?: number | undefined;
  readonly generateReferenceId?: (() => string) | undefined;
  readonly onDiagnostic?: ((entry: EventIngestionDiagnostic) => void | Promise<void>) | undefined;
}

export class EventIngestionService {
  readonly #sink: EventSink;
  readonly #now: () => Date;
  readonly #maxDedupeEntries: number;
  readonly #generateReferenceId: () => string;
  readonly #onDiagnostic: NonNullable<EventIngestionServiceOptions["onDiagnostic"]>;
  readonly #seenMessageIds = new Set<string>();
  readonly #inFlightMessageIds = new Set<string>();
  #status: EventIngestionStatus = {
    state: "idle",
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    lastEventAt: null,
    lastErrorAt: null,
    message: null,
    referenceId: null
  };

  constructor(options: EventIngestionServiceOptions) {
    this.#sink = options.sink;
    this.#now = options.now ?? (() => new Date());
    this.#maxDedupeEntries = options.maxDedupeEntries ?? 1_000;
    this.#generateReferenceId = options.generateReferenceId ?? generateReferenceId;
    this.#onDiagnostic = options.onDiagnostic ?? (() => {});
  }

  getStatus(): EventIngestionStatus {
    return this.#status;
  }

  async ingestNormalizedEvent(event: NormalizedStreamEvent): Promise<EventIngestionResult> {
    return this.#deliverNormalizedEvent(event, {
      duplicateMessage: "Duplicate normalized stream event ignored",
      failureMessage: "Normalized stream event ingestion failed"
    });
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
      return await this.#deliverNormalizedEvent(event, {
        duplicateMessage: "Duplicate Twitch EventSub message ignored",
        failureMessage: "Twitch EventSub ingestion failed"
      });
    } catch (error) {
      const messageText =
        error instanceof TwitchEventNormalizationError ? error.message : "Twitch EventSub ingestion failed";
      return this.#reject(messageText);
    }
  }

  async #deliverNormalizedEvent(
    event: NormalizedStreamEvent,
    messages: { readonly duplicateMessage: string; readonly failureMessage: string }
  ): Promise<EventIngestionResult> {
    if (this.#seenMessageIds.has(event.id) || this.#inFlightMessageIds.has(event.id)) {
      this.#status = {
        ...this.#status,
        state: this.#status.state === "idle" ? "ready" : this.#status.state,
        duplicateCount: this.#status.duplicateCount + 1,
        message: messages.duplicateMessage
      };
      return { status: "duplicate", messageId: event.id };
    }

    this.#inFlightMessageIds.add(event.id);
    try {
      await this.#sink.handleEvent(event);
      this.#rememberMessageId(event.id);
      this.#status = {
        state: "ready",
        acceptedCount: this.#status.acceptedCount + 1,
        duplicateCount: this.#status.duplicateCount,
        rejectedCount: this.#status.rejectedCount,
        lastEventAt: this.#now().toISOString(),
        lastErrorAt: this.#status.lastErrorAt,
        message: null,
        referenceId: null
      };
      return { status: "accepted", event };
    } catch {
      return this.#reject(messages.failureMessage);
    } finally {
      this.#inFlightMessageIds.delete(event.id);
    }
  }

  async #reject(message: string): Promise<EventIngestionResult> {
    const referenceId = this.#generateReferenceId();
    this.#status = {
      ...this.#status,
      state: "degraded",
      rejectedCount: this.#status.rejectedCount + 1,
      lastErrorAt: this.#now().toISOString(),
      message,
      referenceId
    };
    try {
      await this.#onDiagnostic({ message, referenceId });
    } catch {
      this.#status = { ...this.#status, message: "Event ingestion diagnostics logging failed" };
    }
    return { status: "rejected", message, referenceId };
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

function generateReferenceId(): string {
  return `ref_${randomBytes(12).toString("base64url")}`;
}
