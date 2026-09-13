import {
  providerSetupInputSchema,
  type EffectTrigger,
  type NormalizedStreamEvent,
  type SecretStore,
  type StreamerBotSubscriptionSelection
} from "@stream-jams/core";
import type { EventIngestionResult } from "../events/event-ingestion-service.js";
import type {
  ProviderRegistrationRecord,
  SqliteProviderRegistrationRepository
} from "../providers/sqlite-provider-registration-repository.js";
import type {
  StreamerBotClientStatus,
  StreamerBotConnectionInput,
  StreamerBotConnectionState,
  StreamerBotEventEnvelope
} from "./streamerbot-client.js";
import {
  createStreamerBotEffectTriggers,
  MissingStreamerBotEventIdError
} from "../screen-effects/effect-trigger-adapter.js";
import {
  normalizeStreamerBotEvent,
  StreamerBotEventNormalizationError
} from "./streamerbot-event-normalizer.js";

const supportedTwitchEventTypes = [
  "Follow", "Sub", "ReSub", "Cheer", "Raid", "RewardRedemption",
  "GiftSub", "GiftBomb",
  "HypeTrainStart", "HypeTrainUpdate", "HypeTrainEnd",
  "PollCreated", "PollUpdated", "PollCompleted", "PollArchived", "PollTerminated",
  "PredictionCreated", "PredictionUpdated", "PredictionLocked", "PredictionCompleted", "PredictionCanceled",
  "StreamOnline", "StreamOffline"
] as const;

export interface StreamerBotRuntimeClient {
  connect(input: StreamerBotConnectionInput): void;
  disconnect(): void;
  getStatus(): StreamerBotClientStatus;
  getEvents(): Promise<Record<string, readonly string[]>>;
  subscribe(selections: readonly StreamerBotSubscriptionSelection[]): Promise<void>;
  unsubscribe(selections: readonly StreamerBotSubscriptionSelection[]): Promise<void>;
}

export interface StreamerBotRuntimeDiagnostic {
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly referenceId: string;
  readonly source?: string | undefined;
  readonly type?: string | undefined;
}

export interface StreamerBotRuntimeStatus {
  readonly state: StreamerBotConnectionState;
  readonly connectionState: StreamerBotConnectionState;
  readonly activeProviderId: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly lastErrorAt: string | null;
  readonly subscriptionSourceKeys: readonly string[];
  readonly subscribedEventTypes: readonly string[];
  readonly missingEventTypes: readonly string[];
  readonly message: string | null;
  readonly referenceId: string | null;
}

export interface StreamerBotRuntimeServiceOptions {
  readonly repository: Pick<SqliteProviderRegistrationRepository, "findActive">;
  readonly secretStore: Pick<SecretStore, "getSecret">;
  readonly createClient: (
    onEvent: (envelope: StreamerBotEventEnvelope) => void | Promise<void>
  ) => StreamerBotRuntimeClient;
  readonly ingestionService: {
    ingestNormalizedEvent(
      event: NormalizedStreamEvent,
      effectTriggers?: readonly EffectTrigger[]
    ): Promise<EventIngestionResult>;
    ingestEffectTriggers(
      eventId: string,
      triggers: readonly EffectTrigger[]
    ): Promise<
      | { readonly status: "accepted"; readonly eventId: string }
      | { readonly status: "duplicate"; readonly messageId: string }
      | { readonly status: "rejected"; readonly message: string; readonly referenceId: string }
    >;
  };
  readonly generateReferenceId: () => string;
  readonly onDiagnostic?: ((entry: StreamerBotRuntimeDiagnostic) => void | Promise<void>) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly sleep?: ((delayMs: number) => Promise<void>) | undefined;
  readonly connectionTimeoutMs?: number | undefined;
  readonly pollIntervalMs?: number | undefined;
}

interface RuntimeIssue {
  readonly state: "degraded" | "error";
  readonly message: string;
  readonly occurredAt: string;
  readonly referenceId: string;
}

export class StreamerBotRuntimeUnavailableError extends Error {
  readonly code = "STREAMERBOT_RUNTIME_UNAVAILABLE";

  constructor() {
    super("The active Streamer.bot connection is unavailable");
    this.name = "StreamerBotRuntimeUnavailableError";
  }
}

export class StreamerBotRuntimeService {
  readonly #repository: StreamerBotRuntimeServiceOptions["repository"];
  readonly #secretStore: StreamerBotRuntimeServiceOptions["secretStore"];
  readonly #client: StreamerBotRuntimeClient;
  readonly #ingestionService: StreamerBotRuntimeServiceOptions["ingestionService"];
  readonly #generateReferenceId: () => string;
  readonly #onDiagnostic: NonNullable<StreamerBotRuntimeServiceOptions["onDiagnostic"]>;
  readonly #now: () => Date;
  readonly #sleep: (delayMs: number) => Promise<void>;
  readonly #connectionTimeoutMs: number;
  readonly #pollIntervalMs: number;
  #activeProviderId: string | null = null;
  #subscribedEventTypes: readonly string[] = [];
  #missingEventTypes: readonly string[] = [];
  #issue: RuntimeIssue | null = null;
  #ingestionIssue: RuntimeIssue | null = null;
  #externalSubscriptions: readonly StreamerBotSubscriptionSelection[] = [];
  #twitchBroadcasterId: string | null = null;
  #requiredSubscriptions: readonly StreamerBotSubscriptionSelection[] = [];

  constructor(options: StreamerBotRuntimeServiceOptions) {
    this.#repository = options.repository;
    this.#secretStore = options.secretStore;
    this.#ingestionService = options.ingestionService;
    this.#generateReferenceId = options.generateReferenceId;
    this.#onDiagnostic = options.onDiagnostic ?? (() => {});
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.#connectionTimeoutMs = options.connectionTimeoutMs ?? 5_000;
    this.#pollIntervalMs = options.pollIntervalMs ?? 25;
    this.#client = options.createClient((envelope) => this.#handleEvent(envelope));
  }

  async syncActiveRegistration(): Promise<StreamerBotRuntimeStatus> {
    const active = await this.#repository.findActive("event-source");
    if (active?.provider.kind !== "streamerbot") {
      this.disconnect();
      return this.getStatus();
    }

    const clientState = this.#client.getStatus().state;
    if (
      this.#activeProviderId === active.provider.id &&
      clientState !== "idle" &&
      clientState !== "error"
    ) {
      return this.getStatus();
    }

    this.#activeProviderId = active.provider.id;
    this.#subscribedEventTypes = [];
    this.#missingEventTypes = [];
    this.#issue = null;
    this.#ingestionIssue = null;
    this.#externalSubscriptions = [];
    this.#twitchBroadcasterId = null;
    this.#requiredSubscriptions = [];

    const connection = await this.#connectionInput(active);
    if (connection === null) return this.getStatus();

    try {
      this.#client.connect(connection);
      await this.#waitForConnection();
      await this.#subscribeSupportedEvents();
    } catch (error) {
      const clientFailure = this.#client.getStatus();
      this.#client.disconnect();
      if (clientFailure.referenceId !== null && clientFailure.message !== null) {
        this.#adoptIssue(
          "error",
          clientFailure.message,
          clientFailure.referenceId,
          clientFailure.lastErrorAt ?? this.#now().toISOString()
        );
      } else {
        await this.#recordIssue(
          "error",
          safeRuntimeFailure(error),
          "error"
        );
      }
    }
    return this.getStatus();
  }

  disconnect(): void {
    if (this.#client.getStatus().state !== "idle") {
      this.#client.disconnect();
    }
    this.#activeProviderId = null;
    this.#subscribedEventTypes = [];
    this.#missingEventTypes = [];
    this.#issue = null;
    this.#ingestionIssue = null;
    this.#externalSubscriptions = [];
    this.#twitchBroadcasterId = null;
    this.#requiredSubscriptions = [];
  }

  getStatus(): StreamerBotRuntimeStatus {
    const client = this.#client.getStatus();
    const clientHasActiveIssue = client.referenceId !== null;
    const runtimeIssue = this.#ingestionIssue ?? this.#issue;
    return {
      state: clientHasActiveIssue ? client.state : runtimeIssue?.state ?? client.state,
      connectionState: client.state,
      activeProviderId: this.#activeProviderId,
      connectedAt: client.connectedAt,
      lastMessageAt: client.lastMessageAt,
      lastErrorAt: clientHasActiveIssue ? client.lastErrorAt : runtimeIssue?.occurredAt ?? client.lastErrorAt,
      subscriptionSourceKeys: client.subscriptionSourceKeys,
      subscribedEventTypes: this.#subscribedEventTypes,
      missingEventTypes: this.#missingEventTypes,
      message: clientHasActiveIssue ? client.message : runtimeIssue?.message ?? client.message,
      referenceId: clientHasActiveIssue ? client.referenceId : runtimeIssue?.referenceId ?? null
    };
  }

  async getCatalog(providerId: string): Promise<Record<string, readonly string[]>> {
    this.#assertActiveProvider(providerId);
    return cloneCatalog(await this.#client.getEvents());
  }

  async replaceExternalSubscriptions(
    providerId: string,
    previous: readonly StreamerBotSubscriptionSelection[],
    next: readonly StreamerBotSubscriptionSelection[]
  ): Promise<void> {
    this.#assertActiveProvider(providerId);
    const catalog = await this.#client.getEvents();
    const unavailable = next.some((selection) => {
      const advertised = catalog[selection.sourceKey];
      return advertised === undefined || selection.eventTypes.some((eventType) => !advertised.includes(eventType));
    });
    if (unavailable) {
      throw new Error("One or more selected Streamer.bot events are no longer advertised");
    }

    const before = mergeSubscriptionSelections(this.#requiredSubscriptions, previous);
    const after = mergeSubscriptionSelections(this.#requiredSubscriptions, next);
    const additions = subtractSubscriptionSelections(after, before);
    const removals = subtractSubscriptionSelections(before, after);
    if (additions.length > 0) await this.#client.subscribe(additions);
    try {
      if (removals.length > 0) await this.#client.unsubscribe(removals);
    } catch (error) {
      if (additions.length > 0) {
        try { await this.#client.unsubscribe(additions); } catch { /* keep the original transport failure */ }
      }
      throw error;
    }
    this.#externalSubscriptions = next.map(cloneSelection);
  }

  #assertActiveProvider(providerId: string): void {
    if (this.#activeProviderId !== providerId || this.#client.getStatus().state !== "connected") {
      throw new StreamerBotRuntimeUnavailableError();
    }
  }

  async #connectionInput(record: ProviderRegistrationRecord): Promise<StreamerBotConnectionInput | null> {
    const parsed = providerSetupInputSchema.safeParse({
      kind: "streamerbot",
      name: record.provider.name,
      configuration: record.configuration
    });
    if (!parsed.success || parsed.data.kind !== "streamerbot") {
      await this.#recordIssue("error", "Streamer.bot connection configuration is invalid", "error");
      return null;
    }

    this.#externalSubscriptions = parsed.data.configuration.externalSubscriptions;
    this.#twitchBroadcasterId = parsed.data.configuration.twitchBroadcasterId;
    const connection = {
      protocol: parsed.data.configuration.protocol,
      host: parsed.data.configuration.host,
      port: parsed.data.configuration.port,
      endpoint: parsed.data.configuration.endpoint
    } satisfies StreamerBotConnectionInput;

    if (record.secretRef === null) {
      return connection;
    }

    let password: string | null;
    try {
      password = await this.#secretStore.getSecret(record.secretRef);
    } catch {
      await this.#recordIssue("error", "Streamer.bot password could not be read from the secret store", "error");
      return null;
    }
    if (password === null) {
      await this.#recordIssue("error", "Streamer.bot password is unavailable", "error");
      return null;
    }
    return { ...connection, password };
  }

  async #waitForConnection(): Promise<void> {
    const attempts = Math.max(1, Math.ceil(this.#connectionTimeoutMs / this.#pollIntervalMs));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const status = this.#client.getStatus();
      if (status.state === "connected") return;
      if (status.state === "error" || status.state === "degraded") {
        throw new Error(status.message ?? "Streamer.bot connection failed");
      }
      await this.#sleep(this.#pollIntervalMs);
    }
    throw new Error("Streamer.bot connection timed out");
  }

  async #subscribeSupportedEvents(): Promise<void> {
    const available = await this.#client.getEvents();
    const sourceKey = Object.keys(available).find((key) => key.toLowerCase() === "twitch");
    if (sourceKey === undefined) {
      throw new Error("Streamer.bot did not expose a Twitch event category");
    }

    const availableTypes = new Set(available[sourceKey]);
    const subscribed = supportedTwitchEventTypes.filter((type) => availableTypes.has(type));
    const missing = supportedTwitchEventTypes.filter((type) => !availableTypes.has(type));
    if (subscribed.length === 0) {
      throw new Error("Streamer.bot did not expose any supported Twitch events");
    }

    this.#requiredSubscriptions = [{ sourceKey, eventTypes: subscribed }];
    const configured = this.#externalSubscriptions.filter((selection) => {
        const advertised = available[selection.sourceKey];
        return advertised !== undefined && selection.eventTypes.every((eventType) => advertised.includes(eventType));
      });
    const selections = mergeSubscriptionSelections(this.#requiredSubscriptions, configured);
    await this.#client.subscribe(selections);
    this.#externalSubscriptions = configured.map(cloneSelection);
    this.#subscribedEventTypes = subscribed;
    this.#missingEventTypes = missing;
    if (missing.length > 0) {
      await this.#recordIssue(
        "degraded",
        `Streamer.bot is missing supported Twitch events: ${missing.join(", ")}`,
        "warn"
      );
    }
  }

  async #handleEvent(envelope: StreamerBotEventEnvelope): Promise<void> {
    try {
      const result = normalizeStreamerBotEvent(envelope);
      const normalizedEvent = result.status === "normalized" ? result.event : null;
      const effectTriggers = createStreamerBotEffectTriggers(envelope, normalizedEvent, {
        providerId: this.#activeProviderId ?? "streamerbot",
        twitchBroadcasterId: this.#twitchBroadcasterId,
        externalSubscriptions: this.#externalSubscriptions
      });
      if (result.status === "unsupported" && effectTriggers.length === 0) {
        await this.#emitDiagnostic({
          level: "info",
          message: "Unsupported Streamer.bot event was ignored",
          referenceId: this.#generateReferenceId(),
          source: result.source,
          type: result.type
        });
        return;
      }

      const ingestion = result.status === "normalized"
        ? await this.#ingestionService.ingestNormalizedEvent(result.event, effectTriggers)
        : await this.#ingestionService.ingestEffectTriggers(effectTriggers[0]?.eventId ?? "", effectTriggers);
      if (ingestion.status === "rejected") {
        this.#ingestionIssue = this.#createIssue("degraded", ingestion.message, ingestion.referenceId);
      } else if (ingestion.status === "accepted") {
        this.#ingestionIssue = null;
      }
    } catch (error) {
      const message = error instanceof StreamerBotEventNormalizationError || error instanceof MissingStreamerBotEventIdError
        ? error.message
        : "Streamer.bot event ingestion failed";
      await this.#recordIssue("degraded", message, "error", envelope);
    }
  }

  async #recordIssue(
    state: RuntimeIssue["state"],
    message: string,
    level: StreamerBotRuntimeDiagnostic["level"],
    envelope?: StreamerBotEventEnvelope
  ): Promise<void> {
    const referenceId = this.#generateReferenceId();
    this.#issue = {
      state,
      message,
      occurredAt: this.#now().toISOString(),
      referenceId
    };
    await this.#emitDiagnostic({
      level,
      message,
      referenceId,
      ...(envelope === undefined ? {} : { source: envelope.event.source, type: envelope.event.type })
    });
  }

  #adoptIssue(
    state: RuntimeIssue["state"],
    message: string,
    referenceId: string,
    occurredAt = this.#now().toISOString()
  ): void {
    this.#issue = this.#createIssue(state, message, referenceId, occurredAt);
  }

  #createIssue(
    state: RuntimeIssue["state"],
    message: string,
    referenceId: string,
    occurredAt = this.#now().toISOString()
  ): RuntimeIssue {
    return { state, message, occurredAt, referenceId };
  }

  async #emitDiagnostic(entry: StreamerBotRuntimeDiagnostic): Promise<void> {
    try {
      await this.#onDiagnostic(entry);
    } catch {
      this.#issue = {
        state: "degraded",
        message: "Streamer.bot diagnostics logging failed",
        occurredAt: this.#now().toISOString(),
        referenceId: entry.referenceId
      };
    }
  }
}

function mergeSubscriptionSelections(
  required: readonly StreamerBotSubscriptionSelection[],
  configured: readonly StreamerBotSubscriptionSelection[]
): StreamerBotSubscriptionSelection[] {
  const merged = new Map<string, string[]>();
  for (const selection of [...required, ...configured]) {
    const eventTypes = merged.get(selection.sourceKey) ?? [];
    for (const eventType of selection.eventTypes) {
      if (!eventTypes.includes(eventType)) eventTypes.push(eventType);
    }
    merged.set(selection.sourceKey, eventTypes);
  }
  return Array.from(merged, ([sourceKey, eventTypes]) => ({ sourceKey, eventTypes }));
}

function subtractSubscriptionSelections(
  selections: readonly StreamerBotSubscriptionSelection[],
  excluded: readonly StreamerBotSubscriptionSelection[]
): StreamerBotSubscriptionSelection[] {
  const excludedPairs = new Set(excluded.flatMap((selection) =>
    selection.eventTypes.map((eventType) => `${JSON.stringify(selection.sourceKey)}:${JSON.stringify(eventType)}`)
  ));
  return selections.flatMap((selection) => {
    const eventTypes = selection.eventTypes.filter((eventType) =>
      !excludedPairs.has(`${JSON.stringify(selection.sourceKey)}:${JSON.stringify(eventType)}`)
    );
    return eventTypes.length === 0 ? [] : [{ sourceKey: selection.sourceKey, eventTypes }];
  });
}

function cloneSelection(selection: StreamerBotSubscriptionSelection): StreamerBotSubscriptionSelection {
  return { sourceKey: selection.sourceKey, eventTypes: [...selection.eventTypes] };
}

function cloneCatalog(catalog: Record<string, readonly string[]>): Record<string, readonly string[]> {
  return Object.fromEntries(Object.entries(catalog).map(([sourceKey, eventTypes]) => [sourceKey, [...eventTypes]]));
}

function safeRuntimeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Streamer.bot runtime could not be started";
  if (
    error.message.startsWith("Streamer.bot connection") ||
    error.message.startsWith("Streamer.bot did not expose") ||
    error.message.startsWith("Streamer.bot request")
  ) {
    return error.message;
  }
  return "Streamer.bot runtime could not be started";
}
