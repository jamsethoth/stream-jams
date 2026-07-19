import { randomBytes } from "node:crypto";
import { normalizedStreamEventSchema, type NormalizedStreamEvent } from "@stream-jams/core";
import {
  getTwitchEventSubDiagnosticContext,
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
  readonly code: "EVENT_INGESTION_FAILED" | "NORMALIZED_STREAM_EVENT_SCHEMA_INVALID";
  readonly message: string;
  readonly referenceId: string;
  readonly ingestProvider?: "twitch" | "streamerbot" | undefined;
  readonly source?: string | undefined;
  readonly subscriptionType?: string | undefined;
  readonly upstreamType?: string | undefined;
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

  async ingestNormalizedEvent(event: unknown): Promise<EventIngestionResult> {
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
      return this.#reject({
        code: "EVENT_INGESTION_FAILED",
        message: messageText,
        ...getTwitchEventSubDiagnosticContext(message)
      });
    }
  }

  async #deliverNormalizedEvent(
    event: unknown,
    messages: { readonly duplicateMessage: string; readonly failureMessage: string }
  ): Promise<EventIngestionResult> {
    const parsed = normalizedStreamEventSchema.safeParse(event);
    if (!parsed.success) {
      return this.#reject({
        code: "NORMALIZED_STREAM_EVENT_SCHEMA_INVALID",
        message: "Normalized stream event failed schema validation",
        ...getNormalizedEventDiagnosticContext(event)
      });
    }

    const normalizedEvent = parsed.data;
    const diagnosticContext = getNormalizedEventDiagnosticContext(normalizedEvent);
    if (this.#seenMessageIds.has(normalizedEvent.id) || this.#inFlightMessageIds.has(normalizedEvent.id)) {
      this.#status = {
        ...this.#status,
        state: this.#status.state === "idle" ? "ready" : this.#status.state,
        duplicateCount: this.#status.duplicateCount + 1,
        message: messages.duplicateMessage
      };
      return { status: "duplicate", messageId: normalizedEvent.id };
    }

    this.#inFlightMessageIds.add(normalizedEvent.id);
    try {
      await this.#sink.handleEvent(normalizedEvent);
      this.#rememberMessageId(normalizedEvent.id);
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
      return { status: "accepted", event: normalizedEvent };
    } catch {
      return this.#reject({ code: "EVENT_INGESTION_FAILED", message: messages.failureMessage, ...diagnosticContext });
    } finally {
      this.#inFlightMessageIds.delete(normalizedEvent.id);
    }
  }

  async #reject(diagnostic: Omit<EventIngestionDiagnostic, "referenceId">): Promise<EventIngestionResult> {
    const referenceId = this.#generateReferenceId();
    const { message } = diagnostic;
    this.#status = {
      ...this.#status,
      state: "degraded",
      rejectedCount: this.#status.rejectedCount + 1,
      lastErrorAt: this.#now().toISOString(),
      message,
      referenceId
    };
    try {
      await this.#onDiagnostic({ ...diagnostic, referenceId });
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

function getNormalizedEventDiagnosticContext(event: unknown): Omit<EventIngestionDiagnostic, "code" | "message" | "referenceId"> {
  if (!isRecord(event) || (event.ingestProvider !== "twitch" && event.ingestProvider !== "streamerbot")) {
    return {};
  }

  const metadata = isRecord(event.metadata) ? event.metadata : {};
  if (event.ingestProvider === "twitch") {
    return {
      ingestProvider: "twitch",
      source: "EventSub",
      ...(typeof metadata.twitchEventSubType === "string" ? { subscriptionType: metadata.twitchEventSubType } : {})
    };
  }

  return {
    ingestProvider: "streamerbot",
    ...(typeof metadata.upstreamSource === "string" ? { source: metadata.upstreamSource } : {}),
    ...(typeof metadata.upstreamType === "string" ? { upstreamType: metadata.upstreamType } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generateReferenceId(): string {
  return `ref_${randomBytes(12).toString("base64url")}`;
}
