import type { TwitchAccount } from "./twitch-account-repository.js";

export type TwitchEventSubConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface TwitchEventSubStatus {
  readonly state: TwitchEventSubConnectionState;
  readonly sessionId: string | null;
  readonly message: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly subscriptionTypes: readonly string[];
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
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void): void;
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
  #connection: TwitchEventSubConnectionInput | null = null;
  #reconnectAttempt = 0;
  #socket: TwitchEventSubSocket | null = null;
  #status: TwitchEventSubStatus = {
    state: "idle",
    sessionId: null,
    message: null,
    connectedAt: null,
    lastMessageAt: null,
    subscriptionTypes: []
  };
  #stopped = true;

  constructor(options: TwitchEventSubClientOptions) {
    this.#apiClient = options.apiClient;
    this.#socketFactory = options.socketFactory;
    this.#onNotification = options.onNotification;
    this.#baseUrl = options.baseUrl ?? "wss://eventsub.wss.twitch.tv/ws";
    this.#now = options.now ?? (() => new Date());
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#backoffMs = options.backoffMs ?? [1_000, 2_000, 5_000, 10_000];
  }

  connect(input: TwitchEventSubConnectionInput): void {
    this.#connection = input;
    this.#stopped = false;
    this.#reconnectAttempt = 0;
    this.#openSocket(this.#baseUrl, true);
  }

  disconnect(): void {
    this.#stopped = true;
    this.#socket?.close();
    this.#socket = null;
    this.#status = {
      state: "idle",
      sessionId: null,
      message: null,
      connectedAt: null,
      lastMessageAt: null,
      subscriptionTypes: []
    };
  }

  getStatus(): TwitchEventSubStatus {
    return this.#status;
  }

  #openSocket(url: string, recreateSubscriptions: boolean): void {
    this.#status = {
      ...this.#status,
      state: "connecting",
      message: null
    };
    const socket = this.#socketFactory(url);
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      void this.#handleMessage(event.data, recreateSubscriptions).catch(() => {
        this.#status = {
          ...this.#status,
          state: "error",
          message: "Twitch EventSub message handling failed"
        };
      });
    });
    socket.addEventListener("close", (event) => {
      this.#handleClose(event);
    });
    socket.addEventListener("error", () => {
      this.#status = {
        ...this.#status,
        state: "error",
        message: "Twitch EventSub WebSocket error"
      };
    });
  }

  async #handleMessage(data: unknown, recreateSubscriptions: boolean): Promise<void> {
    const rawMessage = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
    const message = parseMessage(rawMessage);
    const timestamp = requiredString(message.metadata.message_timestamp);
    switch (message.metadata.message_type) {
      case "session_welcome":
        await this.#handleWelcome(message, recreateSubscriptions);
        return;
      case "session_keepalive":
        this.#status = {
          ...this.#status,
          lastMessageAt: timestamp,
          message: null
        };
        return;
      case "session_reconnect":
        this.#handleReconnect(message);
        return;
      case "notification":
        this.#status = {
          ...this.#status,
          lastMessageAt: timestamp,
          message: null
        };
        await this.#onNotification(rawMessage);
        return;
      case "revocation":
        this.#status = {
          ...this.#status,
          state: "error",
          lastMessageAt: timestamp,
          message: "Twitch EventSub subscription was revoked: " + String(message.payload.subscription?.status ?? "unknown")
        };
        return;
      default:
        this.#status = {
          ...this.#status,
          state: "error",
          lastMessageAt: timestamp,
          message: "Unsupported Twitch EventSub message type"
        };
    }
  }

  async #handleWelcome(message: TwitchSessionMessage, recreateSubscriptions: boolean): Promise<void> {
    const session = parseSession(message);
    const connection = this.#connection;
    const subscriptionRequests =
      connection === null || !recreateSubscriptions
        ? []
        : buildTwitchEventSubSubscriptionRequests({
            account: connection.account,
            sessionId: session.id
          });
    this.#status = {
      state: "connected",
      sessionId: session.id,
      message: null,
      connectedAt: session.connected_at,
      lastMessageAt: requiredString(message.metadata.message_timestamp),
      subscriptionTypes: recreateSubscriptions ? subscriptionRequests.map((request) => request.type) : this.#status.subscriptionTypes
    };
    this.#reconnectAttempt = 0;

    if (connection !== null && recreateSubscriptions) {
      for (const subscription of subscriptionRequests) {
        await this.#apiClient.createSubscription({
          accessToken: connection.accessToken,
          clientId: connection.clientId,
          subscription
        });
      }
    }
  }

  #handleReconnect(message: TwitchSessionMessage): void {
    const session = parseSession(message);
    if (typeof session.reconnect_url !== "string" || session.reconnect_url.trim() === "") {
      this.#status = {
        ...this.#status,
        state: "error",
        message: "Twitch EventSub reconnect URL was missing"
      };
      return;
    }

    this.#status = {
      ...this.#status,
      state: "reconnecting",
      message: null,
      lastMessageAt: requiredString(message.metadata.message_timestamp)
    };
    this.#openSocket(session.reconnect_url, false);
  }

  #handleClose(event: { readonly code?: number; readonly reason?: string }): void {
    if (this.#stopped || this.#connection === null) {
      return;
    }

    const delayMs = this.#backoffMs[Math.min(this.#reconnectAttempt, this.#backoffMs.length - 1)] ?? 1_000;
    this.#reconnectAttempt += 1;
    this.#status = {
      ...this.#status,
      state: "reconnecting",
      message: event.reason === undefined || event.reason === "" ? "Twitch EventSub WebSocket closed" : event.reason,
      lastMessageAt: this.#now().toISOString()
    };
    this.#schedule(() => {
      if (!this.#stopped) {
        this.#openSocket(this.#baseUrl, true);
      }
    }, delayMs);
  }
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
