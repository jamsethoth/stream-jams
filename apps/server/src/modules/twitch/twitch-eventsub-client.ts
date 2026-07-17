import { randomBytes } from "node:crypto";
import type { TwitchAccount } from "./twitch-account-repository.js";

export type TwitchEventSubConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface TwitchEventSubStatus {
  readonly state: TwitchEventSubConnectionState;
  readonly sessionId: string | null;
  readonly message: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly lastErrorAt: string | null;
  readonly subscriptionTypes: readonly string[];
  readonly referenceId: string | null;
}

export interface TwitchEventSubDiagnostic {
  readonly message: string;
  readonly referenceId: string;
}

export interface TwitchEventSubSubscriptionRequest {
  readonly type: string;
  readonly version: string;
  readonly condition: Record<string, string>;
  readonly transport: {
    readonly method: "websocket";
    readonly session_id: string;
  };
}

export interface TwitchEventSubCreateSubscriptionInput {
  readonly accessToken: string;
  readonly clientId: string;
  readonly subscription: TwitchEventSubSubscriptionRequest;
}

export interface TwitchEventSubCreateSubscriptionResult {
  readonly id: string;
  readonly status: string;
  readonly type: string;
}

export interface TwitchEventSubApiClient {
  createSubscription(input: TwitchEventSubCreateSubscriptionInput): Promise<TwitchEventSubCreateSubscriptionResult>;
}

export interface TwitchEventSubApiClientOptions {
  readonly fetch?: typeof fetch | undefined;
  readonly apiBaseUrl?: string | undefined;
}

export interface TwitchEventSubConnectionInput {
  readonly account: Pick<TwitchAccount, "accountId" | "scopes">;
  readonly accessToken: string;
  readonly clientId: string;
}

export interface TwitchEventSubSocket {
  addEventListener(event: "open", listener: () => void): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(event: "close", listener: (event: { readonly code?: number; readonly reason?: string }) => void): void;
  addEventListener(event: "error", listener: (event: unknown) => void): void;
  close(): void;
}

export interface TwitchEventSubClientOptions {
  readonly apiClient: TwitchEventSubApiClient;
  readonly socketFactory: (url: string) => TwitchEventSubSocket;
  readonly onNotification: (message: unknown) => void | Promise<void>;
  readonly baseUrl?: string | undefined;
  readonly now?: (() => Date) | undefined;
  readonly schedule?: ((callback: () => void, delayMs: number) => unknown) | undefined;
  readonly backoffMs?: readonly number[] | undefined;
  readonly generateReferenceId?: (() => string) | undefined;
  readonly onDiagnostic?: ((entry: TwitchEventSubDiagnostic) => void | Promise<void>) | undefined;
}

interface TwitchSessionMessage {
  readonly metadata: {
    readonly message_id: string | undefined;
    readonly message_type: string;
    readonly message_timestamp: string;
    readonly subscription_type: string | undefined;
    readonly subscription_version: string | undefined;
  };
  readonly payload: {
    readonly session: {
      readonly id: string;
      readonly status: string;
      readonly reconnect_url: string | null | undefined;
      readonly connected_at: string;
    } | undefined;
    readonly subscription: {
      readonly status: string;
      readonly type: string;
    } | undefined;
    readonly event: Record<string, unknown> | undefined;
  };
}

interface PersistentFailure {
  readonly message: string;
  readonly occurredAt: string;
  readonly referenceId: string;
}

export class TwitchEventSubApiError extends Error {
  readonly code = "TWITCH_EVENTSUB_API_FAILED";

  constructor(readonly status: number) {
    super("Twitch EventSub API request failed");
    this.name = "TwitchEventSubApiError";
  }
}

export class TwitchEventSubResponseError extends Error {
  readonly code = "TWITCH_EVENTSUB_RESPONSE_INVALID";

  constructor() {
    super("Twitch EventSub API response was invalid");
    this.name = "TwitchEventSubResponseError";
  }
}

export class DefaultTwitchEventSubApiClient implements TwitchEventSubApiClient {
  readonly #fetch: typeof fetch;
  readonly #apiBaseUrl: string;

  constructor(options: TwitchEventSubApiClientOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#apiBaseUrl = options.apiBaseUrl ?? "https://api.twitch.tv/helix";
  }

  async createSubscription(input: TwitchEventSubCreateSubscriptionInput): Promise<TwitchEventSubCreateSubscriptionResult> {
    const response = await this.#fetch(this.#apiBaseUrl + "/eventsub/subscriptions", {
      method: "POST",
      headers: {
        authorization: "Bearer " + input.accessToken,
        "client-id": input.clientId,
        "content-type": "application/json"
      },
      body: JSON.stringify(input.subscription)
    });
    if (!response.ok) {
      throw new TwitchEventSubApiError(response.status);
    }

    const body = (await response.json()) as unknown;
    if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.data[0])) {
      throw new TwitchEventSubResponseError();
    }

    const created = body.data[0];
    if (typeof created.id !== "string" || typeof created.status !== "string" || typeof created.type !== "string") {
      throw new TwitchEventSubResponseError();
    }

    return {
      id: created.id,
      status: created.status,
      type: created.type
    };
  }
}

export class TwitchEventSubClient {
  readonly #apiClient: TwitchEventSubApiClient;
  readonly #socketFactory: (url: string) => TwitchEventSubSocket;
  readonly #onNotification: (message: unknown) => void | Promise<void>;
  readonly #baseUrl: string;
  readonly #now: () => Date;
  readonly #schedule: (callback: () => void, delayMs: number) => unknown;
  readonly #backoffMs: readonly number[];
  readonly #generateReferenceId: () => string;
  readonly #onDiagnostic: NonNullable<TwitchEventSubClientOptions["onDiagnostic"]>;
  #connection: TwitchEventSubConnectionInput | null = null;
  #connectionGeneration = 0;
  #reconnectAttempt = 0;
  #socket: TwitchEventSubSocket | null = null;
  #messageQueue: Promise<void> = Promise.resolve();
  #status: TwitchEventSubStatus = {
    state: "idle",
    sessionId: null,
    message: null,
    connectedAt: null,
    lastMessageAt: null,
    lastErrorAt: null,
    subscriptionTypes: [],
    referenceId: null
  };
  #recoverableFailureReferenceId: string | null = null;
  #persistentFailure: PersistentFailure | null = null;
  #stopped = true;

  constructor(options: TwitchEventSubClientOptions) {
    this.#apiClient = options.apiClient;
    this.#socketFactory = options.socketFactory;
    this.#onNotification = options.onNotification;
    this.#baseUrl = options.baseUrl ?? "wss://eventsub.wss.twitch.tv/ws";
    this.#now = options.now ?? (() => new Date());
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#backoffMs = options.backoffMs ?? [1_000, 2_000, 5_000, 10_000];
    this.#generateReferenceId = options.generateReferenceId ?? generateReferenceId;
    this.#onDiagnostic = options.onDiagnostic ?? (() => {});
  }

  connect(input: TwitchEventSubConnectionInput): void {
    const connectionGeneration = ++this.#connectionGeneration;
    this.#stopped = true;
    const previousSocket = this.#socket;
    this.#socket = null;
    previousSocket?.close();
    this.#connection = input;
    this.#stopped = false;
    this.#reconnectAttempt = 0;
    this.#messageQueue = Promise.resolve();
    this.#openSocket(this.#baseUrl, true, connectionGeneration);
  }

  disconnect(): void {
    this.#connectionGeneration += 1;
    this.#stopped = true;
    this.#socket?.close();
    this.#socket = null;
    this.#status = {
      state: "idle",
      sessionId: null,
      message: null,
      connectedAt: null,
      lastMessageAt: null,
      lastErrorAt: null,
      subscriptionTypes: [],
      referenceId: null
    };
    this.#recoverableFailureReferenceId = null;
    this.#persistentFailure = null;
    this.#messageQueue = Promise.resolve();
  }

  getStatus(): TwitchEventSubStatus {
    return this.#status;
  }

  #openSocket(url: string, recreateSubscriptions: boolean, connectionGeneration: number): void {
    this.#status = {
      ...this.#status,
      state: "connecting",
      message: null
    };
    const socket = this.#socketFactory(url);
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const handling = this.#messageQueue.then(async () => {
        if (this.#isCurrentConnection(connectionGeneration, socket)) {
          await this.#handleMessage(event.data, recreateSubscriptions, connectionGeneration, socket);
        }
      }).catch(() => {
        if (this.#isCurrentConnection(connectionGeneration, socket)) {
          this.#recordFailure("Twitch EventSub message handling failed", this.#now().toISOString(), {}, true);
        }
      });
      this.#messageQueue = handling;
      return handling;
    });
    socket.addEventListener("close", (event) => {
      if (this.#isCurrentConnection(connectionGeneration, socket)) {
        this.#handleClose(event, connectionGeneration);
      }
    });
    socket.addEventListener("error", () => {
      if (this.#isCurrentConnection(connectionGeneration, socket)) {
        this.#recordFailure("Twitch EventSub WebSocket error", this.#now().toISOString(), {}, true);
      }
    });
  }

  async #handleMessage(
    data: unknown,
    recreateSubscriptions: boolean,
    connectionGeneration: number,
    socket: TwitchEventSubSocket
  ): Promise<void> {
    const rawMessage = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
    const message = parseMessage(rawMessage);
    const timestamp = requiredString(message.metadata.message_timestamp);
    switch (message.metadata.message_type) {
      case "session_welcome":
        await this.#handleWelcome(message, recreateSubscriptions, connectionGeneration, socket);
        return;
      case "session_keepalive":
        this.#recordHealthyMessage(timestamp);
        return;
      case "session_reconnect":
        this.#handleReconnect(message, connectionGeneration);
        return;
      case "notification":
        this.#recordHealthyMessage(timestamp);
        await this.#onNotification(rawMessage);
        return;
      case "revocation":
        this.#recordPersistentFailure(
          "Twitch EventSub subscription was revoked: " + String(message.payload.subscription?.status ?? "unknown"),
          timestamp,
          { lastMessageAt: timestamp }
        );
        return;
      default:
        this.#recordFailure("Unsupported Twitch EventSub message type", timestamp, { lastMessageAt: timestamp }, true);
    }
  }

  async #handleWelcome(
    message: TwitchSessionMessage,
    recreateSubscriptions: boolean,
    connectionGeneration: number,
    socket: TwitchEventSubSocket
  ): Promise<void> {
    const session = parseSession(message);
    const connection = this.#connection;
    const occurredAt = requiredString(message.metadata.message_timestamp);
    const subscriptionRequests =
      connection === null || !recreateSubscriptions
        ? []
        : buildTwitchEventSubSubscriptionRequests({
            account: connection.account,
            sessionId: session.id
          });
    const pendingFailure = recreateSubscriptions ? this.#persistentFailure : null;
    this.#status = {
      state: recreateSubscriptions ? (pendingFailure === null ? "connecting" : "error") : "connected",
      sessionId: session.id,
      message: pendingFailure?.message ?? null,
      connectedAt: session.connected_at,
      lastMessageAt: occurredAt,
      lastErrorAt: pendingFailure?.occurredAt ?? null,
      subscriptionTypes: recreateSubscriptions ? [] : this.#status.subscriptionTypes,
      referenceId: pendingFailure?.referenceId ?? null
    };
    if (connection !== null && recreateSubscriptions) {
      try {
        for (const subscription of subscriptionRequests) {
          await this.#apiClient.createSubscription({
            accessToken: connection.accessToken,
            clientId: connection.clientId,
            subscription
          });
          if (!this.#isCurrentConnection(connectionGeneration, socket)) {
            return;
          }
        }
      } catch (error) {
        if (!this.#isCurrentConnection(connectionGeneration, socket)) {
          return;
        }
        this.#recordPersistentFailure(
          describeSubscriptionSetupFailure(error),
          occurredAt,
          { lastMessageAt: occurredAt }
        );
        this.#retrySubscriptionSetup(connectionGeneration, socket);
        return;
      }
    }
    if (!this.#isCurrentConnection(connectionGeneration, socket)) {
      return;
    }
    this.#reconnectAttempt = 0;
    this.#recoverableFailureReferenceId = null;
    if (recreateSubscriptions) {
      this.#persistentFailure = null;
      this.#status = {
        ...this.#status,
        state: "connected",
        message: null,
        lastErrorAt: null,
        subscriptionTypes: subscriptionRequests.map((request) => request.type),
        referenceId: null
      };
    } else if (this.#persistentFailure !== null) {
      this.#restorePersistentFailure(occurredAt);
    }
  }

  #retrySubscriptionSetup(connectionGeneration: number, socket: TwitchEventSubSocket): void {
    if (!this.#isCurrentConnection(connectionGeneration, socket)) {
      return;
    }
    const failedSocket = socket;
    this.#socket = null;
    failedSocket?.close();
    this.#scheduleReconnect(connectionGeneration);
  }

  #handleReconnect(message: TwitchSessionMessage, connectionGeneration: number): void {
    const session = parseSession(message);
    if (typeof session.reconnect_url !== "string" || session.reconnect_url.trim() === "") {
      this.#recordFailure(
        "Twitch EventSub reconnect URL was missing",
        requiredString(message.metadata.message_timestamp)
      );
      return;
    }

    this.#status = {
      ...this.#status,
      state: "reconnecting",
      message: null,
      lastMessageAt: requiredString(message.metadata.message_timestamp)
    };
    this.#openSocket(session.reconnect_url, false, connectionGeneration);
  }

  #handleClose(event: { readonly code?: number; readonly reason?: string }, connectionGeneration: number): void {
    if (this.#stopped || this.#connection === null) {
      return;
    }

    if (this.#status.state === "error" && this.#status.message === "Twitch EventSub WebSocket error") {
      this.#recoverableFailureReferenceId = null;
      this.#status = { ...this.#status, state: "reconnecting" };
    } else {
      this.#recordIssue(
        "reconnecting",
        event.reason === undefined || event.reason === "" ? "Twitch EventSub WebSocket closed" : event.reason,
        this.#now().toISOString()
      );
    }
    this.#scheduleReconnect(connectionGeneration);
  }

  #scheduleReconnect(connectionGeneration: number): void {
    const delayMs = this.#backoffMs[Math.min(this.#reconnectAttempt, this.#backoffMs.length - 1)] ?? 1_000;
    this.#reconnectAttempt += 1;
    this.#schedule(() => {
      if (!this.#stopped && connectionGeneration === this.#connectionGeneration) {
        this.#openSocket(this.#baseUrl, true, connectionGeneration);
      }
    }, delayMs);
  }

  #isCurrentConnection(connectionGeneration: number, socket: TwitchEventSubSocket): boolean {
    return connectionGeneration === this.#connectionGeneration && socket === this.#socket;
  }

  #recordFailure(
    message: string,
    occurredAt: string,
    status: Partial<Pick<TwitchEventSubStatus, "lastMessageAt">> = {},
    recoverable = false
  ): void {
    this.#recordIssue("error", message, occurredAt, status, recoverable);
  }

  #recordPersistentFailure(
    message: string,
    occurredAt: string,
    status: Partial<Pick<TwitchEventSubStatus, "lastMessageAt">> = {}
  ): void {
    if (this.#persistentFailure?.message === message) {
      this.#status = {
        ...this.#status,
        ...status,
        state: "error",
        message,
        lastErrorAt: this.#persistentFailure.occurredAt,
        referenceId: this.#persistentFailure.referenceId
      };
      return;
    }
    const referenceId = this.#recordIssue("error", message, occurredAt, status);
    this.#persistentFailure = { message, occurredAt, referenceId };
  }

  #recordIssue(
    state: Extract<TwitchEventSubConnectionState, "error" | "reconnecting">,
    message: string,
    occurredAt: string,
    status: Partial<Pick<TwitchEventSubStatus, "lastMessageAt">> = {},
    recoverable = false
  ): string {
    const referenceId = this.#generateReferenceId();
    this.#status = {
      ...this.#status,
      ...status,
      state,
      lastErrorAt: occurredAt,
      message,
      referenceId
    };
    this.#recoverableFailureReferenceId = recoverable ? referenceId : null;
    void Promise.resolve(this.#onDiagnostic({ message, referenceId })).catch(() => {
      if (this.#status.referenceId === referenceId) {
        this.#status = { ...this.#status, message: "Twitch EventSub diagnostics logging failed" };
      }
    });
    return referenceId;
  }

  #recordHealthyMessage(timestamp: string): void {
    if (
      this.#status.referenceId !== null
      && this.#status.referenceId === this.#recoverableFailureReferenceId
    ) {
      this.#recoverableFailureReferenceId = null;
      if (this.#persistentFailure !== null) {
        this.#restorePersistentFailure(timestamp);
        return;
      }
    } else if (this.#status.referenceId !== null) {
      this.#status = { ...this.#status, lastMessageAt: timestamp };
      return;
    }
    this.#status = {
      ...this.#status,
      ...(this.#status.sessionId === null ? {} : { state: "connected" as const }),
      lastMessageAt: timestamp,
      lastErrorAt: null,
      message: null,
      referenceId: null
    };
    this.#recoverableFailureReferenceId = null;
  }

  #restorePersistentFailure(lastMessageAt: string): void {
    const failure = this.#persistentFailure;
    if (failure === null) return;
    this.#status = {
      ...this.#status,
      state: "error",
      lastMessageAt,
      lastErrorAt: failure.occurredAt,
      message: failure.message,
      referenceId: failure.referenceId
    };
  }
}

function generateReferenceId(): string {
  return `ref_${randomBytes(12).toString("base64url")}`;
}

function describeSubscriptionSetupFailure(error: unknown): string {
  if (error instanceof TwitchEventSubApiError) {
    return `Twitch EventSub subscription setup failed (Twitch API returned HTTP ${error.status})`;
  }
  if (error instanceof TwitchEventSubResponseError) {
    return "Twitch EventSub subscription setup failed (Twitch API returned an invalid response)";
  }
  return "Twitch EventSub subscription setup failed";
}

export function buildTwitchEventSubSubscriptionRequests(input: {
  readonly account: Pick<TwitchAccount, "accountId" | "scopes">;
  readonly sessionId: string;
}): readonly TwitchEventSubSubscriptionRequest[] {
  const scopes = new Set(input.account.scopes);
  return subscriptionDefinitions
    .filter((definition) => definition.requiredScope === null || scopes.has(definition.requiredScope))
    .map((definition) => ({
      type: definition.type,
      version: definition.version,
      condition: definition.condition(input.account.accountId),
      transport: {
        method: "websocket",
        session_id: input.sessionId
      }
    }));
}

const subscriptionDefinitions = [
  {
    type: "channel.follow",
    version: "2",
    requiredScope: "moderator:read:followers",
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId,
      moderator_user_id: accountId
    })
  },
  {
    type: "channel.subscribe",
    version: "1",
    requiredScope: "channel:read:subscriptions",
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId
    })
  },
  {
    type: "channel.subscription.message",
    version: "1",
    requiredScope: "channel:read:subscriptions",
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId
    })
  },
  {
    type: "channel.cheer",
    version: "1",
    requiredScope: "bits:read",
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId
    })
  },
  {
    type: "channel.raid",
    version: "1",
    requiredScope: null,
    condition: (accountId: string) => ({
      to_broadcaster_user_id: accountId
    })
  },
  {
    type: "channel.channel_points_custom_reward_redemption.add",
    version: "1",
    requiredScope: "channel:read:redemptions",
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId
    })
  }
] as const;

function parseMessage(body: unknown): TwitchSessionMessage {
  if (!isRecord(body) || !isRecord(body.metadata) || !isRecord(body.payload)) {
    throw new TwitchEventSubResponseError();
  }

  return {
    metadata: {
      message_id: typeof body.metadata.message_id === "string" ? body.metadata.message_id : undefined,
      message_type: requiredString(body.metadata.message_type),
      message_timestamp: requiredString(body.metadata.message_timestamp),
      subscription_type: typeof body.metadata.subscription_type === "string" ? body.metadata.subscription_type : undefined,
      subscription_version: typeof body.metadata.subscription_version === "string" ? body.metadata.subscription_version : undefined
    },
    payload: {
      session: isRecord(body.payload.session) ? sessionFromRecord(body.payload.session) : undefined,
      subscription: isRecord(body.payload.subscription) ? subscriptionFromRecord(body.payload.subscription) : undefined,
      event: isRecord(body.payload.event) ? body.payload.event : undefined
    }
  };
}

function parseSession(message: TwitchSessionMessage): Exclude<TwitchSessionMessage["payload"]["session"], undefined> {
  if (message.payload.session === undefined) {
    throw new TwitchEventSubResponseError();
  }

  return message.payload.session;
}

function sessionFromRecord(record: Record<string, unknown>): Exclude<TwitchSessionMessage["payload"]["session"], undefined> {
  return {
    id: requiredString(record.id),
    status: requiredString(record.status),
    reconnect_url: typeof record.reconnect_url === "string" || record.reconnect_url === null ? record.reconnect_url : undefined,
    connected_at: requiredString(record.connected_at)
  };
}

function subscriptionFromRecord(
  record: Record<string, unknown>
): NonNullable<TwitchSessionMessage["payload"]["subscription"]> {
  return {
    status: requiredString(record.status),
    type: requiredString(record.type)
  };
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TwitchEventSubResponseError();
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
