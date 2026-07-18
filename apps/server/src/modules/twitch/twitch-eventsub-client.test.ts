import { describe, expect, it } from "vitest";
import {
  buildTwitchEventSubSubscriptionRequests,
  DefaultTwitchEventSubApiClient,
  TwitchEventSubApiError,
  TwitchEventSubClient,
  TwitchEventSubResponseError
} from "./twitch-eventsub-client.js";

describe("buildTwitchEventSubSubscriptionRequests", () => {
  it("builds MVP EventSub WebSocket subscriptions from granted scopes", () => {
    const requests = buildTwitchEventSubSubscriptionRequests({
      account: {
        accountId: "141981764",
        scopes: ["bits:read", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"]
      },
      sessionId: "session-1"
    });

    expect(requests.map((request) => request.type)).toEqual([
      "channel.follow",
      "channel.subscribe",
      "channel.subscription.message",
      "channel.cheer",
      "channel.raid",
      "channel.channel_points_custom_reward_redemption.add"
    ]);
    expect(requests[0]).toEqual({
      type: "channel.follow",
      version: "2",
      condition: {
        broadcaster_user_id: "141981764",
        moderator_user_id: "141981764"
      },
      transport: {
        method: "websocket",
        session_id: "session-1"
      }
    });
  });

  it("omits scope-gated subscriptions when account scopes are absent", () => {
    const requests = buildTwitchEventSubSubscriptionRequests({
      account: {
        accountId: "141981764",
        scopes: []
      },
      sessionId: "session-1"
    });

    expect(requests).toEqual([
      {
        type: "channel.raid",
        version: "1",
        condition: {
          to_broadcaster_user_id: "141981764"
        },
        transport: {
          method: "websocket",
          session_id: "session-1"
        }
      }
    ]);
  });
});

describe("DefaultTwitchEventSubApiClient", () => {
  it("creates EventSub subscriptions with user token and client ID headers", async () => {
    const fetcher = createRecordingFetch([
      jsonResponse({
        data: [
          {
            id: "subscription-1",
            status: "enabled",
            type: "channel.follow"
          }
        ]
      })
    ]);
    const client = new DefaultTwitchEventSubApiClient({ fetch: fetcher.fetch });

    await expect(
      client.createSubscription({
        accessToken: "access-token",
        clientId: "client-id",
        subscription: {
          type: "channel.follow",
          version: "2",
          condition: {
            broadcaster_user_id: "141981764",
            moderator_user_id: "141981764"
          },
          transport: {
            method: "websocket",
            session_id: "session-1"
          }
        }
      })
    ).resolves.toEqual({
      id: "subscription-1",
      status: "enabled",
      type: "channel.follow"
    });

    expect(fetcher.requests[0]?.url).toBe("https://api.twitch.tv/helix/eventsub/subscriptions");
    expect(fetcher.requests[0]?.init.headers).toEqual({
      authorization: "Bearer access-token",
      "client-id": "client-id",
      "content-type": "application/json"
    });
  });

  it("rejects malformed EventSub API responses without exposing token values", async () => {
    const fetcher = createRecordingFetch([jsonResponse({ data: [{}] })]);
    const client = new DefaultTwitchEventSubApiClient({ fetch: fetcher.fetch });

    await expect(
      client.createSubscription({
        accessToken: "access-token",
        clientId: "client-id",
        subscription: {
          type: "channel.follow",
          version: "2",
          condition: {},
          transport: {
            method: "websocket",
            session_id: "session-1"
          }
        }
      })
    ).rejects.toBeInstanceOf(TwitchEventSubResponseError);
  });
});

describe("TwitchEventSubClient", () => {
  it("stores session welcome state and creates subscriptions", async () => {
    const harness = createClientHarness();

    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));

    expect(harness.apiClient.requests.map((request) => request.subscription.type)).toContain("channel.follow");
    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      sessionId: "session-1",
      subscriptionTypes: [
        "channel.follow",
        "channel.subscribe",
        "channel.subscription.message",
        "channel.cheer",
        "channel.raid",
        "channel.channel_points_custom_reward_redemption.add"
      ]
    });
  });

  it("closes the previous socket before connecting a stored account again", () => {
    const harness = createClientHarness();

    harness.client.connect(connectionInput());
    harness.client.connect(connectionInput());

    expect(harness.openedUrls).toEqual([
      "wss://eventsub.wss.twitch.tv/ws",
      "wss://eventsub.wss.twitch.tv/ws"
    ]);
    expect(harness.sockets[0]?.closeCount).toBe(1);
  });

  it("handles keepalive, notification, reconnect, revocation, and unexpected close", async () => {
    const harness = createClientHarness();

    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));
    await harness.sockets[0]?.emitMessage({
      metadata: {
        message_type: "session_keepalive",
        message_timestamp: "2026-05-30T12:00:10.000Z"
      },
      payload: {}
    });
    await harness.sockets[0]?.emitMessage(notification("message-1"));

    expect(harness.notifications.map((message) => message.metadata.message_id)).toEqual(["message-1"]);
    expect(harness.notifications[0]).toMatchObject({
      payload: {
        subscription: {
          id: "subscription-1"
        }
      }
    });
    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      lastMessageAt: "2026-05-30T12:00:00.000Z"
    });

    await harness.sockets[0]?.emitMessage(sessionReconnect("wss://eventsub.wss.twitch.tv/ws?reconnect=1"));

    expect(harness.openedUrls).toEqual([
      "wss://eventsub.wss.twitch.tv/ws",
      "wss://eventsub.wss.twitch.tv/ws?reconnect=1"
    ]);
    await harness.sockets[1]?.emitMessage(sessionWelcome("session-2"));
    expect(harness.apiClient.requests).toHaveLength(6);

    await harness.sockets[1]?.emitMessage(revocation());
    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      message: "Twitch EventSub subscription was revoked: authorization_revoked",
      referenceId: "ref-1"
    });
    harness.client.getStatus();
    harness.client.getStatus();
    expect(harness.diagnostics).toEqual([{
      message: "Twitch EventSub subscription was revoked: authorization_revoked",
      referenceId: "ref-1"
    }]);

    harness.sockets[1]?.emitClose({ reason: "network lost" });
    expect(harness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      message: "network lost",
      lastErrorAt: "2026-05-30T12:00:30.000Z",
      referenceId: "ref-2"
    });
    expect(harness.diagnostics.at(-1)).toEqual({ message: "network lost", referenceId: "ref-2" });
    expect(harness.scheduled).toEqual([1_000]);

    harness.runScheduled();
    expect(harness.openedUrls.at(-1)).toBe("wss://eventsub.wss.twitch.tv/ws");
    await harness.sockets[2]?.emitMessage(sessionWelcome("session-3"));
    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      message: null,
      lastErrorAt: null,
      referenceId: null
    });
  });

  it("reconnects when the server stops sending messages before the keepalive deadline", async () => {
    const harness = createClientHarness();

    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));

    expect(harness.watchdogDelays).toEqual([11_000]);

    await harness.sockets[0]?.emitMessage({
      metadata: {
        message_type: "session_keepalive",
        message_timestamp: "2026-05-30T12:00:10.000Z"
      },
      payload: {}
    });
    expect(harness.watchdogDelays).toEqual([11_000, 11_000]);

    harness.runLatestWatchdog();

    expect(harness.sockets[0]?.closeCount).toBe(1);
    expect(harness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      message: "Twitch EventSub keepalive timed out",
      referenceId: "ref-1"
    });
    expect(harness.scheduled).toEqual([1_000]);
  });

  it("clears a transient transport failure after a valid message but retains revocation failures", async () => {
    const harness = createClientHarness();

    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));
    harness.sockets[0]?.emitError();
    expect(harness.client.getStatus()).toMatchObject({ state: "error", referenceId: "ref-1" });

    await harness.sockets[0]?.emitMessage(notification("message-2"));

    expect(harness.client.getStatus()).toMatchObject({
      state: "connected",
      message: null,
      lastErrorAt: null,
      referenceId: null
    });

    await harness.sockets[0]?.emitMessage(revocation());
    expect(harness.client.getStatus()).toMatchObject({ state: "error", referenceId: "ref-2" });

    harness.sockets[0]?.emitError();
    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      message: "Twitch EventSub WebSocket error",
      referenceId: "ref-3"
    });

    await harness.sockets[0]?.emitMessage(notification("message-3"));

    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      message: "Twitch EventSub subscription was revoked: authorization_revoked",
      referenceId: "ref-2"
    });
  });

  it("reuses the transport error reference when the WebSocket then closes", async () => {
    const harness = createClientHarness();
    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));

    harness.sockets[0]?.emitError();
    harness.sockets[0]?.emitClose({});

    expect(harness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      message: "Twitch EventSub WebSocket error",
      referenceId: "ref-1"
    });
    expect(harness.diagnostics).toEqual([{
      message: "Twitch EventSub WebSocket error",
      referenceId: "ref-1"
    }]);
  });

  it("keeps subscription setup failures active across otherwise healthy messages", async () => {
    const harness = createClientHarness();
    harness.apiClient.failSubscriptions = true;
    harness.client.connect(connectionInput());

    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));
    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      message: "Twitch EventSub subscription setup failed",
      referenceId: "ref-1"
    });

    await harness.sockets[0]?.emitMessage({
      metadata: {
        message_type: "session_keepalive",
        message_timestamp: "2026-05-30T12:00:10.000Z"
      },
      payload: {}
    });

    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      message: "Twitch EventSub subscription setup failed",
      referenceId: "ref-1"
    });
  });

  it("hands an HTTP 401 subscription failure to authorization recovery without retrying the stale token", async () => {
    let authorizationFailures = 0;
    const harness = createClientHarness({
      onAuthorizationFailure() {
        authorizationFailures += 1;
      }
    });
    harness.apiClient.subscriptionFailure = new TwitchEventSubApiError(401);
    harness.apiClient.failSubscriptionType = "channel.subscribe";
    harness.client.connect(connectionInput());

    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));

    expect(harness.apiClient.requests.map((request) => request.subscription.type)).toEqual([
      "channel.follow",
      "channel.subscribe"
    ]);
    expect(harness.client.getStatus()).toMatchObject({
      state: "error",
      message: "Twitch EventSub subscription setup failed (Twitch API returned HTTP 401)",
      referenceId: "ref-1",
      subscriptionTypes: []
    });
    expect(harness.sockets[0]?.closeCount).toBe(1);
    expect(authorizationFailures).toBe(1);
    expect(harness.scheduled).toEqual([]);
    expect(harness.diagnostics).toEqual([{
      message: "Twitch EventSub subscription setup failed (Twitch API returned HTTP 401)",
      referenceId: "ref-1"
    }]);
  });

  it("ignores stale subscription setup after the connection is replaced", async () => {
    const harness = createClientHarness();
    let releaseSubscription!: () => void;
    let signalSubscriptionStarted!: () => void;
    const subscriptionStarted = new Promise<void>((resolve) => {
      signalSubscriptionStarted = resolve;
    });
    const blockedSubscription = new Promise<void>((resolve) => {
      releaseSubscription = resolve;
    });
    harness.apiClient.beforeSubscription = async (input) => {
      if (input.subscription.type === "channel.follow") {
        signalSubscriptionStarted();
        await blockedSubscription;
      }
    };
    harness.client.connect(connectionInput());

    const staleWelcome = harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));
    await subscriptionStarted;
    harness.client.connect(connectionInput());
    releaseSubscription();
    await staleWelcome;

    expect(harness.openedUrls).toHaveLength(2);
    expect(harness.apiClient.requests.map((request) => request.subscription.type)).toEqual(["channel.follow"]);
    expect(harness.client.getStatus()).toMatchObject({ state: "connecting" });

    harness.apiClient.beforeSubscription = null;
    await harness.sockets[1]?.emitMessage(sessionWelcome("session-2"));
    expect(harness.client.getStatus()).toMatchObject({ state: "connected", sessionId: "session-2" });
  });

  it("ignores a scheduled retry after the connection is replaced", async () => {
    const harness = createClientHarness();
    harness.apiClient.failSubscriptions = true;
    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));

    harness.client.connect(connectionInput());
    harness.apiClient.failSubscriptions = false;
    harness.runScheduled();

    expect(harness.openedUrls).toHaveLength(2);
    expect(harness.client.getStatus()).toMatchObject({ state: "connecting" });
  });

  it("ignores a stale notification failure after the connection is replaced", async () => {
    let rejectNotification!: (error: Error) => void;
    let signalNotificationStarted!: () => void;
    const notificationStarted = new Promise<void>((resolve) => {
      signalNotificationStarted = resolve;
    });
    const blockedNotification = new Promise<void>((_resolve, reject) => {
      rejectNotification = reject;
    });
    const harness = createClientHarness({
      async onNotification() {
        signalNotificationStarted();
        await blockedNotification;
      }
    });
    harness.client.connect(connectionInput());
    await harness.sockets[0]?.emitMessage(sessionWelcome("session-1"));

    const staleNotification = harness.sockets[0]?.emitMessage(notification("message-stale"));
    await notificationStarted;
    harness.client.connect(connectionInput());
    rejectNotification(new Error("stale notification failed"));
    await staleNotification;

    expect(harness.client.getStatus()).toMatchObject({ state: "connecting", message: null });
    expect(harness.diagnostics).toEqual([]);
  });
});

function createClientHarness(options: {
  readonly onNotification?: ((message: unknown) => void | Promise<void>) | undefined;
  readonly onAuthorizationFailure?: (() => void | Promise<void>) | undefined;
} = {}) {
  const sockets: FakeSocket[] = [];
  const openedUrls: string[] = [];
  const scheduled: number[] = [];
  const scheduledCallbacks: (() => void)[] = [];
  const watchdogDelays: number[] = [];
  const watchdogs: { callback: () => void; cancelled: boolean }[] = [];
  const apiClient = new RecordingEventSubApiClient();
  const notifications: { readonly metadata: { readonly message_id: string } }[] = [];
  const diagnostics: { readonly message: string; readonly referenceId: string }[] = [];
  let reference = 0;
  const client = new TwitchEventSubClient({
    apiClient,
    socketFactory(url) {
      openedUrls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    async onNotification(message) {
      notifications.push(message as { readonly metadata: { readonly message_id: string } });
      await options.onNotification?.(message);
    },
    onAuthorizationFailure: options.onAuthorizationFailure,
    schedule(callback, delayMs) {
      scheduled.push(delayMs);
      scheduledCallbacks.push(callback);
    },
    scheduleWatchdog(callback, delayMs) {
      watchdogDelays.push(delayMs);
      const watchdog = { callback, cancelled: false };
      watchdogs.push(watchdog);
      return watchdog;
    },
    cancelWatchdog(handle) {
      (handle as { cancelled: boolean }).cancelled = true;
    },
    now: () => new Date("2026-05-30T12:00:30.000Z"),
    generateReferenceId: () => `ref-${++reference}`,
    onDiagnostic(entry) {
      diagnostics.push(entry);
    }
  });

  return {
    apiClient,
    client,
    diagnostics,
    notifications,
    openedUrls,
    runScheduled() {
      scheduledCallbacks.shift()?.();
    },
    runLatestWatchdog() {
      for (let index = watchdogs.length - 1; index >= 0; index -= 1) {
        const watchdog = watchdogs[index];
        if (watchdog !== undefined && !watchdog.cancelled) {
          watchdog.callback();
          break;
        }
      }
    },
    scheduled,
    sockets,
    watchdogDelays
  };
}

function connectionInput() {
  return {
    accessToken: "access-token",
    clientId: "client-id",
    account: {
      accountId: "141981764",
      scopes: ["bits:read", "channel:read:redemptions", "channel:read:subscriptions", "moderator:read:followers"]
    }
  };
}

class RecordingEventSubApiClient {
  readonly requests: Parameters<DefaultTwitchEventSubApiClient["createSubscription"]>[0][] = [];
  beforeSubscription: ((input: Parameters<DefaultTwitchEventSubApiClient["createSubscription"]>[0]) => Promise<void>) | null = null;
  failSubscriptions = false;
  failSubscriptionType: string | null = null;
  subscriptionFailure: Error | null = null;

  async createSubscription(input: Parameters<DefaultTwitchEventSubApiClient["createSubscription"]>[0]) {
    this.requests.push(input);
    await this.beforeSubscription?.(input);
    if (this.failSubscriptions) throw new Error("subscription request failed");
    if (this.failSubscriptionType === input.subscription.type) {
      throw this.subscriptionFailure ?? new Error("subscription request failed");
    }
    return {
      id: "created-" + input.subscription.type,
      status: "enabled",
      type: input.subscription.type
    };
  }
}

class FakeSocket {
  closeCount = 0;
  readonly #listeners = {
    message: [] as ((event: { readonly data: unknown }) => void | Promise<void>)[],
    close: [] as ((event: { readonly code?: number; readonly reason?: string }) => void)[],
    error: [] as ((event: unknown) => void)[]
  };

  addEventListener(event: "open", _listener: () => void): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void | Promise<void>): void;
  addEventListener(event: "close", listener: (event: { readonly code?: number; readonly reason?: string }) => void): void;
  addEventListener(event: "error", listener: (event: unknown) => void): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event !== "open") {
      this.#listeners[event].push(listener as never);
    }
  }

  close(): void {
    this.closeCount += 1;
  }

  async emitMessage(message: unknown): Promise<void> {
    for (const listener of this.#listeners.message) {
      await listener({ data: JSON.stringify(message) });
    }
  }

  emitClose(event: { readonly code?: number; readonly reason?: string }): void {
    for (const listener of this.#listeners.close) {
      listener(event);
    }
  }

  emitError(): void {
    for (const listener of this.#listeners.error) {
      listener(new Error("socket failed"));
    }
  }
}

function sessionWelcome(sessionId: string) {
  return {
    metadata: {
      message_type: "session_welcome",
      message_timestamp: "2026-05-30T12:00:00.000Z"
    },
    payload: {
      session: {
        id: sessionId,
        status: "connected",
        keepalive_timeout_seconds: 10,
        reconnect_url: null,
        connected_at: "2026-05-30T12:00:00.000Z"
      }
    }
  };
}

function sessionReconnect(reconnectUrl: string) {
  return {
    metadata: {
      message_type: "session_reconnect",
      message_timestamp: "2026-05-30T12:00:20.000Z"
    },
    payload: {
      session: {
        id: "session-1",
        status: "reconnecting",
        keepalive_timeout_seconds: null,
        reconnect_url: reconnectUrl,
        connected_at: "2026-05-30T12:00:00.000Z"
      }
    }
  };
}

function notification(messageId: string) {
  return {
    metadata: {
      message_id: messageId,
      message_type: "notification",
      message_timestamp: "2026-05-30T12:00:00.000Z",
      subscription_type: "channel.follow",
      subscription_version: "2"
    },
    payload: {
      subscription: {
        id: "subscription-1",
        status: "enabled",
        type: "channel.follow",
        version: "2",
        cost: 0,
        condition: {
          broadcaster_user_id: "141981764"
        },
        transport: {
          method: "websocket",
          session_id: "session-1"
        },
        created_at: "2026-05-30T11:59:00.000Z"
      },
      event: {
        user_id: "viewer-1",
        user_login: "viewer",
        user_name: "Viewer"
      }
    }
  };
}

function revocation() {
  return {
    metadata: {
      message_type: "revocation",
      message_timestamp: "2026-05-30T12:00:25.000Z",
      subscription_type: "channel.follow",
      subscription_version: "2"
    },
    payload: {
      subscription: {
        id: "subscription-1",
        status: "authorization_revoked",
        type: "channel.follow",
        version: "2",
        cost: 0,
        condition: {
          broadcaster_user_id: "141981764"
        },
        transport: {
          method: "websocket",
          session_id: "session-1"
        },
        created_at: "2026-05-30T11:59:00.000Z"
      }
    }
  };
}

function createRecordingFetch(responses: Response[]): {
  readonly fetch: typeof fetch;
  readonly requests: { readonly url: string; readonly init: RequestInit }[];
} {
  const requests: { url: string; init: RequestInit }[] = [];
  return {
    requests,
    async fetch(input, init = {}) {
      requests.push({
        url: String(input),
        init
      });
      const response = responses.shift();
      if (response === undefined) {
        throw new Error("No mock response queued");
      }

      return response;
    }
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
