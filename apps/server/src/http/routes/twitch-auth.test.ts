import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  TwitchOAuthProviderError,
  TwitchOAuthStateError,
  type TwitchConnectionStartInput,
  type TwitchOAuthCallbackInput
} from "../../modules/twitch/twitch-oauth-service.js";
import type { TwitchConnectionStatus } from "../../modules/twitch/twitch-account-repository.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("twitch auth routes", () => {
  it("reads status and starts authorization for management sessions", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth();

    const statusResponse = await app.inject({
      method: "GET",
      url: "/twitch/auth/status",
      headers: authHeaders
    });
    const startResponse = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders,
      payload: {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual({
      connected: false,
      account: null
    });
    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json()).toEqual({
      authorizationUrl: "https://id.twitch.tv/oauth2/authorize?state=state-1",
      state: "state-1",
      scopes: ["bits:read"]
    });
    expect(service.startInputs).toEqual([
      {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    ]);
  });

  it("completes callbacks with valid state without management bearer headers", async () => {
    const { app, service } = await createAppWithTwitchAuth();

    const response = await app.inject({
      method: "GET",
      url: "/twitch/auth/callback?code=oauth-code&state=state-1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: true,
      account: {
        accountId: "141981764",
        login: "streamer"
      }
    });
    expect(service.callbackInputs).toEqual([
      {
        code: "oauth-code",
        state: "state-1"
      }
    ]);
  });

  it("returns 400 for invalid callbacks", async () => {
    const { app } = await createAppWithTwitchAuth({
      callbackError: new TwitchOAuthStateError()
    });

    const response = await app.inject({
      method: "GET",
      url: "/twitch/auth/callback?code=oauth-code&state=bad-state"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_OAUTH_STATE_INVALID",
        message: "Invalid Twitch OAuth state"
      }
    });
  });

  it("refreshes and disconnects management-protected Twitch accounts", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth();

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/twitch/auth/refresh",
      headers: authHeaders
    });
    const disconnectResponse = await app.inject({
      method: "POST",
      url: "/twitch/auth/disconnect",
      headers: authHeaders
    });

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.json()).toMatchObject({
      connected: true,
      account: {
        displayName: "Streamer"
      }
    });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.json()).toEqual({
      connected: false,
      account: null
    });
    expect(service.refreshCount).toBe(1);
    expect(service.disconnectCount).toBe(1);
  });

  it("maps provider refresh failures without leaking token values", async () => {
    const { app, authHeaders } = await createAppWithTwitchAuth({
      refreshError: new TwitchOAuthProviderError("Twitch refresh failed")
    });

    const response = await app.inject({
      method: "POST",
      url: "/twitch/auth/refresh",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_OAUTH_PROVIDER_ERROR",
        message: "Twitch refresh failed"
      }
    });
    expect(JSON.stringify(response.json())).not.toContain("refresh-token");
  });

  it("rejects missing management sessions and overlay route keys before protected Twitch auth work", async () => {
    const { app, service } = await createAppWithTwitchAuth();

    const missingSession = await app.inject({
      method: "GET",
      url: "/twitch/auth/status"
    });
    const overlayKey = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: {
        authorization: "Bearer ovl_not-management"
      },
      payload: {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    });

    expect(missingSession.statusCode).toBe(401);
    expect(overlayKey.statusCode).toBe(401);
    expect(service.statusCount).toBe(0);
    expect(service.startInputs).toEqual([]);
  });
  it("rate-limits Twitch authorization start and callback requests before route work", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth({
      maxRequests: 1
    });

    const firstStart = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders,
      payload: {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    });
    const secondStart = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders,
      payload: {
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    });

    expect(firstStart.statusCode).toBe(200);
    expect(secondStart.statusCode).toBe(429);
    expect(service.startInputs).toHaveLength(1);

    const firstCallback = await app.inject({
      method: "GET",
      url: "/twitch/auth/callback?code=oauth-code-1&state=state-1"
    });
    const secondCallback = await app.inject({
      method: "GET",
      url: "/twitch/auth/callback?code=oauth-code-2&state=state-2"
    });

    expect(firstCallback.statusCode).toBe(200);
    expect(secondCallback.statusCode).toBe(429);
    expect(service.callbackInputs).toEqual([
      {
        code: "oauth-code-1",
        state: "state-1"
      }
    ]);
  });
});

async function createAppWithTwitchAuth(
  options: {
    readonly callbackError?: Error | undefined;
    readonly refreshError?: Error | undefined;
    readonly maxRequests?: number | undefined;
  } = {}
) {
  const service = new RecordingTwitchAuthService(options);
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => "mgmt_twitch-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: options.maxRequests ?? 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    twitchAuthService: service,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    },
    service
  };
}

class RecordingTwitchAuthService {
  readonly startInputs: TwitchConnectionStartInput[] = [];
  readonly callbackInputs: TwitchOAuthCallbackInput[] = [];
  disconnectCount = 0;
  refreshCount = 0;
  statusCount = 0;
  readonly #callbackError: Error | undefined;
  readonly #refreshError: Error | undefined;

  constructor(options: { readonly callbackError?: Error | undefined; readonly refreshError?: Error | undefined }) {
    this.#callbackError = options.callbackError;
    this.#refreshError = options.refreshError;
  }

  async getStatus(): Promise<TwitchConnectionStatus> {
    this.statusCount += 1;
    return disconnectedStatus;
  }

  createConnectionStart(input: TwitchConnectionStartInput) {
    this.startInputs.push(input);
    return {
      authorizationUrl: "https://id.twitch.tv/oauth2/authorize?state=state-1",
      state: "state-1",
      scopes: ["bits:read"]
    };
  }

  async completeCallback(input: TwitchOAuthCallbackInput): Promise<TwitchConnectionStatus> {
    this.callbackInputs.push(input);
    if (this.#callbackError !== undefined) {
      throw this.#callbackError;
    }

    return connectedStatus;
  }

  async refreshConnectedAccount(): Promise<TwitchConnectionStatus> {
    this.refreshCount += 1;
    if (this.#refreshError !== undefined) {
      throw this.#refreshError;
    }

    return connectedStatus;
  }

  async disconnect(): Promise<TwitchConnectionStatus> {
    this.disconnectCount += 1;
    return disconnectedStatus;
  }
}

const disconnectedStatus: TwitchConnectionStatus = {
  connected: false,
  account: null
};

const connectedStatus: TwitchConnectionStatus = {
  connected: true,
  account: {
    accountId: "141981764",
    login: "streamer",
    displayName: "Streamer",
    scopes: ["bits:read"],
    connectedAt: "2026-05-30T12:00:00.000Z",
    updatedAt: "2026-05-30T12:00:00.000Z"
  }
};
