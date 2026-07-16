import type { LogContext, Logger } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  TwitchOAuthAuthorizationError,
  TwitchOAuthProviderError
} from "../../modules/twitch/twitch-oauth-service.js";
import type { TwitchConnectionStatus } from "../../modules/twitch/twitch-account-repository.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

describe("twitch auth routes", () => {
  it("starts device authorization for management sessions and awaits the service", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth();

    const response = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(startResult);
    expect(service.startCount).toBe(1);
  });

  it("polls device authorization with a non-empty opaque ID", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth();

    const response = await app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: authHeaders,
      payload: { authorizationId: "opaque-local-id" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "pending" });
    expect(service.pollInputs).toEqual([{ authorizationId: "opaque-local-id" }]);
  });

  it("rejects invalid device authorization IDs before polling", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth();

    const response = await app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: authHeaders,
      payload: { authorizationId: " " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_TWITCH_AUTH_POLL_REQUEST",
        message: "Invalid Twitch auth poll request"
      }
    });
    expect(service.pollInputs).toEqual([]);
  });

  it("maps unknown device authorization IDs to 400", async () => {
    const { app, authHeaders } = await createAppWithTwitchAuth({
      pollError: new TwitchOAuthAuthorizationError()
    });

    const response = await app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: authHeaders,
      payload: { authorizationId: "unknown-local-id" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_OAUTH_AUTHORIZATION_INVALID",
        message: "Invalid Twitch device authorization"
      }
    });
  });

  it("protects start and poll from missing management sessions", async () => {
    const { app, service } = await createAppWithTwitchAuth();

    const start = await app.inject({ method: "POST", url: "/twitch/auth/start" });
    const poll = await app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      payload: { authorizationId: "opaque-local-id" }
    });

    expect(start.statusCode).toBe(401);
    expect(poll.statusCode).toBe(401);
    expect(service.startCount).toBe(0);
    expect(service.pollInputs).toEqual([]);
  });

  it("rate-limits start and poll before service work", async () => {
    const startApp = await createAppWithTwitchAuth({ maxRequests: 1 });
    const firstStart = await startApp.app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: startApp.authHeaders
    });
    const secondStart = await startApp.app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: startApp.authHeaders
    });
    const pollApp = await createAppWithTwitchAuth({ maxRequests: 1 });
    const firstPoll = await pollApp.app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: pollApp.authHeaders,
      payload: { authorizationId: "opaque-local-id" }
    });
    const secondPoll = await pollApp.app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: pollApp.authHeaders,
      payload: { authorizationId: "opaque-local-id" }
    });

    expect(firstStart.statusCode).toBe(200);
    expect(secondStart.statusCode).toBe(429);
    expect(startApp.service.startCount).toBe(1);
    expect(firstPoll.statusCode).toBe(200);
    expect(secondPoll.statusCode).toBe(429);
    expect(pollApp.service.pollInputs).toEqual([{ authorizationId: "opaque-local-id" }]);
  });

  it("maps device provider failures to 502 without token data", async () => {
    const { app, authHeaders } = await createAppWithTwitchAuth({
      startError: new TwitchOAuthProviderError("Twitch device authorization failed"),
      pollError: new TwitchOAuthProviderError("Twitch device poll failed")
    });

    const start = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders
    });
    const poll = await app.inject({
      method: "POST",
      url: "/twitch/auth/poll",
      headers: authHeaders,
      payload: { authorizationId: "opaque-local-id" }
    });

    expect(start.statusCode).toBe(502);
    expect(poll.statusCode).toBe(502);
    expect(JSON.stringify(start.json())).not.toContain("access-token");
    expect(JSON.stringify(poll.json())).not.toContain("refresh-token");
  });

  it("sanitizes provider errors in Twitch responses and runtime logs", async () => {
    const tokenLikeValue = "access-token-secret-value";
    const { app, authHeaders, logs } = await createAppWithTwitchAuth({
      startError: createCodedError("TWITCH_API_REQUEST_FAILED", `Twitch failed with ${tokenLikeValue}`)
    });

    const response = await app.inject({
      method: "POST",
      url: "/twitch/auth/start",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_API_REQUEST_FAILED",
        message: "Twitch API request failed"
      }
    });
    expect(JSON.stringify(response.json())).not.toContain(tokenLikeValue);
    expect(JSON.stringify(logs)).not.toContain(tokenLikeValue);
    expect(logs).toEqual([
      expect.objectContaining({
        correlationId: expect.any(String),
        metadata: expect.objectContaining({
          errorCode: "TWITCH_API_REQUEST_FAILED",
          errorName: "Error",
          outcome: "failed",
          provider: "twitch"
        })
      })
    ]);
  });

  it("does not register callback routes or invoke OAuth callback work", async () => {
    const { app, service } = await createAppWithTwitchAuth();

    const response = await app.inject({
      method: "GET",
      url: "/twitch/auth/callback?code=oauth-code&state=state-1"
    });

    expect(response.statusCode).toBe(404);
    expect(service.startCount).toBe(0);
    expect(service.pollInputs).toEqual([]);
  });

  it("refreshes and disconnects management-protected Twitch accounts", async () => {
    const { app, authHeaders, service } = await createAppWithTwitchAuth();

    const refreshResponse = await app.inject({ method: "POST", url: "/twitch/auth/refresh", headers: authHeaders });
    const disconnectResponse = await app.inject({ method: "POST", url: "/twitch/auth/disconnect", headers: authHeaders });

    expect(refreshResponse.statusCode).toBe(200);
    expect(disconnectResponse.statusCode).toBe(200);
    expect(service.refreshCount).toBe(1);
    expect(service.disconnectCount).toBe(1);
  });
});

async function createAppWithTwitchAuth(
  options: {
    readonly maxRequests?: number | undefined;
    readonly pollError?: Error | undefined;
    readonly startError?: Error | undefined;
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
  const runtimeLogger = new RecordingLogger();
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "1.2.3" },
    twitchAuthService: service,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    runtimeLogger
  });

  return { app, authHeaders: { authorization: `Bearer ${session.id}` }, logs: runtimeLogger.entries, service };
}

class RecordingLogger implements Logger {
  readonly entries: LogContext[] = [];

  async debug(_message: string, context: LogContext): Promise<void> {
    this.entries.push(context);
  }

  async info(_message: string, context: LogContext): Promise<void> {
    this.entries.push(context);
  }

  async warn(_message: string, context: LogContext): Promise<void> {
    this.entries.push(context);
  }

  async error(_message: string, context: LogContext): Promise<void> {
    this.entries.push(context);
  }
}

class RecordingTwitchAuthService {
  readonly pollInputs: { readonly authorizationId: string }[] = [];
  disconnectCount = 0;
  refreshCount = 0;
  startCount = 0;
  readonly #pollError: Error | undefined;
  readonly #startError: Error | undefined;

  constructor(options: { readonly pollError?: Error | undefined; readonly startError?: Error | undefined }) {
    this.#pollError = options.pollError;
    this.#startError = options.startError;
  }

  async getStatus(): Promise<TwitchConnectionStatus> {
    return disconnectedStatus;
  }

  async createConnectionStart() {
    this.startCount += 1;
    if (this.#startError !== undefined) throw this.#startError;
    return startResult;
  }

  async pollConnection(input: { readonly authorizationId: string }) {
    this.pollInputs.push(input);
    if (this.#pollError !== undefined) throw this.#pollError;
    return { status: "pending" as const };
  }

  async refreshConnectedAccount(): Promise<TwitchConnectionStatus> {
    this.refreshCount += 1;
    return connectedStatus;
  }

  async disconnect(): Promise<TwitchConnectionStatus> {
    this.disconnectCount += 1;
    return disconnectedStatus;
  }
}

const startResult = {
  authorizationId: "opaque-local-id",
  verificationUri: "https://www.twitch.tv/activate",
  userCode: "ABCD-EFGH",
  expiresAt: "2026-05-30T12:10:00.000Z",
  intervalSeconds: 5,
  scopes: ["bits:read"]
};

function createCodedError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}

const disconnectedStatus: TwitchConnectionStatus = { connected: false, account: null };

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
