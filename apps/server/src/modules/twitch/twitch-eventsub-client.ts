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
  readonly goalSubscriptionFailure?: "temporary" | "reauthorization-required" | null;
}

export interface TwitchEventSubDiagnostic {
  readonly message: string;
  readonly referenceId: string;
  readonly exception?: unknown;
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
  readonly onStatusChanged?: ((status: TwitchEventSubStatus) => void | Promise<void>) | undefined;
  readonly baseUrl?: string | undefined;
  readonly now?: (() => Date) | undefined;
  readonly schedule?: ((callback: () => void, delayMs: number) => unknown) | undefined;
  readonly backoffMs?: readonly number[] | undefined;
  readonly generateReferenceId?: (() => string) | undefined;
  readonly onDiagnostic?: ((entry: TwitchEventSubDiagnostic) => void | Promise<void>) | undefined;
  readonly onAuthorizationFailure?: (() => void | Promise<void>) | undefined;
  readonly scheduleWatchdog?: ((callback: () => void, delayMs: number) => unknown) | undefined;
  readonly cancelWatchdog?: ((handle: unknown) => void) | undefined;
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
      readonly keepalive_timeout_seconds: number | null | undefined;
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
  readonly #onStatusChanged: NonNullable<TwitchEventSubClientOptions["onStatusChanged"]>;
  readonly #baseUrl: string;
  readonly #now: () => Date;
  readonly #schedule: (callback: () => void, delayMs: number) => unknown;
  readonly #backoffMs: readonly number[];
  readonly #generateReferenceId: () => string;
  readonly #onDiagnostic: NonNullable<TwitchEventSubClientOptions["onDiagnostic"]>;
  readonly #onAuthorizationFailure: NonNullable<TwitchEventSubClientOptions["onAuthorizationFailure"]>;
  readonly #scheduleWatchdog: NonNullable<TwitchEventSubClientOptions["scheduleWatchdog"]>;
  readonly #cancelWatchdog: NonNullable<TwitchEventSubClientOptions["cancelWatchdog"]>;
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
  #watchdogHandle: unknown | null = null;
  #watchdogDelayMs: number | null = null;
  #goalRetryEpoch = 0;
  #goalRetryAttempt = 0;
  #failedGoalSubscriptions: TwitchEventSubSubscriptionRequest[] = [];

  constructor(options: TwitchEventSubClientOptions) {
    this.#apiClient = options.apiClient;
    this.#socketFactory = options.socketFactory;
    this.#onNotification = options.onNotification;
    this.#onStatusChanged = options.onStatusChanged ?? (() => {});
    this.#baseUrl = options.baseUrl ?? "wss://eventsub.wss.twitch.tv/ws";
    this.#now = options.now ?? (() => new Date());
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#backoffMs = options.backoffMs ?? [1_000, 2_000, 5_000, 10_000];
    this.#generateReferenceId = options.generateReferenceId ?? generateReferenceId;
    this.#onDiagnostic = options.onDiagnostic ?? (() => {});
    this.#onAuthorizationFailure = options.onAuthorizationFailure ?? (() => {});
    this.#scheduleWatchdog = options.scheduleWatchdog ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#cancelWatchdog = options.cancelWatchdog ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  connect(input: TwitchEventSubConnectionInput): void {
    const connectionGeneration = ++this.#connectionGeneration;
    this.#stopped = true;
    this.#clearWatchdog();
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
    this.#clearWatchdog();
    this.#socket?.close();
    this.#socket = null;
    this.#setStatus({
      state: "idle",
      sessionId: null,
      message: null,
      connectedAt: null,
      lastMessageAt: null,
      lastErrorAt: null,
      subscriptionTypes: [],
      goalSubscriptionFailure: null,
      referenceId: null
    });
    this.#recoverableFailureReferenceId = null;
    this.#persistentFailure = null;
    this.#messageQueue = Promise.resolve();
  }

  getStatus(): TwitchEventSubStatus {
    return this.#status;
  }

  #openSocket(url: string, recreateSubscriptions: boolean, connectionGeneration: number): void {
    this.#goalRetryEpoch += 1;
    this.#clearWatchdog();
    this.#setStatus({
      ...this.#status,
      state: "connecting",
      message: null
    });
    const socket = this.#socketFactory(url);
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const handling = this.#messageQueue.then(async () => {
        if (this.#isCurrentConnection(connectionGeneration, socket)) {
          await this.#handleMessage(event.data, recreateSubscriptions, connectionGeneration, socket);
        }
      }).catch((error: unknown) => {
        if (this.#isCurrentConnection(connectionGeneration, socket)) {
          this.#recordFailure("Twitch EventSub message handling failed", this.#now().toISOString(), {}, true, error);
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
    socket.addEventListener("error", (error) => {
      if (this.#isCurrentConnection(connectionGeneration, socket)) {
        this.#recordFailure("Twitch EventSub WebSocket error", this.#now().toISOString(), {}, true, error);
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
    if (message.metadata.message_type !== "session_welcome") {
      this.#resetWatchdog(connectionGeneration, socket);
    }
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
        if (message.payload.subscription?.type.startsWith("channel.goal.")) {
          this.#goalRetryEpoch += 1;
          this.#setStatus({ ...this.#status, lastMessageAt: timestamp,
            goalSubscriptionFailure: "reauthorization-required",
            subscriptionTypes: this.#status.subscriptionTypes.filter((type) => type !== message.payload.subscription?.type) });
          return;
        }
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
    this.#goalRetryEpoch += 1;
    if (recreateSubscriptions) {
      this.#failedGoalSubscriptions = [];
      this.#goalRetryAttempt = 0;
    }
    this.#setStatus({
      state: recreateSubscriptions ? (pendingFailure === null ? "connecting" : "error") : "connected",
      sessionId: session.id,
      message: pendingFailure?.message ?? null,
      connectedAt: session.connected_at,
      lastMessageAt: occurredAt,
      lastErrorAt: pendingFailure?.occurredAt ?? null,
      subscriptionTypes: recreateSubscriptions ? [] : this.#status.subscriptionTypes,
      goalSubscriptionFailure: recreateSubscriptions ? null : this.#status.goalSubscriptionFailure ?? null,
      referenceId: pendingFailure?.referenceId ?? null
    });
    const activeSubscriptionTypes: string[] = [];
    if (connection !== null && recreateSubscriptions) {
      try {
        for (const subscription of subscriptionRequests) {
          try {
            const created = await this.#apiClient.createSubscription({
              accessToken: connection.accessToken, clientId: connection.clientId, subscription
            });
            if (created.status !== "enabled" || created.type !== subscription.type) throw new TwitchEventSubResponseError();
            activeSubscriptionTypes.push(subscription.type);
          } catch (error) {
            if (!this.#isCurrentConnection(connectionGeneration, socket)) return;
            if (!subscription.type.startsWith("channel.goal.")) throw error;
            this.#failedGoalSubscriptions.push(subscription);
            this.#recordGoalSubscriptionFailure(error);
          }
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
          { lastMessageAt: occurredAt },
          error
        );
        if (error instanceof TwitchEventSubApiError && error.status === 401) {
          this.#detachSocket(socket);
          try {
            await this.#onAuthorizationFailure();
          }
          // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
          catch {
            // The persistent failure already provides the actionable diagnostic reference.
          }
          return;
        }
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
      this.#setStatus({
        ...this.#status,
        state: "connected",
        message: null,
        lastErrorAt: null,
        subscriptionTypes: activeSubscriptionTypes,
        referenceId: null
      });
    } else if (this.#persistentFailure !== null) {
      this.#restorePersistentFailure(occurredAt);
    }
    this.#startWatchdog(session.keepalive_timeout_seconds, connectionGeneration, socket);
    // A transferred session keeps enabled subscriptions; retry missing goals on its new session ID.
    this.#failedGoalSubscriptions = this.#failedGoalSubscriptions.map((subscription) => ({
      ...subscription, transport: { method: "websocket", session_id: session.id }
    }));
    this.#scheduleGoalRetry(connectionGeneration, socket);
  }

  #recordGoalSubscriptionFailure(error: unknown): void {
    const requiresAuthorization = error instanceof TwitchEventSubApiError && (error.status === 401 || error.status === 403);
    this.#setStatus({ ...this.#status, goalSubscriptionFailure:
      requiresAuthorization || this.#status.goalSubscriptionFailure === "reauthorization-required"
        ? "reauthorization-required" : "temporary" });
    void Promise.resolve().then(() => this.#onDiagnostic({ message: "Optional Twitch goal subscription setup failed", referenceId: this.#generateReferenceId(), exception: error })).catch(
      // error-provenance: allow expected -- diagnostics are best effort and cannot disable alert intake
      () => {}
    );
  }

  #scheduleGoalRetry(connectionGeneration: number, socket: TwitchEventSubSocket): void {
    if (this.#failedGoalSubscriptions.length === 0 || this.#status.goalSubscriptionFailure === "reauthorization-required") return;
    const epoch = this.#goalRetryEpoch;
    const delayMs = this.#backoffMs[Math.min(this.#goalRetryAttempt++, this.#backoffMs.length - 1)] ?? 1_000;
    this.#schedule(() => {
      if (epoch === this.#goalRetryEpoch && this.#isCurrentConnection(connectionGeneration, socket)) {
        void this.#retryGoalSubscriptions(connectionGeneration, socket, epoch);
      }
    }, delayMs);
  }

  async #retryGoalSubscriptions(connectionGeneration: number, socket: TwitchEventSubSocket, epoch: number): Promise<void> {
    const connection = this.#connection;
    if (connection === null) return;
    for (const subscription of [...this.#failedGoalSubscriptions]) {
      try {
        const created = await this.#apiClient.createSubscription({ accessToken: connection.accessToken, clientId: connection.clientId, subscription });
        if (created.status !== "enabled" || created.type !== subscription.type) throw new TwitchEventSubResponseError();
        if (epoch !== this.#goalRetryEpoch || !this.#isCurrentConnection(connectionGeneration, socket)) return;
        this.#failedGoalSubscriptions = this.#failedGoalSubscriptions.filter((pending) => pending.type !== subscription.type);
        this.#setStatus({ ...this.#status, subscriptionTypes: [...this.#status.subscriptionTypes, subscription.type],
          goalSubscriptionFailure: this.#failedGoalSubscriptions.length === 0 ? null : this.#status.goalSubscriptionFailure ?? null });
      } catch (error) {
        if (epoch !== this.#goalRetryEpoch || !this.#isCurrentConnection(connectionGeneration, socket)) return;
        this.#recordGoalSubscriptionFailure(error);
        if (this.#status.goalSubscriptionFailure === "reauthorization-required") return;
      }
    }
    this.#scheduleGoalRetry(connectionGeneration, socket);
  }

  #setStatus(status: TwitchEventSubStatus): void {
    this.#status = status;
    // Notify each boundary immediately, but never await a source snapshot in intake.
    try {
      void Promise.resolve(this.#onStatusChanged(status)).catch(
        // error-provenance: allow expected -- source observers cannot interrupt EventSub intake
        () => {}
      );
    }
    // error-provenance: allow expected -- a synchronous source observer cannot interrupt EventSub intake
    catch {
      // The observer cannot change the owned EventSub status.
    }
  }

  #retrySubscriptionSetup(connectionGeneration: number, socket: TwitchEventSubSocket): void {
    if (!this.#isCurrentConnection(connectionGeneration, socket)) {
      return;
    }
    this.#detachSocket(socket);
    this.#scheduleReconnect(connectionGeneration);
  }

  #detachSocket(socket: TwitchEventSubSocket): void {
    this.#clearWatchdog();
    if (this.#socket === socket) {
      this.#socket = null;
    }
    socket.close();
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

    this.#setStatus({
      ...this.#status,
      state: "reconnecting",
      message: null,
      lastMessageAt: requiredString(message.metadata.message_timestamp)
    });
    this.#openSocket(session.reconnect_url, false, connectionGeneration);
  }

  #handleClose(event: { readonly code?: number; readonly reason?: string }, connectionGeneration: number): void {
    this.#goalRetryEpoch += 1;
    if (this.#stopped || this.#connection === null) {
      return;
    }
    this.#clearWatchdog();

    if (this.#status.state === "error" && this.#status.message === "Twitch EventSub WebSocket error") {
      this.#recoverableFailureReferenceId = null;
      this.#setStatus({ ...this.#status, state: "reconnecting" });
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

  #startWatchdog(
    keepaliveTimeoutSeconds: number | null | undefined,
    connectionGeneration: number,
    socket: TwitchEventSubSocket
  ): void {
    this.#watchdogDelayMs = typeof keepaliveTimeoutSeconds === "number"
      ? keepaliveTimeoutSeconds * 1_000 + 1_000
      : null;
    this.#resetWatchdog(connectionGeneration, socket);
  }

  #resetWatchdog(connectionGeneration: number, socket: TwitchEventSubSocket): void {
    this.#clearWatchdog(false);
    if (this.#watchdogDelayMs === null) {
      return;
    }
    this.#watchdogHandle = this.#scheduleWatchdog(() => {
      this.#watchdogHandle = null;
      if (!this.#isCurrentConnection(connectionGeneration, socket)) {
        return;
      }
      this.#recordIssue(
        "reconnecting",
        "Twitch EventSub keepalive timed out",
        this.#now().toISOString()
      );
      this.#detachSocket(socket);
      this.#scheduleReconnect(connectionGeneration);
    }, this.#watchdogDelayMs);
  }

  #clearWatchdog(clearDelay = true): void {
    if (this.#watchdogHandle !== null) {
      this.#cancelWatchdog(this.#watchdogHandle);
      this.#watchdogHandle = null;
    }
    if (clearDelay) {
      this.#watchdogDelayMs = null;
    }
  }

  #isCurrentConnection(connectionGeneration: number, socket: TwitchEventSubSocket): boolean {
    return connectionGeneration === this.#connectionGeneration && socket === this.#socket;
  }

  #recordFailure(
    message: string,
    occurredAt: string,
    status: Partial<Pick<TwitchEventSubStatus, "lastMessageAt">> = {},
    recoverable = false,
    exception?: unknown
  ): void {
    this.#recordIssue("error", message, occurredAt, status, recoverable, exception);
  }

  #recordPersistentFailure(
    message: string,
    occurredAt: string,
    status: Partial<Pick<TwitchEventSubStatus, "lastMessageAt">> = {},
    exception?: unknown
  ): void {
    if (this.#persistentFailure?.message === message) {
      this.#setStatus({
        ...this.#status,
        ...status,
        state: "error",
        message,
        lastErrorAt: this.#persistentFailure.occurredAt,
        referenceId: this.#persistentFailure.referenceId
      });
      return;
    }
    const referenceId = this.#recordIssue("error", message, occurredAt, status, false, exception);
    this.#persistentFailure = { message, occurredAt, referenceId };
  }

  #recordIssue(
    state: Extract<TwitchEventSubConnectionState, "error" | "reconnecting">,
    message: string,
    occurredAt: string,
    status: Partial<Pick<TwitchEventSubStatus, "lastMessageAt">> = {},
    recoverable = false,
    exception?: unknown
  ): string {
    const referenceId = this.#generateReferenceId();
    this.#setStatus({
      ...this.#status,
      ...status,
      state,
      lastErrorAt: occurredAt,
      message,
      referenceId
    });
    this.#recoverableFailureReferenceId = recoverable ? referenceId : null;
    void Promise.resolve(this.#onDiagnostic({
      message,
      referenceId,
      ...(exception === undefined ? {} : { exception })
    })).catch(
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    () => {
      if (this.#status.referenceId === referenceId) {
        this.#setStatus({ ...this.#status, message: "Twitch EventSub diagnostics logging failed" });
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
      this.#setStatus({ ...this.#status, lastMessageAt: timestamp });
      return;
    }
    this.#setStatus({
      ...this.#status,
      ...(this.#status.sessionId === null ? {} : { state: "connected" as const }),
      lastMessageAt: timestamp,
      lastErrorAt: null,
      message: null,
      referenceId: null
    });
    this.#recoverableFailureReferenceId = null;
  }

  #restorePersistentFailure(lastMessageAt: string): void {
    const failure = this.#persistentFailure;
    if (failure === null) return;
    this.#setStatus({
      ...this.#status,
      state: "error",
      lastMessageAt,
      lastErrorAt: failure.occurredAt,
      message: failure.message,
      referenceId: failure.referenceId
    });
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
  },
  {
    type: "channel.subscription.gift",
    version: "1",
    requiredScope: "channel:read:subscriptions",
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId
    })
  },
  ...(["begin", "progress", "end"] as const).map((phase) => ({
    type: `channel.hype_train.${phase}`,
    version: "2",
    requiredScope: "channel:read:hype_train",
    condition: (accountId: string) => ({ broadcaster_user_id: accountId })
  })),
  ...(["begin", "progress", "end"] as const).map((phase) => ({
    type: `channel.poll.${phase}`,
    version: "1",
    requiredScope: "channel:read:polls",
    condition: (accountId: string) => ({ broadcaster_user_id: accountId })
  })),
  ...(["begin", "progress", "lock", "end"] as const).map((phase) => ({
    type: `channel.prediction.${phase}`,
    version: "1",
    requiredScope: "channel:read:predictions",
    condition: (accountId: string) => ({ broadcaster_user_id: accountId })
  })),
  ...(["begin", "progress", "end"] as const).map((phase) => ({
    type: `channel.goal.${phase}`,
    version: "1", requiredScope: "channel:read:goals",
    condition: (accountId: string) => ({ broadcaster_user_id: accountId })
  })),
  {
    type: "stream.online",
    version: "1",
    requiredScope: null,
    condition: (accountId: string) => ({
      broadcaster_user_id: accountId
    })
  },
  {
    type: "stream.offline",
    version: "1",
    requiredScope: null,
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
    connected_at: requiredString(record.connected_at),
    keepalive_timeout_seconds:
      typeof record.keepalive_timeout_seconds === "number" || record.keepalive_timeout_seconds === null
        ? record.keepalive_timeout_seconds
        : undefined
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
