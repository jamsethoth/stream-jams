import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  StreamerBotProtocolError,
  type StreamerBotEventEnvelope,
  type StreamerBotSocket,
  StreamerBotClient
} from "./streamerbot-client.js";

describe("StreamerBotClient", () => {
  it("builds default and custom WebSocket URLs while reporting idle and connecting status", () => {
    const harness = createClientHarness();

    expect(harness.client.getStatus()).toEqual({
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
    });

    harness.client.connect();

    expect(harness.openedUrls).toEqual(["ws://127.0.0.1:8080/"]);
    expect(harness.client.getStatus()).toMatchObject({
      state: "connecting",
      url: "ws://127.0.0.1:8080/"
    });

    const customHarness = createClientHarness();
    customHarness.client.connect({
      protocol: "wss",
      host: "streamerbot.local",
      port: 8090,
      endpoint: "/ws"
    });

    expect(customHarness.openedUrls).toEqual(["wss://streamerbot.local:8090/ws"]);

    const normalizedHarness = createClientHarness();
    normalizedHarness.client.connect({ endpoint: "ws" });

    expect(normalizedHarness.openedUrls).toEqual(["ws://127.0.0.1:8080/ws"]);
  });

  it("connects from a valid Hello without authentication and sends no Authenticate request", async () => {
    const harness = createClientHarness();

    harness.client.connect();
    await harness.sockets[0]?.emitMessage(hello({ name: "Local Bot", version: "1.2.3" }));

    expect(harness.sockets[0]?.sent).toEqual([]);
    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      instance: { name: "Local Bot", version: "1.2.3" },
      connectedAt: "2026-06-08T12:00:00.000Z",
      lastMessageAt: "2026-06-08T12:00:00.000Z"
    });
  });

  it("authenticates Hello challenges and waits for a successful auth response before connecting", async () => {
    const harness = createClientHarness({ requestIds: ["auth-1"] });

    harness.client.connect({ password: "super-secret" });
    await harness.sockets[0]?.emitMessage(authHello("salt-value", "challenge-value"));

    expect(harness.client.getStatus()).toMatchObject({ state: "connecting" });
    expect(harness.sockets[0]?.sent).toEqual([
      {
        request: "Authenticate",
        id: "auth-1",
        authentication: expectedAuthentication("super-secret", "salt-value", "challenge-value")
      }
    ]);

    await harness.sockets[0]?.emitMessage(okResponse("auth-1", "Authenticate"));

    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      instance: { name: "Local Bot" }
    });
  });

  it("fails authentication safely for missing passwords, auth errors, and malformed Hello payloads", async () => {
    const missingPassword = createClientHarness();
    missingPassword.client.connect();

    await missingPassword.sockets[0]?.emitMessage(authHello("salt-value", "challenge-value"));

    expect(missingPassword.sockets[0]?.sent).toEqual([]);
    expect(missingPassword.sockets[0]?.closeCount).toBe(1);
    expectSafeStatus(missingPassword.client.getStatus(), ["salt-value", "challenge-value"]);
    expect(missingPassword.client.getStatus()).toMatchObject({
      state: "error",
      message: "Streamer.bot authentication requires a configured password"
    });

    const authError = createClientHarness({ requestIds: ["auth-1"] });
    authError.client.connect({ password: "super-secret" });
    await authError.sockets[0]?.emitMessage(authHello("salt-value", "challenge-value"));
    await authError.sockets[0]?.emitMessage({
      id: "auth-1",
      request: "Authenticate",
      status: "error",
      error: "super-secret should not leak"
    });

    expect(authError.sockets[0]?.closeCount).toBe(1);
    expectSafeStatus(authError.client.getStatus(), ["super-secret", "salt-value", "challenge-value"]);
    expect(authError.client.getStatus()).toMatchObject({
      state: "error",
      pendingRequestCount: 0
    });

    const malformedHello = createClientHarness();
    malformedHello.client.connect();
    await malformedHello.sockets[0]?.emitMessage({
      request: "Hello",
      authentication: { salt: "salt-value" }
    });

    expect(malformedHello.client.getStatus()).toMatchObject({
      state: "error",
      message: "Streamer.bot Hello message was invalid"
    });
  });

  it("correlates GetInfo and rejects invalid info responses", async () => {
    const harness = createConnectedClientHarness({ requestIds: ["info-1"] });

    const info = harness.client.getInfo();

    expect(harness.sockets[0]?.sent).toEqual([{ request: "GetInfo", id: "info-1" }]);

    await harness.sockets[0]?.emitMessage({
      id: "info-1",
      request: "GetInfo",
      status: "ok",
      info: { name: "Local Bot", version: "1.2.3" }
    });

    await expect(info).resolves.toEqual({ name: "Local Bot", version: "1.2.3" });

    const invalid = createConnectedClientHarness({ requestIds: ["info-1"] });
    const invalidInfo = invalid.client.getInfo();

    await invalid.sockets[0]?.emitMessage(okResponse("info-1", "GetInfo"));

    await expect(invalidInfo).rejects.toBeInstanceOf(StreamerBotProtocolError);
    expect(invalid.client.getStatus()).toMatchObject({
      state: "error",
      pendingRequestCount: 0
    });
  });

  it("gets events and preserves category key casing", async () => {
    const harness = createConnectedClientHarness({ requestIds: ["events-1"] });
    const availableEvents = {
      Twitch: ["Follow", "Cheer"],
      "streamerbot:CustomSource": ["CustomEvent"]
    };

    const events = harness.client.getEvents();

    expect(harness.sockets[0]?.sent).toEqual([{ request: "GetEvents", id: "events-1" }]);

    await harness.sockets[0]?.emitMessage({
      id: "events-1",
      request: "GetEvents",
      status: "ok",
      events: availableEvents
    });

    await expect(events).resolves.toEqual(availableEvents);
  });

  it("subscribes and unsubscribes selected category keys without exposing action APIs", async () => {
    const harness = createConnectedClientHarness({ requestIds: ["subscribe-1", "unsubscribe-1"] });

    const subscribe = harness.client.subscribe([
      {
        sourceKey: "Twitch",
        eventTypes: ["Follow", "Cheer"]
      }
    ]);

    expect(harness.sockets[0]?.sent.at(-1)).toEqual({
      request: "Subscribe",
      id: "subscribe-1",
      events: { Twitch: ["Follow", "Cheer"] }
    });

    await harness.sockets[0]?.emitMessage(okResponse("subscribe-1", "Subscribe"));
    await expect(subscribe).resolves.toBeUndefined();
    expect(harness.client.getStatus()).toMatchObject({
      subscriptionSourceKeys: ["Twitch"]
    });

    const unsubscribe = harness.client.unsubscribe([
      {
        sourceKey: "Twitch",
        eventTypes: ["Follow", "Cheer"]
      }
    ]);

    expect(harness.sockets[0]?.sent.at(-1)).toEqual({
      request: "UnSubscribe",
      id: "unsubscribe-1",
      events: { Twitch: ["Follow", "Cheer"] }
    });

    await harness.sockets[0]?.emitMessage(okResponse("unsubscribe-1", "UnSubscribe"));
    await expect(unsubscribe).resolves.toBeUndefined();
    expect(harness.client.getStatus()).toMatchObject({
      subscriptionSourceKeys: []
    });

    const exposed = harness.client as unknown as Record<string, unknown>;
    expect(exposed.DoAction).toBeUndefined();
    expect(exposed.doAction).toBeUndefined();
    expect(exposed.SendMessage).toBeUndefined();
    expect(exposed.executeCodeTrigger).toBeUndefined();
    expect(exposed.setGlobal).toBeUndefined();
  });

  it("resolves only the pending request with the matching response ID", async () => {
    const harness = createConnectedClientHarness({ requestIds: ["info-1", "events-1"] });
    const info = harness.client.getInfo();
    const events = harness.client.getEvents();
    let infoSettled = false;
    void info.then(
      () => {
        infoSettled = true;
      },
      () => {
        infoSettled = true;
      }
    );

    await harness.sockets[0]?.emitMessage({
      id: "events-1",
      request: "GetEvents",
      status: "ok",
      events: { Twitch: ["Follow"] }
    });
    await Promise.resolve();

    await expect(events).resolves.toEqual({ Twitch: ["Follow"] });
    expect(infoSettled).toBe(false);

    await harness.sockets[0]?.emitMessage({
      id: "info-1",
      request: "GetInfo",
      status: "ok",
      info: { name: "Local Bot" }
    });

    await expect(info).resolves.toEqual({ name: "Local Bot" });
  });

  it("rejects error, unknown, and malformed responses with safe status messages", async () => {
    const errorResponse = createConnectedClientHarness({ requestIds: ["info-1"] });
    const info = errorResponse.client.getInfo();

    await errorResponse.sockets[0]?.emitMessage({
      id: "info-1",
      request: "GetInfo",
      status: "error",
      error: "super-secret should not leak"
    });

    await expect(info).rejects.toBeInstanceOf(StreamerBotProtocolError);
    expectSafeStatus(errorResponse.client.getStatus(), ["super-secret should not leak"]);
    expect(errorResponse.client.getStatus()).toMatchObject({ state: "error" });

    const unknown = createConnectedClientHarness({ requestIds: ["info-1"] });
    const pendingInfo = unknown.client.getInfo();

    await unknown.sockets[0]?.emitMessage({
      id: "unknown-id",
      request: "GetInfo",
      status: "ok",
      info: { name: "Wrong Bot" }
    });

    expect(unknown.client.getStatus()).toMatchObject({
      state: "degraded",
      pendingRequestCount: 1
    });

    await unknown.sockets[0]?.emitMessage({
      id: "info-1",
      request: "GetInfo",
      status: "ok",
      info: { name: "Local Bot" }
    });

    await expect(pendingInfo).resolves.toEqual({ name: "Local Bot" });

    const malformed = createConnectedClientHarness({ requestIds: ["info-1"] });
    const malformedInfo = malformed.client.getInfo();

    await malformed.sockets[0]?.emitMessage({
      id: "info-1",
      request: "GetInfo",
      info: { name: "Local Bot" }
    });

    await expect(malformedInfo).rejects.toBeInstanceOf(StreamerBotProtocolError);
    expect(malformed.client.getStatus()).toMatchObject({
      state: "error",
      pendingRequestCount: 0
    });
  });

  it("rejects timed out requests and cleans up pending state", async () => {
    const harness = createConnectedClientHarness({
      requestIds: ["info-1"],
      requestTimeoutMs: 25
    });
    const info = harness.client.getInfo();

    expect(harness.scheduled.map((item) => item.delayMs)).toEqual([25]);

    harness.runNextScheduled();

    await expect(info).rejects.toBeInstanceOf(StreamerBotProtocolError);
    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      pendingRequestCount: 0
    });
  });

  it("rejects all pending requests on socket close and socket error", async () => {
    const closeHarness = createConnectedClientHarness({ requestIds: ["info-1", "events-1"] });
    const closeInfo = closeHarness.client.getInfo();
    const closeEvents = closeHarness.client.getEvents();
    const closeInfoExpectation = expect(closeInfo).rejects.toThrow("Streamer.bot connection closed");
    const closeEventsExpectation = expect(closeEvents).rejects.toThrow("Streamer.bot connection closed");

    closeHarness.sockets[0]?.emitClose({ reason: "network lost" });

    await closeInfoExpectation;
    await closeEventsExpectation;
    expect(closeHarness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      pendingRequestCount: 0,
      message: "Streamer.bot connection closed",
      referenceId: "ref-1"
    });
    expect(closeHarness.diagnostics).toEqual([{
      level: "error",
      message: "Streamer.bot connection closed",
      referenceId: "ref-1"
    }]);

    const errorHarness = createConnectedClientHarness({ requestIds: ["info-1", "events-1"] });
    const errorInfo = errorHarness.client.getInfo();
    const errorEvents = errorHarness.client.getEvents();
    const errorInfoExpectation = expect(errorInfo).rejects.toThrow("Streamer.bot WebSocket error");
    const errorEventsExpectation = expect(errorEvents).rejects.toThrow("Streamer.bot WebSocket error");

    errorHarness.sockets[0]?.emitError(new Error("super-secret should not leak"));

    await errorInfoExpectation;
    await errorEventsExpectation;
    expectSafeStatus(errorHarness.client.getStatus(), ["super-secret should not leak"]);
    expect(errorHarness.client.getStatus()).toMatchObject({
      state: "error",
      pendingRequestCount: 0,
      message: "Streamer.bot WebSocket error",
      referenceId: "ref-1"
    });
    expect(errorHarness.diagnostics).toEqual([{
      level: "error",
      message: "Streamer.bot WebSocket error",
      referenceId: "ref-1"
    }]);

    errorHarness.sockets[0]?.emitClose();
    expect(errorHarness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      message: "Streamer.bot WebSocket error",
      referenceId: "ref-1"
    });
    expect(errorHarness.diagnostics).toHaveLength(1);
  });

  it("forwards valid event envelopes without requiring known source/type pairs", async () => {
    const harness = createConnectedClientHarness();
    const envelope = eventEnvelope({
      timeStamp: "2026-06-08T12:05:00.000Z",
      event: {
        source: "Twitch",
        type: "Follow"
      },
      data: {
        userName: "jam"
      }
    });

    await harness.sockets[0]?.emitMessage(envelope);

    expect(harness.events).toEqual([envelope]);
    expect(harness.client.getStatus()).toMatchObject({
      lastMessageAt: "2026-06-08T12:05:00.000Z"
    });

    const unknown = eventEnvelope({
      event: {
        source: "UnknownPlugin",
        type: "SomeNewEvent"
      },
      data: {
        raw: true
      }
    });

    await harness.sockets[0]?.emitMessage(unknown);

    expect(harness.events.at(-1)).toEqual(unknown);
  });

  it("rejects malformed JSON and malformed event envelopes safely", async () => {
    const harness = createConnectedClientHarness();

    await harness.sockets[0]?.emitRawMessage("{");

    expect(harness.events).toEqual([]);
    expect(harness.client.getStatus()).toMatchObject({
      state: "degraded",
      message: "Streamer.bot message was invalid JSON"
    });

    await harness.sockets[0]?.emitMessage({
      timeStamp: "2026-06-08T12:05:00.000Z",
      event: {
        source: "Twitch"
      },
      data: {
        secret: "super-secret should not leak"
      }
    });

    expect(harness.events).toEqual([]);
    expectSafeStatus(harness.client.getStatus(), ["super-secret should not leak"]);
    expect(harness.client.getStatus()).toMatchObject({
      state: "degraded",
      message: "Streamer.bot event envelope was invalid"
    });
  });

  it("schedules reconnects with a bounded backoff after unexpected closes", async () => {
    const harness = createConnectedClientHarness({ backoffMs: [10, 20] });

    harness.sockets[0]?.emitClose({ reason: "network lost" });

    expect(harness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      message: "Streamer.bot connection closed"
    });
    expect(harness.scheduled.map((item) => item.delayMs)).toEqual([10]);

    harness.runNextScheduled();
    expect(harness.openedUrls).toHaveLength(2);
    await harness.sockets[1]?.emitMessage(hello());
    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      lastErrorAt: null,
      message: null,
      referenceId: null
    });

    harness.sockets[1]?.emitClose({ reason: "still lost" });
    harness.runNextScheduled();
    harness.sockets[2]?.emitClose({ reason: "still lost" });

    expect(harness.scheduled.map((item) => item.delayMs)).toEqual([10, 10, 20]);
  });

  it("resubscribes stored selections after reconnect", async () => {
    const harness = createConnectedClientHarness({
      requestIds: ["subscribe-1", "resubscribe-1"],
      backoffMs: [10]
    });
    const subscribe = harness.client.subscribe([
      {
        sourceKey: "Twitch",
        eventTypes: ["Follow", "Cheer"]
      }
    ]);
    await harness.sockets[0]?.emitMessage(okResponse("subscribe-1", "Subscribe"));
    await subscribe;

    harness.sockets[0]?.emitClose({ reason: "network lost" });
    harness.runNextScheduled();
    await harness.sockets[1]?.emitMessage(hello());

    expect(harness.sockets[1]?.sent).toEqual([
      {
        request: "Subscribe",
        id: "resubscribe-1",
        events: { Twitch: ["Follow", "Cheer"] }
      }
    ]);
  });

  it("ignores stale socket messages after a newer socket is opened", async () => {
    const harness = createConnectedClientHarness({ backoffMs: [10] });

    harness.sockets[0]?.emitClose({ reason: "network lost" });
    harness.runNextScheduled();
    await harness.sockets[0]?.emitMessage(hello({ name: "Stale Bot" }));
    await harness.sockets[0]?.emitMessage(eventEnvelope());

    expect(harness.client.getStatus()).toMatchObject({
      state: "connecting",
      instance: { name: "Local Bot" }
    });
    expect(harness.events).toEqual([]);

    await harness.sockets[1]?.emitMessage(hello({ name: "Current Bot" }));

    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      instance: { name: "Current Bot" }
    });
  });
});

interface HarnessOptions {
  readonly requestIds?: readonly string[] | undefined;
  readonly requestTimeoutMs?: number | undefined;
  readonly backoffMs?: readonly number[] | undefined;
}

function createConnectedClientHarness(options: HarnessOptions = {}) {
  const harness = createClientHarness(options);
  harness.client.connect();
  harness.sockets[0]?.emitMessageSync(hello());
  return harness;
}

function createClientHarness(options: HarnessOptions = {}) {
  const sockets: FakeSocket[] = [];
  const openedUrls: string[] = [];
  const scheduled: { readonly callback: () => void; readonly delayMs: number }[] = [];
  const scheduledQueue: { readonly callback: () => void; readonly delayMs: number }[] = [];
  const events: StreamerBotEventEnvelope[] = [];
  const diagnostics: Array<{ readonly level: "warn" | "error"; readonly message: string; readonly referenceId: string }> = [];
  const requestIds = options.requestIds ?? createRequestIds();
  let requestIdIndex = 0;
  let referenceId = 0;
  const client = new StreamerBotClient({
    socketFactory(url) {
      openedUrls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    requestIdGenerator() {
      const id = requestIds[requestIdIndex];
      requestIdIndex += 1;
      if (id === undefined) {
        throw new Error("Test request ID generator was exhausted");
      }
      return id;
    },
    onEvent(envelope) {
      events.push(envelope);
    },
    generateReferenceId: () => `ref-${++referenceId}`,
    onDiagnostic(entry) {
      diagnostics.push(entry);
    },
    now: () => new Date("2026-06-08T12:00:00.000Z"),
    schedule(callback, delayMs) {
      const item = { callback, delayMs };
      scheduled.push(item);
      scheduledQueue.push(item);
      return callback;
    },
    cancelScheduled(handle) {
      const index = scheduledQueue.findIndex((item) => item.callback === handle);
      if (index >= 0) {
        scheduledQueue.splice(index, 1);
      }
    },
    requestTimeoutMs: options.requestTimeoutMs,
    backoffMs: options.backoffMs
  });

  return {
    client,
    diagnostics,
    events,
    openedUrls,
    runNextScheduled() {
      scheduledQueue.shift()?.callback();
    },
    scheduled,
    sockets
  };
}

function createRequestIds(): readonly string[] {
  return Array.from({ length: 50 }, (_, index) => "request-" + String(index + 1));
}

class FakeSocket implements StreamerBotSocket {
  closeCount = 0;
  readonly sent: unknown[] = [];
  readonly #listeners = {
    open: [] as (() => void | Promise<void>)[],
    message: [] as ((event: { readonly data: unknown }) => void | Promise<void>)[],
    close: [] as ((event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>)[],
    error: [] as ((event: unknown) => void | Promise<void>)[]
  };

  addEventListener(event: "open", listener: () => void | Promise<void>): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(
    event: "close",
    listener: (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>
  ): void;
  addEventListener(event: "error", listener: (event: unknown) => void | Promise<void>): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event === "open") {
      this.#listeners.open.push(listener as () => void | Promise<void>);
      return;
    }
    if (event === "message") {
      this.#listeners.message.push(listener as (event: { readonly data: unknown }) => void | Promise<void>);
      return;
    }
    if (event === "close") {
      this.#listeners.close.push(listener as (event: { readonly code?: number; readonly reason?: string }) => void | Promise<void>);
      return;
    }
    this.#listeners.error.push(listener as (event: unknown) => void | Promise<void>);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as unknown);
  }

  close(): void {
    this.closeCount += 1;
  }

  async emitMessage(message: unknown): Promise<void> {
    await this.emitRawMessage(JSON.stringify(message));
  }

  emitMessageSync(message: unknown): void {
    for (const listener of this.#listeners.message) {
      void listener({ data: JSON.stringify(message) });
    }
  }

  async emitRawMessage(data: string): Promise<void> {
    for (const listener of this.#listeners.message) {
      await listener({ data });
    }
  }

  emitClose(event: { readonly code?: number; readonly reason?: string } = {}): void {
    for (const listener of this.#listeners.close) {
      void listener(event);
    }
  }

  emitError(error: unknown): void {
    for (const listener of this.#listeners.error) {
      void listener(error);
    }
  }
}

function hello(info: Record<string, unknown> = { name: "Local Bot" }) {
  return {
    request: "Hello",
    info
  };
}

function authHello(salt: string, challenge: string) {
  return {
    request: "Hello",
    info: {
      name: "Local Bot"
    },
    authentication: {
      salt,
      challenge
    }
  };
}

function okResponse(id: string, request: string) {
  return {
    id,
    request,
    status: "ok"
  };
}

function eventEnvelope(overrides: Partial<StreamerBotEventEnvelope> = {}): StreamerBotEventEnvelope {
  return {
    timeStamp: "2026-06-08T12:05:00.000Z",
    event: {
      source: "Twitch",
      type: "Follow"
    },
    data: {
      userName: "jam"
    },
    ...overrides
  };
}

function expectedAuthentication(password: string, salt: string, challenge: string): string {
  const secret = sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

function sha256Base64(value: string): string {
  // Mirrors Streamer.bot's mandated SHA-256/base64 challenge response; this is not password storage.
  // See docs/security/codeql-suppressions.md for the protocol reference and suppression rationale.
  // codeql[js/insufficient-password-hash]
  return createHash("sha256").update(value, "utf8").digest("base64");
}

function expectSafeStatus(status: unknown, forbiddenValues: readonly string[]): void {
  const serialized = JSON.stringify(status);
  for (const value of forbiddenValues) {
    expect(serialized).not.toContain(value);
  }
}
