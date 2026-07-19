import { createHash, randomUUID } from "node:crypto";
import type { StreamerBotSubscriptionSelection } from "@stream-jams/core";

export type StreamerBotConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "degraded" | "error";

export type StreamerBotProtocol = "ws" | "wss";

export interface StreamerBotConnectionInput {
  readonly protocol?: StreamerBotProtocol | undefined;
  readonly host?: string | undefined;
  readonly port?: number | undefined;
  readonly endpoint?: string | undefined;
  readonly password?: string | null | undefined;
}

export interface StreamerBotEventEnvelope {
  readonly timeStamp: string;
  readonly event: {
    readonly source: string;
    readonly type: string;
  };
  readonly data: Record<string, unknown>;
}

export interface StreamerBotClientStatus {
  readonly state: StreamerBotConnectionState;
  readonly url: string | null;
  readonly message: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly lastErrorAt: string | null;
  readonly instance: Record<string, unknown> | null;
  readonly subscriptionSourceKeys: readonly string[];
  readonly pendingRequestCount: number;
  readonly referenceId: string | null;
}

export interface StreamerBotClientDiagnostic {
  readonly level: "warn" | "error";
  readonly message: string;
  readonly referenceId: string;
}

export interface StreamerBotSocket {
  addEventListener(event: "open", listener: () => void | Promise<void>): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(
    event: "close",
    listener: (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>
  ): void;
  addEventListener(event: "error", listener: (event: unknown) => void | Promise<void>): void;
  send(data: string): void;
  close(): void;
}

export interface StreamerBotClientOptions {
  readonly socketFactory: (url: string) => StreamerBotSocket;
  readonly onEvent: (envelope: StreamerBotEventEnvelope) => void | Promise<void>;
  readonly now?: (() => Date) | undefined;
  readonly schedule?: ((callback: () => void, delayMs: number) => unknown) | undefined;
  readonly cancelScheduled?: ((handle: unknown) => void) | undefined;
  readonly requestIdGenerator?: (() => string) | undefined;
  readonly requestTimeoutMs?: number | undefined;
  readonly backoffMs?: readonly number[] | undefined;
  readonly generateReferenceId?: (() => string) | undefined;
  readonly onDiagnostic?: ((entry: StreamerBotClientDiagnostic) => void | Promise<void>) | undefined;
}

interface PendingRequest {
  readonly request: string;
  readonly timeoutHandle: unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly validate: (response: Record<string, unknown>) => unknown;
}

interface HelloMessage {
  readonly info: Record<string, unknown>;
  readonly authentication: {
    readonly salt: string;
    readonly challenge: string;
  } | null;
}

export class StreamerBotProtocolError extends Error {
  readonly code = "STREAMERBOT_PROTOCOL_ERROR";

  constructor(message = "Streamer.bot protocol request failed") {
    super(message);
    this.name = "StreamerBotProtocolError";
  }
}

export class StreamerBotAuthenticationError extends Error {
  readonly code = "STREAMERBOT_AUTHENTICATION_FAILED";

  constructor(message = "Streamer.bot authentication failed") {
    super(message);
    this.name = "StreamerBotAuthenticationError";
  }
}

export class StreamerBotConnectionError extends Error {
  readonly code = "STREAMERBOT_CONNECTION_FAILED";

  constructor(message = "Streamer.bot connection failed") {
    super(message);
    this.name = "StreamerBotConnectionError";
  }
}

export class StreamerBotClient {
  readonly #socketFactory: (url: string) => StreamerBotSocket;
  readonly #onEvent: (envelope: StreamerBotEventEnvelope) => void | Promise<void>;
  readonly #now: () => Date;
  readonly #schedule: (callback: () => void, delayMs: number) => unknown;
  readonly #cancelScheduled: (handle: unknown) => void;
  readonly #requestIdGenerator: () => string;
  readonly #requestTimeoutMs: number;
  readonly #backoffMs: readonly number[];
  readonly #generateReferenceId: () => string;
  readonly #onDiagnostic: NonNullable<StreamerBotClientOptions["onDiagnostic"]>;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #subscriptions = new Map<string, Set<string>>();
  #connection: StreamerBotConnectionInput = {};
  #reconnectAttempt = 0;
  #socket: StreamerBotSocket | null = null;
  #status: StreamerBotClientStatus = idleStatus();
  #stopped = true;

  constructor(options: StreamerBotClientOptions) {
    this.#socketFactory = options.socketFactory;
    this.#onEvent = options.onEvent;
    this.#now = options.now ?? (() => new Date());
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#cancelScheduled =
      options.cancelScheduled ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.#requestIdGenerator = options.requestIdGenerator ?? (() => randomUUID());
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.#backoffMs = options.backoffMs && options.backoffMs.length > 0 ? options.backoffMs : [1_000, 2_000, 5_000, 10_000];
    this.#generateReferenceId = options.generateReferenceId ?? (() => `ref_${randomUUID()}`);
    this.#onDiagnostic = options.onDiagnostic ?? (() => {});
  }

  connect(input: StreamerBotConnectionInput = {}): void {
    this.#stopped = true;
    const previousSocket = this.#socket;
    this.#socket = null;
    this.#rejectAllPending(new StreamerBotConnectionError("Streamer.bot connection was replaced"));
    previousSocket?.close();
    this.#connection = input;
    this.#stopped = false;
    this.#reconnectAttempt = 0;
    this.#openSocket(false);
  }

  disconnect(): void {
    this.#stopped = true;
    const previousSocket = this.#socket;
    this.#socket = null;
    this.#rejectAllPending(new StreamerBotConnectionError("Streamer.bot connection was closed"));
    previousSocket?.close();
    this.#status = idleStatus();
  }

  getStatus(): StreamerBotClientStatus {
    return this.#status;
  }

  getInfo(): Promise<Record<string, unknown>> {
    return this.#sendRequest("GetInfo", {}, (response) => {
      if (!isRecord(response.info)) {
        throw new StreamerBotProtocolError("Streamer.bot info response was invalid");
      }
      return response.info;
    });
  }

  getEvents(): Promise<Record<string, readonly string[]>> {
    return this.#sendRequest("GetEvents", {}, (response) => parseEventsMap(response.events));
  }

  async subscribe(selections: readonly StreamerBotSubscriptionSelection[]): Promise<void> {
    const events = selectionsToEventsMap(selections);
    await this.#sendRequest("Subscribe", { events }, validateOkResponse);
    this.#addSubscriptions(selections);
    this.#syncSafeStatus();
  }

  async unsubscribe(selections: readonly StreamerBotSubscriptionSelection[]): Promise<void> {
    const events = selectionsToEventsMap(selections);
    await this.#sendRequest("UnSubscribe", { events }, validateOkResponse);
    this.#removeSubscriptions(selections);
    this.#syncSafeStatus();
  }

  #openSocket(restoreSubscriptions: boolean): void {
    const url = buildStreamerBotWebSocketUrl(this.#connection);
    this.#updateStatus({
      state: "connecting",
      url,
      message: null
    });

    const socket = this.#socketFactory(url);
    this.#socket = socket;

    socket.addEventListener("message", async (event) => {
      await this.#handleSocketMessage(socket, event.data, restoreSubscriptions);
    });
    socket.addEventListener("close", () => {
      this.#handleSocketClose(socket);
    });
    socket.addEventListener("error", () => {
      this.#handleSocketError(socket);
    });
  }

  async #handleSocketMessage(socket: StreamerBotSocket, data: unknown, restoreSubscriptions: boolean): Promise<void> {
    if (this.#socket !== socket) {
      return;
    }

    const rawMessage = parseRawMessage(data);
    if (rawMessage === null) {
      this.#setDegraded("Streamer.bot message was invalid JSON");
      return;
    }

    if (!isRecord(rawMessage)) {
      this.#setDegraded("Streamer.bot message was invalid");
      return;
    }

    if (rawMessage.request === "Hello") {
      this.#handleHello(socket, rawMessage, restoreSubscriptions);
      return;
    }

    if (typeof rawMessage.id === "string") {
      this.#handleResponse(rawMessage);
      return;
    }

    if (isEventLike(rawMessage)) {
      await this.#handleEventEnvelope(rawMessage);
      return;
    }

    this.#setDegraded("Streamer.bot message was invalid");
  }

  #handleHello(socket: StreamerBotSocket, rawMessage: Record<string, unknown>, restoreSubscriptions: boolean): void {
    const hello = parseHello(rawMessage);
    if (hello === null) {
      this.#setError("Streamer.bot Hello message was invalid");
      socket.close();
      return;
    }

    this.#updateStatus({
      lastMessageAt: this.#now().toISOString(),
      message: null
    });

    if (hello.authentication === null) {
      this.#markConnected(hello.info, restoreSubscriptions);
      return;
    }

    const password = this.#connection.password;
    if (typeof password !== "string" || password.length === 0) {
      this.#setError("Streamer.bot authentication requires a configured password");
      socket.close();
      return;
    }

    const authentication = createStreamerBotAuthenticationValue(
      password,
      hello.authentication.salt,
      hello.authentication.challenge
    );
    void this.#sendRequest("Authenticate", { authentication }, validateOkResponse, { allowConnecting: true })
      .then(() => {
        if (this.#socket === socket) {
          this.#markConnected(hello.info, restoreSubscriptions);
        }
      })
      .catch(() => {
        if (this.#socket === socket) {
          this.#setError("Streamer.bot authentication failed");
          socket.close();
        }
      });
  }

  #handleResponse(response: Record<string, unknown>): void {
    const id = response.id;
    if (typeof id !== "string") {
      this.#setDegraded("Streamer.bot response was invalid");
      return;
    }

    const pending = this.#pending.get(id);
    if (pending === undefined) {
      this.#setDegraded("Streamer.bot response ID was not pending");
      return;
    }

    if (typeof response.request === "string" && response.request !== pending.request) {
      this.#rejectPending(id, new StreamerBotProtocolError("Streamer.bot response was invalid"));
      this.#setError("Streamer.bot response was invalid");
      return;
    }

    if (response.status !== "ok" && response.status !== "error") {
      this.#rejectPending(id, new StreamerBotProtocolError("Streamer.bot response was invalid"));
      this.#setError("Streamer.bot response was invalid");
      return;
    }

    if (response.status === "error") {
      this.#rejectPending(id, new StreamerBotProtocolError("Streamer.bot request failed"));
      this.#setError("Streamer.bot request failed");
      return;
    }

    try {
      const value = pending.validate(response);
      this.#resolvePending(id, value);
      this.#updateStatus({
        lastMessageAt: this.#now().toISOString(),
        message: null
      });
    } catch (error) {
      this.#rejectPending(id, error instanceof Error ? error : new StreamerBotProtocolError());
      this.#setError("Streamer.bot response was invalid");
    }
  }

  async #handleEventEnvelope(message: Record<string, unknown>): Promise<void> {
    const envelope = parseEventEnvelope(message);
    if (envelope === null) {
      this.#setDegraded("Streamer.bot event envelope was invalid");
      return;
    }

    try {
      await this.#onEvent(envelope);
      this.#updateStatus({
        lastMessageAt: envelope.timeStamp,
        message: null
      });
    } catch {
      this.#setError("Streamer.bot event callback failed");
    }
  }

  #handleSocketClose(socket: StreamerBotSocket): void {
    if (this.#socket !== socket) {
      return;
    }

    this.#socket = null;
    this.#rejectAllPending(new StreamerBotConnectionError("Streamer.bot connection closed"));

    if (this.#stopped) {
      this.#status = idleStatus();
      return;
    }

    const delayMs = this.#nextBackoffDelay();
    if (this.#status.state === "error" && this.#status.message === "Streamer.bot WebSocket error") {
      this.#updateStatus({ state: "reconnecting" });
    } else {
      this.#recordIssue("reconnecting", "Streamer.bot connection closed", "error");
    }
    this.#schedule(() => {
      if (!this.#stopped && this.#socket === null) {
        this.#openSocket(true);
      }
    }, delayMs);
  }

  #handleSocketError(socket: StreamerBotSocket): void {
    if (this.#socket !== socket) {
      return;
    }

    this.#rejectAllPending(new StreamerBotConnectionError("Streamer.bot WebSocket error"));
    this.#setError("Streamer.bot WebSocket error");
  }

  #markConnected(instance: Record<string, unknown>, restoreSubscriptions: boolean): void {
    this.#reconnectAttempt = 0;
    const now = this.#now().toISOString();
    this.#updateStatus({
      state: "connected",
      connectedAt: now,
      lastMessageAt: now,
      instance,
      message: null,
      lastErrorAt: null,
      referenceId: null
    });

    if (restoreSubscriptions && this.#subscriptions.size > 0) {
      void this.#resubscribeStoredSelections();
    }
  }

  async #resubscribeStoredSelections(): Promise<void> {
    const selections = this.#storedSubscriptionSelections();
    try {
      await this.#sendRequest("Subscribe", { events: selectionsToEventsMap(selections) }, validateOkResponse);
    } catch {
      this.#setError("Streamer.bot resubscribe request failed");
    }
  }

  #sendRequest<T>(
    request: string,
    payload: Record<string, unknown>,
    validate: (response: Record<string, unknown>) => T,
    options: { readonly allowConnecting?: boolean | undefined } = {}
  ): Promise<T> {
    const socket = this.#socket;
    const canSend =
      socket !== null && (this.#status.state === "connected" || (options.allowConnecting === true && this.#status.state === "connecting"));
    if (!canSend) {
      return Promise.reject(new StreamerBotConnectionError("Streamer.bot is not connected"));
    }

    const id = this.#requestIdGenerator();
    const requestEnvelope = {
      request,
      id,
      ...payload
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = this.#schedule(() => {
        this.#rejectPending(id, new StreamerBotProtocolError("Streamer.bot request timed out"));
        this.#setError("Streamer.bot request timed out");
      }, this.#requestTimeoutMs);
      const pending: PendingRequest = {
        request,
        timeoutHandle,
        resolve(value) {
          resolve(value as T);
        },
        reject,
        validate
      };
      this.#pending.set(id, pending);
      this.#syncSafeStatus();

      try {
        socket.send(JSON.stringify(requestEnvelope));
      } catch {
        this.#rejectPending(id, new StreamerBotConnectionError("Streamer.bot request send failed"));
        this.#setError("Streamer.bot request send failed");
      }
    });
  }

  #resolvePending(id: string, value: unknown): void {
    const pending = this.#pending.get(id);
    if (pending === undefined) {
      return;
    }

    this.#pending.delete(id);
    this.#cancelScheduled(pending.timeoutHandle);
    pending.resolve(value);
    this.#syncSafeStatus();
  }

  #rejectPending(id: string, error: Error): void {
    const pending = this.#pending.get(id);
    if (pending === undefined) {
      return;
    }

    this.#pending.delete(id);
    this.#cancelScheduled(pending.timeoutHandle);
    pending.reject(error);
    this.#syncSafeStatus();
  }

  #rejectAllPending(error: Error): void {
    for (const id of Array.from(this.#pending.keys())) {
      this.#rejectPending(id, error);
    }
  }

  #addSubscriptions(selections: readonly StreamerBotSubscriptionSelection[]): void {
    for (const selection of selections) {
      const sourceSubscriptions = this.#subscriptions.get(selection.sourceKey) ?? new Set<string>();
      for (const eventType of selection.eventTypes) {
        sourceSubscriptions.add(eventType);
      }
      this.#subscriptions.set(selection.sourceKey, sourceSubscriptions);
    }
  }

  #removeSubscriptions(selections: readonly StreamerBotSubscriptionSelection[]): void {
    for (const selection of selections) {
      const sourceSubscriptions = this.#subscriptions.get(selection.sourceKey);
      if (sourceSubscriptions === undefined) {
        continue;
      }
      for (const eventType of selection.eventTypes) {
        sourceSubscriptions.delete(eventType);
      }
      if (sourceSubscriptions.size === 0) {
        this.#subscriptions.delete(selection.sourceKey);
      }
    }
  }

  #storedSubscriptionSelections(): StreamerBotSubscriptionSelection[] {
    return Array.from(this.#subscriptions, ([sourceKey, eventTypes]) => ({
      sourceKey,
      eventTypes: Array.from(eventTypes)
    }));
  }

  #nextBackoffDelay(): number {
    const delayMs = this.#backoffMs[Math.min(this.#reconnectAttempt, this.#backoffMs.length - 1)] ?? 1_000;
    this.#reconnectAttempt += 1;
    return delayMs;
  }

  #setDegraded(message: string): void {
    this.#recordIssue("degraded", message, "warn");
  }

  #setError(message: string): void {
    this.#recordIssue("error", message, "error");
  }

  #recordIssue(
    state: Extract<StreamerBotConnectionState, "reconnecting" | "degraded" | "error">,
    message: string,
    level: StreamerBotClientDiagnostic["level"]
  ): void {
    const referenceId = this.#generateReferenceId();
    this.#updateStatus({
      state,
      message,
      lastErrorAt: this.#now().toISOString(),
      referenceId
    });
    void Promise.resolve(this.#onDiagnostic({ level, message, referenceId })).catch(() => {
      if (this.#status.referenceId === referenceId) {
        this.#updateStatus({ message: "Streamer.bot diagnostics logging failed" });
      }
    });
  }

  #syncSafeStatus(): void {
    this.#status = withSafeRuntimeFields(this.#status, this.#pending.size, this.#storedSubscriptionSelections());
  }

  #updateStatus(update: Partial<Omit<StreamerBotClientStatus, "pendingRequestCount" | "subscriptionSourceKeys">>): void {
    this.#status = withSafeRuntimeFields(
      {
        ...this.#status,
        ...update
      },
      this.#pending.size,
      this.#storedSubscriptionSelections()
    );
  }
}

export function buildStreamerBotWebSocketUrl(input: StreamerBotConnectionInput = {}): string {
  const protocol = input.protocol ?? "ws";
  const host = input.host ?? "127.0.0.1";
  const port = input.port ?? 8080;
  const endpoint = normalizeEndpoint(input.endpoint);
  const url = new URL(protocol + "://" + host);
  url.port = String(port);
  url.pathname = endpoint;
  return url.toString();
}

function idleStatus(): StreamerBotClientStatus {
  return {
    state: "idle",
    url: null,
    message: null,
    connectedAt: null,
    lastMessageAt: null,
    lastErrorAt: null,
    instance: null,
    subscriptionSourceKeys: [],
    pendingRequestCount: 0,
    referenceId: null
  };
}

function withSafeRuntimeFields(
  status: Omit<StreamerBotClientStatus, "pendingRequestCount" | "subscriptionSourceKeys">,
  pendingRequestCount: number,
  selections: readonly StreamerBotSubscriptionSelection[]
): StreamerBotClientStatus {
  return {
    ...status,
    subscriptionSourceKeys: selections.map((selection) => selection.sourceKey),
    pendingRequestCount
  };
}

function normalizeEndpoint(endpoint: string | undefined): string {
  if (endpoint === undefined || endpoint.trim().length === 0) {
    return "/";
  }

  const normalized = endpoint.replace(/^\/+/, "");
  return normalized.length === 0 ? "/" : "/" + normalized;
}

function parseRawMessage(data: unknown): unknown | null {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

function parseHello(rawMessage: Record<string, unknown>): HelloMessage | null {
  if (!isRecord(rawMessage.info)) {
    return null;
  }

  if (rawMessage.authentication === undefined || rawMessage.authentication === null) {
    return {
      info: rawMessage.info,
      authentication: null
    };
  }

  if (!isRecord(rawMessage.authentication)) {
    return null;
  }

  const salt = rawMessage.authentication.salt;
  const challenge = rawMessage.authentication.challenge;
  if (typeof salt !== "string" || salt.length === 0 || typeof challenge !== "string" || challenge.length === 0) {
    return null;
  }

  return {
    info: rawMessage.info,
    authentication: {
      salt,
      challenge
    }
  };
}

function createStreamerBotAuthenticationValue(password: string, salt: string, challenge: string): string {
  const secret = sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

function sha256Base64(value: string): string {
  // Streamer.bot mandates this SHA-256/base64 challenge response; this is not password storage.
  // See docs/security/codeql-suppressions.md for the protocol reference and suppression rationale.
  // codeql[js/insufficient-password-hash]
  return createHash("sha256").update(value, "utf8").digest("base64");
}

function validateOkResponse(): void {
  return undefined;
}

function parseEventsMap(value: unknown): Record<string, readonly string[]> {
  if (!isRecord(value)) {
    throw new StreamerBotProtocolError("Streamer.bot events response was invalid");
  }

  const events: Record<string, readonly string[]> = {};
  for (const [sourceKey, eventTypes] of Object.entries(value)) {
    if (!Array.isArray(eventTypes) || !eventTypes.every((eventType) => typeof eventType === "string" && eventType.length > 0)) {
      throw new StreamerBotProtocolError("Streamer.bot events response was invalid");
    }
    events[sourceKey] = [...eventTypes];
  }
  return events;
}

function selectionsToEventsMap(selections: readonly StreamerBotSubscriptionSelection[]): Record<string, readonly string[]> {
  const events: Record<string, string[]> = {};
  for (const selection of selections) {
    if (selection.sourceKey.length === 0 || selection.eventTypes.length === 0) {
      throw new StreamerBotProtocolError("Streamer.bot subscription selection was invalid");
    }
    const eventTypes = events[selection.sourceKey] ?? [];
    for (const eventType of selection.eventTypes) {
      if (eventType.length === 0) {
        throw new StreamerBotProtocolError("Streamer.bot subscription selection was invalid");
      }
      eventTypes.push(eventType);
    }
    events[selection.sourceKey] = eventTypes;
  }
  return events;
}

function isEventLike(message: Record<string, unknown>): boolean {
  return "timeStamp" in message || "event" in message || "data" in message;
}

function parseEventEnvelope(message: Record<string, unknown>): StreamerBotEventEnvelope | null {
  if (typeof message.timeStamp !== "string" || !isRecord(message.event) || !isRecord(message.data)) {
    return null;
  }

  if (typeof message.event.source !== "string" || message.event.source.length === 0) {
    return null;
  }

  if (typeof message.event.type !== "string" || message.event.type.length === 0) {
    return null;
  }

  return {
    timeStamp: message.timeStamp,
    event: {
      source: message.event.source,
      type: message.event.type
    },
    data: message.data
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
