import { describe, expect, it } from "vitest";
import {
  buildTwitchEventSubSubscriptionRequests,
  DefaultTwitchEventSubApiClient,
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
      message: "Twitch EventSub subscription was revoked: authorization_revoked"
    });

    harness.sockets[1]?.emitClose({ reason: "network lost" });
    expect(harness.client.getStatus()).toMatchObject({
      state: "reconnecting",
      message: "network lost"
    });
    expect(harness.scheduled).toEqual([1_000]);

    harness.runScheduled();
    expect(harness.openedUrls.at(-1)).toBe("wss://eventsub.wss.twitch.tv/ws");
  });
});

function createClientHarness() {
  const sockets: FakeSocket[] = [];
  const openedUrls: string[] = [];
  const scheduled: number[] = [];
  const scheduledCallbacks: (() => void)[] = [];
  const apiClient = new RecordingEventSubApiClient();
  const notifications: { readonly metadata: { readonly message_id: string } }[] = [];
  const client = new TwitchEventSubClient({
    apiClient,
    socketFactory(url) {
      openedUrls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    onNotification(message) {
      notifications.push(message as { readonly metadata: { readonly message_id: string } });
    },
    schedule(callback, delayMs) {
      scheduled.push(delayMs);
      scheduledCallbacks.push(callback);
    },
    now: () => new Date("2026-05-30T12:00:30.000Z")
  });

  return {
    apiClient,
    client,
    notifications,
    openedUrls,
    runScheduled() {
      scheduledCallbacks.shift()?.();
    },
    scheduled,
    sockets
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

  async createSubscription(input: Parameters<DefaultTwitchEventSubApiClient["createSubscription"]>[0]) {
    this.requests.push(input);
    return {
      id: "created-" + input.subscription.type,
      status: "enabled",
      type: input.subscription.type
    };
  }
}

class FakeSocket {
  readonly #listeners = {
    message: [] as ((event: { readonly data: unknown }) => void)[],
    close: [] as ((event: { readonly code?: number; readonly reason?: string }) => void)[],
    error: [] as ((event: unknown) => void)[]
  };

  addEventListener(event: "open", _listener: () => void): void;
  addEventListener(event: "message", listener: (event: { readonly data: unknown }) => void): void;
  addEventListener(event: "close", listener: (event: { readonly code?: number; readonly reason?: string }) => void): void;
  addEventListener(event: "error", listener: (event: unknown) => void): void;
  addEventListener(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event !== "open") {
      this.#listeners[event].push(listener as never);
    }
  }

  close(): void {}

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
