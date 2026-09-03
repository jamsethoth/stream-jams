import type { LogContext, Logger, TwitchCustomRewardCatalog } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import {
  DefaultTwitchApiClient,
  TwitchApiHttpError,
  TwitchApiResponseError
} from "../../modules/twitch/twitch-api-client.js";
import type { TwitchAccount, TwitchAccountRepository } from "../../modules/twitch/twitch-account-repository.js";
import { TwitchOAuthProviderError, TwitchOAuthService } from "../../modules/twitch/twitch-oauth-service.js";
import {
  TwitchRewardCatalogError,
  TwitchRewardCatalogService
} from "../../modules/twitch/twitch-reward-catalog-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

const catalog: TwitchCustomRewardCatalog = {
  rewards: [
    {
      id: "reward-1",
      title: "Hydrate",
      prompt: "Drink water",
      cost: 500,
      backgroundColor: "#00AAFF",
      isUserInputRequired: false,
      isEnabled: true,
      isPaused: false,
      isInStock: true
    }
  ]
};

describe("twitch reward catalog routes", () => {
  it("returns the strict custom reward catalog for management sessions", async () => {
    const { app, authHeaders, service } = await createAppWithCatalog();

    const response = await app.inject({
      method: "GET",
      url: "/twitch/custom-rewards",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(catalog);
    expect(service.listCount).toBe(1);
  });

  it("rejects missing management sessions before service invocation", async () => {
    const { app, service } = await createAppWithCatalog();

    const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards" });

    expect(response.statusCode).toBe(401);
    expect(service.listCount).toBe(0);
  });

  it("applies the management rate limit before repeated service work", async () => {
    const { app, authHeaders, service } = await createAppWithCatalog({ maxRequests: 1 });

    const first = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });
    const second = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(service.listCount).toBe(1);
  });

  it.each([
    ["TWITCH_REWARD_CATALOG_DISCONNECTED", 409],
    ["TWITCH_REWARD_CATALOG_SCOPE_REQUIRED", 409],
    ["TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED", 409],
    ["TWITCH_REWARD_CATALOG_INELIGIBLE", 422]
  ] as const)("maps %s to its bounded HTTP response", async (code, statusCode) => {
    const tokenLikeValue = "access-token-secret-value";
    const { app, authHeaders, logs } = await createAppWithCatalog({
      error: new TwitchRewardCatalogError(code, `unsafe details ${tokenLikeValue}`)
    });

    const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({
      error: {
        code,
        message: expect.any(String)
      }
    });
    expect(JSON.stringify(response.json())).not.toContain(tokenLikeValue);
    expect(JSON.stringify(logs)).not.toContain(tokenLikeValue);
  });

  it.each([
    new TwitchApiHttpError(500),
    new TwitchApiResponseError(),
    new TwitchOAuthProviderError("unsafe refresh-token-secret-value")
  ])("maps known provider and response failures to one sanitized 502 code", async (error) => {
    const { app, authHeaders, logs } = await createAppWithCatalog({ error });

    const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_REWARD_CATALOG_PROVIDER_ERROR",
        message: "Twitch custom rewards are temporarily unavailable"
      }
    });
    expect(JSON.stringify(response.json())).not.toMatch(/access-token|refresh-token/u);
    expect(JSON.stringify(logs)).not.toMatch(/access-token|refresh-token/u);
  });

  it("rejects an invalid service response without returning unknown provider fields", async () => {
    const { app, authHeaders } = await createAppWithCatalog({
      result: {
        ...catalog,
        image: "https://provider.invalid/private-image.png"
      }
    });

    const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_REWARD_CATALOG_PROVIDER_ERROR",
        message: "Twitch custom rewards are temporarily unavailable"
      }
    });
    expect(response.body).not.toContain("provider.invalid");
  });

  it("maps a rejected provider fetch through the real client and service path to a bounded 502", async () => {
    const tokenLikeValue = "access-token-secret-value";
    const account: TwitchAccount = {
      accountId: "broadcaster-1",
      login: "streamer",
      displayName: "Streamer",
      scopes: ["channel:read:redemptions"],
      connectedAt: "2026-08-27T12:00:00.000Z",
      updatedAt: "2026-08-27T12:00:00.000Z"
    };
    const repository: TwitchAccountRepository = {
      deleteAccount: async () => {},
      findConnectedAccount: async () => account,
      saveAccount: async (savedAccount) => savedAccount
    };
    const service = new TwitchRewardCatalogService({
      apiClient: new DefaultTwitchApiClient({
        fetch: async () => {
          throw new Error(`network failure containing ${tokenLikeValue}`);
        }
      }),
      clientId: "client-id",
      oauthService: {
        refreshConnectedAccount: async () => {
          throw new Error("refresh must not be called");
        },
        validateConnectedAccount: async () => ({
          connection: {
            connected: true,
            authorizationState: "ready",
            missingScopes: [],
            account
          },
          refreshed: false
        })
      },
      repository,
      secretStore: {
        deleteSecret: async () => {},
        getSecret: async () => tokenLikeValue,
        setSecret: async () => {}
      }
    });
    const { app, authHeaders, logs } = await createProtectedCatalogApp(service);

    const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "TWITCH_REWARD_CATALOG_PROVIDER_ERROR",
        message: "Twitch custom rewards are temporarily unavailable"
      }
    });
    expect(JSON.stringify(response.json())).not.toContain(tokenLikeValue);
    expect(JSON.stringify(logs)).not.toContain(tokenLikeValue);
  });

  it("leaves unknown failures to the global 500 boundary", async () => {
    const { app, authHeaders } = await createAppWithCatalog({ error: new Error("unexpected failure") });

    const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("unexpected failure");
  });

  describe.each(["initial validation", "catalog authorization"] as const)("refresh during %s", (stage) => {
    it.each([
      [400, 409, "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"],
      [401, 409, "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"],
      [503, 502, "TWITCH_REWARD_CATALOG_PROVIDER_ERROR"]
    ] as const)("maps refresh HTTP %i to HTTP %i with %s", async (refreshStatus, expectedStatus, expectedCode) => {
      const tokenLikeValue = "refresh-token-secret-value";
      const account: TwitchAccount = {
        accountId: "broadcaster-1",
        login: "streamer",
        displayName: "Streamer",
        scopes: ["channel:read:redemptions"],
        connectedAt: "2026-08-27T12:00:00.000Z",
        updatedAt: "2026-08-27T12:00:00.000Z"
      };
      const repository: TwitchAccountRepository = {
        deleteAccount: async () => {},
        findConnectedAccount: async () => account,
        saveAccount: async (savedAccount) => savedAccount
      };
      const secretStore = {
        deleteSecret: async () => {},
        getSecret: async () => tokenLikeValue,
        setSecret: async () => {}
      };
      const paths: string[] = [];
      const apiClient = new DefaultTwitchApiClient({
        fetch: async (input) => {
          const path = new URL(String(input)).pathname;
          paths.push(path);
          if (path === "/oauth2/validate" && stage === "catalog authorization") {
            return Response.json({
              client_id: "client-id",
              login: account.login,
              scopes: account.scopes,
              user_id: account.accountId,
              expires_in: 3_600
            });
          }
          if (path === "/oauth2/token") {
            return Response.json({ message: `Invalid refresh token: ${tokenLikeValue}` }, { status: refreshStatus });
          }
          return Response.json({ message: "Invalid OAuth token" }, { status: 401 });
        }
      });
      const oauthService = new TwitchOAuthService({
        apiClient,
        clientId: "client-id",
        generateAuthorizationId: () => "authorization-1",
        repository,
        secretStore
      });
      const service = new TwitchRewardCatalogService({
        apiClient,
        clientId: "client-id",
        oauthService,
        repository,
        secretStore
      });
      const { app, authHeaders, logs } = await createProtectedCatalogApp(service);

      try {
        const response = await app.inject({ method: "GET", url: "/twitch/custom-rewards", headers: authHeaders });

        expect(response.statusCode).toBe(expectedStatus);
        expect(response.json().error.code).toBe(expectedCode);
        expect(paths).toEqual(stage === "initial validation"
          ? ["/oauth2/validate", "/oauth2/token"]
          : ["/oauth2/validate", "/helix/channel_points/custom_rewards", "/oauth2/token"]);
        expect(response.body).not.toContain(tokenLikeValue);
        expect(JSON.stringify(logs)).not.toContain(tokenLikeValue);
      } finally {
        await app.close();
      }
    });
  });
});

async function createAppWithCatalog(
  options: {
    readonly error?: Error;
    readonly maxRequests?: number;
    readonly result?: unknown;
  } = {}
) {
  const service = new RecordingRewardCatalogService(options.result ?? catalog, options.error);
  return {
    ...(await createProtectedCatalogApp(service, options.maxRequests)),
    service
  };
}

async function createProtectedCatalogApp(
  twitchRewardCatalogService: Pick<TwitchRewardCatalogService, "listCustomRewards">,
  maxRequests = 100
) {
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-08-27T12:00:00.000Z"),
    generateId: () => "mgmt_twitch-rewards-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests,
    windowMs: 60_000,
    clock: () => new Date("2026-08-27T12:00:00.000Z")
  });
  const runtimeLogger = new RecordingLogger();
  const app = createServerApp({
    metadata: { appName: "stream-jams", version: "1.2.3" },
    twitchRewardCatalogService,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    runtimeLogger
  });

  return {
    app,
    authHeaders: { authorization: `Bearer ${session.id}` },
    logs: runtimeLogger.entries
  };
}

class RecordingRewardCatalogService {
  listCount = 0;

  constructor(
    readonly result: unknown,
    readonly error: Error | undefined
  ) {}

  async listCustomRewards(): Promise<TwitchCustomRewardCatalog> {
    this.listCount += 1;
    if (this.error !== undefined) throw this.error;
    return this.result as TwitchCustomRewardCatalog;
  }
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
