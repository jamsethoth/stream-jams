import {
  providerSetupInputSchema,
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
    ingestNormalizedEvent(event: NormalizedStreamEvent): Promise<EventIngestionResult>;
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

    if (record.secretRef === null) {
      return parsed.data.configuration;
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
    return { ...parsed.data.configuration, password };
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

    await this.#client.subscribe([{ sourceKey, eventTypes: subscribed }]);
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
      if (result.status === "unsupported") {
        await this.#emitDiagnostic({
          level: "info",
          message: "Unsupported Streamer.bot event was ignored",
          referenceId: this.#generateReferenceId(),
          source: result.source,
          type: result.type
        });
        return;
      }

      const ingestion = await this.#ingestionService.ingestNormalizedEvent(result.event);
      if (ingestion.status === "rejected") {
        this.#ingestionIssue = this.#createIssue("degraded", ingestion.message, ingestion.referenceId);
      } else if (ingestion.status === "accepted") {
        this.#ingestionIssue = null;
      }
    } catch (error) {
      const message = error instanceof StreamerBotEventNormalizationError
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
