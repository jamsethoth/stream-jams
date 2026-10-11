import { randomBytes } from "node:crypto";
import {
  effectTriggerSchema,
  normalizedStreamEventSchema,
  type EffectTrigger,
  type NormalizedStreamEvent
} from "@stream-jams/core";
import {
  getTwitchEventSubDiagnosticContext,
  getTwitchEventSubMessageId,
  normalizeTwitchEventSubNotification,
  TwitchEventNormalizationError
} from "../twitch/twitch-event-normalizer.js";
import { createNormalizedEffectTriggers } from "../screen-effects/effect-trigger-adapter.js";

export type EventIngestionResult =
  | { readonly status: "accepted"; readonly event: NormalizedStreamEvent }
  | { readonly status: "duplicate"; readonly messageId: string }
  | { readonly status: "rejected"; readonly message: string; readonly referenceId: string };

export type EffectTriggerIngestionResult =
  | { readonly status: "accepted"; readonly eventId: string }
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
  readonly code: "EVENT_INGESTION_FAILED" | "NORMALIZED_STREAM_EVENT_SCHEMA_INVALID" | "EFFECT_TRIGGER_SCHEMA_INVALID";
  readonly message: string;
  readonly referenceId: string;
  readonly ingestProvider?: "twitch" | "streamerbot" | undefined;
  readonly source?: string | undefined;
  readonly subscriptionType?: string | undefined;
  readonly upstreamType?: string | undefined;
  readonly exception?: unknown;
}

/**
 * A sink may report that it already holds the event, for example after a restart (`duplicate`), or that
 * another source already delivered the same occurrence (`merged`). Both are reported as duplicates.
 */
export type EventSinkOutcome = { readonly status: "accepted" | "duplicate" | "merged" };

export interface EventSinkDuplicate {
  readonly sourceKind: "twitch" | "streamerbot";
  readonly kind: "canonical" | "external" | null;
  readonly eventType: string | null;
}

export interface EventSink {
  handleEvent(event: NormalizedStreamEvent, triggers: readonly EffectTrigger[]): void | EventSinkOutcome | Promise<void | EventSinkOutcome>;
  /** `payload` is the untrusted external payload; the sink keeps it only for identities a consumer declared. */
  handleTriggers?(triggers: readonly EffectTrigger[], payload?: unknown): void | EventSinkOutcome | Promise<void | EventSinkOutcome>;
  /** Records input a source delivered that was rejected before it could be published. */
  recordRejected?(sourceKind: "twitch" | "streamerbot", referenceId: string): void;
  /** Records a redelivery this service recognized before publishing; `eventType` is a bounded label. */
  recordDuplicate?(input: EventSinkDuplicate): void;
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

  async ingestNormalizedEvent(
    event: unknown,
    effectTriggers?: readonly EffectTrigger[]
  ): Promise<EventIngestionResult> {
    return this.#deliverNormalizedEvent(event, {
      duplicateMessage: "Duplicate normalized stream event ignored",
      failureMessage: "Normalized stream event ingestion failed"
    }, effectTriggers);
  }

  async ingestEffectTriggers(eventId: string, triggers: unknown, payload?: unknown): Promise<EffectTriggerIngestionResult> {
    const parsed = effectTriggerSchema.array().min(1).safeParse(triggers);
    if (!parsed.success || eventId.trim().length === 0 || parsed.data.some((trigger) => trigger.eventId !== eventId)) {
      return this.#reject({
        code: "EFFECT_TRIGGER_SCHEMA_INVALID",
        message: "Screen Effects triggers failed schema validation",
        ingestProvider: "streamerbot"
      });
    }

    if (this.#seenMessageIds.has(eventId) || this.#inFlightMessageIds.has(eventId)) {
      const trigger = parsed.data.find((candidate) => candidate.kind === "streamerbot-event");
      this.#recordDuplicate({ sourceKind: "streamerbot", kind: "external", eventType: trigger === undefined ? null : `${trigger.sourceKey} · ${trigger.eventType}` });
      this.#status = {
        ...this.#status,
        state: this.#status.state === "idle" ? "ready" : this.#status.state,
        duplicateCount: this.#status.duplicateCount + 1,
        message: "Duplicate Streamer.bot event ignored"
      };
      return { status: "duplicate", messageId: eventId };
    }

    this.#inFlightMessageIds.add(eventId);
    try {
      if (this.#sink.handleTriggers === undefined) {
        throw new Error("Screen Effects trigger sink is unavailable");
      }
      const outcome = await this.#sink.handleTriggers(parsed.data, payload);
      this.#rememberMessageId(eventId);
      if (outcome?.status === "duplicate" || outcome?.status === "merged") {
        return this.#markDuplicate(eventId, "Duplicate Streamer.bot event ignored");
      }
      this.#markAccepted();
      return { status: "accepted", eventId };
    } catch (error) {
      return this.#reject({
        code: "EVENT_INGESTION_FAILED",
        message: "Streamer.bot effect trigger ingestion failed",
        ingestProvider: "streamerbot",
        exception: error
      });
    } finally {
      this.#inFlightMessageIds.delete(eventId);
    }
  }

  async ingestTwitchEventSubNotification(message: unknown): Promise<EventIngestionResult> {
    const messageId = getTwitchEventSubMessageId(message);
    if (messageId !== null && this.#seenMessageIds.has(messageId)) {
      this.#recordDuplicate({ sourceKind: "twitch", kind: "canonical", eventType: null });
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
        exception: error,
        ...getTwitchEventSubDiagnosticContext(message)
      });
    }
  }

  async #deliverNormalizedEvent(
    event: unknown,
    messages: { readonly duplicateMessage: string; readonly failureMessage: string },
    effectTriggers?: readonly EffectTrigger[]
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
    const parsedTriggers = effectTriggerSchema.array().safeParse(
      effectTriggers ?? createNormalizedEffectTriggers(normalizedEvent)
    );
    if (!parsedTriggers.success || parsedTriggers.data.some((trigger) => trigger.eventId !== normalizedEvent.id)) {
      return this.#reject({
        code: "EFFECT_TRIGGER_SCHEMA_INVALID",
        message: "Screen Effects triggers failed schema validation",
        ...getNormalizedEventDiagnosticContext(normalizedEvent)
      });
    }
    const diagnosticContext = getNormalizedEventDiagnosticContext(normalizedEvent);
    if (this.#seenMessageIds.has(normalizedEvent.id) || this.#inFlightMessageIds.has(normalizedEvent.id)) {
      this.#recordDuplicate({ sourceKind: normalizedEvent.ingestProvider, kind: "canonical", eventType: normalizedEvent.type });
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
      const outcome = await this.#sink.handleEvent(normalizedEvent, parsedTriggers.data);
      this.#rememberMessageId(normalizedEvent.id);
      if (outcome?.status === "duplicate") return this.#markDuplicate(normalizedEvent.id, messages.duplicateMessage);
      if (outcome?.status === "merged") return this.#markDuplicate(normalizedEvent.id, "Event already received from another source; merged");
      this.#markAccepted();
      return { status: "accepted", event: normalizedEvent };
    } catch (error) {
      return this.#reject({
        code: "EVENT_INGESTION_FAILED",
        message: messages.failureMessage,
        exception: error,
        ...diagnosticContext
      });
    } finally {
      this.#inFlightMessageIds.delete(normalizedEvent.id);
    }
  }

  #recordDuplicate(input: EventSinkDuplicate): void {
    try {
      this.#sink.recordDuplicate?.(input);
    }
    // error-provenance: allow cleanup -- intake diagnostics are best effort; a recording failure must not change the duplicate result
    catch {
      // The duplicate is still counted in the ingestion status.
    }
  }

  #markDuplicate(messageId: string, message: string): { readonly status: "duplicate"; readonly messageId: string } {
    this.#status = {
      ...this.#status,
      state: this.#status.state === "idle" ? "ready" : this.#status.state,
      duplicateCount: this.#status.duplicateCount + 1,
      message
    };
    return { status: "duplicate", messageId };
  }

  #markAccepted(): void {
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
  }

  async #reject(diagnostic: Omit<EventIngestionDiagnostic, "referenceId">): Promise<{
    readonly status: "rejected";
    readonly message: string;
    readonly referenceId: string;
  }> {
    const referenceId = this.#generateReferenceId();
    const { message } = diagnostic;
    if (diagnostic.ingestProvider !== undefined) {
      try {
        this.#sink.recordRejected?.(diagnostic.ingestProvider, referenceId);
      }
      // error-provenance: allow cleanup -- the rejection is still reported through diagnostics below; the intake record is best effort
      catch {
        // The journal may be the reason intake failed.
      }
    }
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
    } catch (loggingError) {
      this.#status = { ...this.#status, message: "Event ingestion diagnostics logging failed" };
      throw new AggregateError(
        diagnostic.exception === undefined ? [loggingError] : [diagnostic.exception, loggingError],
        "Event ingestion and diagnostic logging failed",
        // eslint-disable-next-line preserve-caught-error -- the original diagnostic exception stays primary when present; logger failure remains secondary
        { cause: diagnostic.exception ?? loggingError }
      );
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
