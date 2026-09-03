import type { SecretStore, TwitchCustomRewardCatalog } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import {
  TwitchApiHttpError,
  TwitchApiResponseError,
  type TwitchApiClient,
  type TwitchRewardApiClient
} from "./twitch-api-client.js";
import type { TwitchAccount, TwitchAccountRepository, TwitchConnectionStatus } from "./twitch-account-repository.js";
import {
  createTwitchTokenSecretRef,
  TwitchOAuthProviderError,
  TwitchOAuthService
} from "./twitch-oauth-service.js";
import {
  TwitchRewardCatalogError,
  TwitchRewardCatalogService
} from "./twitch-reward-catalog-service.js";

const activeCatalog: TwitchCustomRewardCatalog = {
  rewards: [
    {
      id: "reward-active",
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

const inactiveCatalog: TwitchCustomRewardCatalog = {
  rewards: [
    {
      id: "reward-paused",
      title: "Paused",
      prompt: "",
      cost: 1_000,
      backgroundColor: "#112233",
      isUserInputRequired: true,
      isEnabled: true,
      isPaused: true,
      isInStock: true
    },
    {
      id: "reward-out-of-stock",
      title: "Unavailable",
      prompt: "Not right now",
      cost: 2_000,
      backgroundColor: "#ABCDEF",
      isUserInputRequired: false,
      isEnabled: false,
      isPaused: false,
      isInStock: false
    }
  ]
};

describe("TwitchRewardCatalogService", () => {
  it("returns the connected broadcaster custom reward catalog", async () => {
    const harness = createHarness();

    await expect(harness.service.listCustomRewards()).resolves.toEqual(activeCatalog);

    expect(harness.oauthService.validateConnectedAccount).toHaveBeenCalledWith({ notifyConnectionChanged: false });
    expect(harness.repository.findConnectedAccount).toHaveBeenCalledTimes(1);
    expect(harness.secretStore.getSecret).toHaveBeenCalledWith(
      createTwitchTokenSecretRef("broadcaster-1", "access_token")
    );
    expect(harness.apiClient.getCustomRewards).toHaveBeenCalledWith({
      accessToken: "access-token-1",
      clientId: "client-id",
      broadcasterId: "broadcaster-1"
    });
  });

  it("returns an empty catalog without treating it as an error", async () => {
    const harness = createHarness({ catalog: { rewards: [] } });

    await expect(harness.service.listCustomRewards()).resolves.toEqual({ rewards: [] });
  });

  it("retains paused, disabled, and out-of-stock rewards", async () => {
    const harness = createHarness({ catalog: inactiveCatalog });

    await expect(harness.service.listCustomRewards()).resolves.toEqual(inactiveCatalog);
  });

  it("rejects a disconnected account before reading credentials or calling Twitch", async () => {
    const harness = createHarness({ account: null });

    await expect(harness.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_REWARD_CATALOG_DISCONNECTED"
    });

    expect(harness.secretStore.getSecret).not.toHaveBeenCalled();
    expect(harness.apiClient.getCustomRewards).not.toHaveBeenCalled();
  });

  it("requires channel:read:redemptions before reading credentials or calling Twitch", async () => {
    const harness = createHarness({ scopes: ["bits:read"] });

    await expect(harness.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_REWARD_CATALOG_SCOPE_REQUIRED"
    });

    expect(harness.secretStore.getSecret).not.toHaveBeenCalled();
    expect(harness.apiClient.getCustomRewards).not.toHaveBeenCalled();
  });

  it("requires reconnection when the access-token secret is missing", async () => {
    const harness = createHarness({ accessToken: null });

    await expect(harness.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"
    });

    expect(harness.apiClient.getCustomRewards).not.toHaveBeenCalled();
  });

  it("maps a missing access token to reconnect-required before the real OAuth lifecycle validates", async () => {
    const lifecycle = createRealOAuthLifecycle({
      secretStore: createSecretStore(async () => null)
    });

    await expect(lifecycle.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"
    });

    expect(lifecycle.oauthApiClient.validateCount).toBe(0);
    expect(lifecycle.rewardApiClient.getCustomRewards).not.toHaveBeenCalled();
  });

  it("preserves a secret-store read failure as a provider error with the real OAuth lifecycle", async () => {
    const lifecycle = createRealOAuthLifecycle({
      secretStore: createSecretStore(async () => {
        throw new Error("credential service unavailable");
      })
    });

    await expect(lifecycle.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_OAUTH_PROVIDER_ERROR"
    });

    expect(lifecycle.oauthApiClient.validateCount).toBe(0);
    expect(lifecycle.rewardApiClient.getCustomRewards).not.toHaveBeenCalled();
  });

  it("preserves an initial validation failure without calling the catalog API", async () => {
    const validationError = new TwitchOAuthProviderError("Twitch token validation failed");
    const harness = createHarness({ validationError });

    await expect(harness.service.listCustomRewards()).rejects.toBe(validationError);

    expect(harness.repository.findConnectedAccount).toHaveBeenCalledTimes(1);
    expect(harness.secretStore.getSecret).toHaveBeenCalledTimes(1);
    expect(harness.apiClient.getCustomRewards).not.toHaveBeenCalled();
  });

  it("refreshes once, re-reads account and token, and retries after the first 401", async () => {
    const harness = createHarness({
      accessTokens: ["access-token-1", "access-token-2"],
      catalogResults: [new TwitchApiHttpError(401), activeCatalog]
    });

    await expect(harness.service.listCustomRewards()).resolves.toEqual(activeCatalog);

    expect(harness.apiClient.getCustomRewards).toHaveBeenCalledTimes(2);
    expect(harness.oauthService.refreshConnectedAccount).toHaveBeenCalledTimes(1);
    expect(harness.oauthService.refreshConnectedAccount).toHaveBeenCalledWith({ notifyConnectionChanged: false });
    expect(harness.repository.findConnectedAccount).toHaveBeenCalledTimes(2);
    expect(harness.secretStore.getSecret).toHaveBeenCalledTimes(2);
    expect(harness.secretStore.getSecret).toHaveBeenCalledWith(
      createTwitchTokenSecretRef("broadcaster-1", "access_token")
    );
    expect(harness.apiClient.getCustomRewards).toHaveBeenNthCalledWith(2, {
      accessToken: "access-token-2",
      clientId: "client-id",
      broadcasterId: "broadcaster-1"
    });
  });

  it("preserves refresh failures and does not issue a second catalog call", async () => {
    const refreshError = new TwitchOAuthProviderError("Twitch token refresh failed");
    const harness = createHarness({
      catalogResults: [new TwitchApiHttpError(401)],
      refreshError
    });

    await expect(harness.service.listCustomRewards()).rejects.toBe(refreshError);

    expect(harness.apiClient.getCustomRewards).toHaveBeenCalledTimes(1);
    expect(harness.oauthService.refreshConnectedAccount).toHaveBeenCalledTimes(1);
  });

  it("requires reconnection after a second 401 without making a third call", async () => {
    const harness = createHarness({
      accessTokens: ["access-token-1", "access-token-2"],
      catalogResults: [new TwitchApiHttpError(401), new TwitchApiHttpError(401)]
    });

    await expect(harness.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"
    });

    expect(harness.apiClient.getCustomRewards).toHaveBeenCalledTimes(2);
    expect(harness.oauthService.refreshConnectedAccount).toHaveBeenCalledTimes(1);
  });

  it("maps Twitch 403 to an ineligible broadcaster without refreshing", async () => {
    const harness = createHarness({ catalogResults: [new TwitchApiHttpError(403)] });

    await expect(harness.service.listCustomRewards()).rejects.toMatchObject({
      code: "TWITCH_REWARD_CATALOG_INELIGIBLE"
    });

    expect(harness.oauthService.refreshConnectedAccount).not.toHaveBeenCalled();
  });

  it.each([
    new TwitchApiHttpError(500),
    new TwitchApiResponseError(),
    new Error("network unavailable")
  ])("preserves non-actionable provider failures for bounded route mapping", async (providerError) => {
    const harness = createHarness({ catalogResults: [providerError] });

    await expect(harness.service.listCustomRewards()).rejects.toBe(providerError);

    expect(harness.oauthService.refreshConnectedAccount).not.toHaveBeenCalled();
  });

  it("never includes access or refresh tokens in controlled error messages", async () => {
    const harness = createHarness({
      accessToken: "access-token-secret",
      catalogResults: [new TwitchApiHttpError(401), new TwitchApiHttpError(401)]
    });

    const error = await harness.service.listCustomRewards().then(
      () => null,
      (cause: unknown) => cause
    );

    expect(error).toBeInstanceOf(TwitchRewardCatalogError);
    expect(String(error)).not.toMatch(/access-token-secret|refresh-token-secret/u);
  });
});

interface HarnessOptions {
  readonly accessToken?: string | null;
  readonly accessTokens?: readonly (string | null)[];
  readonly account?: TwitchAccount | null;
  readonly catalog?: TwitchCustomRewardCatalog;
  readonly catalogResults?: readonly (TwitchCustomRewardCatalog | Error)[];
  readonly refreshError?: Error;
  readonly scopes?: readonly string[];
  readonly validationError?: Error;
}

function createHarness(options: HarnessOptions = {}) {
  const account = options.account === undefined
    ? createAccount(options.scopes ?? ["bits:read", "channel:read:redemptions"])
    : options.account;
  const connection = createConnectionStatus(account);
  const repository: TwitchAccountRepository = {
    deleteAccount: vi.fn(),
    findConnectedAccount: vi.fn(async () => account),
    saveAccount: vi.fn(async (savedAccount) => savedAccount)
  };
  const accessTokens = [...(options.accessTokens ?? [options.accessToken === undefined ? "access-token-1" : options.accessToken])];
  const secretStore: SecretStore = {
    deleteSecret: vi.fn(),
    getSecret: vi.fn(async () => accessTokens.shift() ?? null),
    setSecret: vi.fn()
  };
  const oauthService = {
    validateConnectedAccount: vi.fn(async () => {
      if (options.validationError !== undefined) throw options.validationError;
      return { connection, refreshed: false };
    }),
    refreshConnectedAccount: vi.fn(async () => {
      if (options.refreshError !== undefined) throw options.refreshError;
      return connection;
    })
  };
  const catalogResults = [...(options.catalogResults ?? [options.catalog ?? activeCatalog])];
  const apiClient: TwitchRewardApiClient = {
    getCustomRewards: vi.fn(async () => {
      const result = catalogResults.shift();
      if (result instanceof Error) throw result;
      return result ?? activeCatalog;
    })
  };
  const service = new TwitchRewardCatalogService({
    apiClient,
    clientId: "client-id",
    oauthService,
    repository,
    secretStore
  });

  return { apiClient, oauthService, repository, secretStore, service };
}

function createAccount(scopes: readonly string[]): TwitchAccount {
  return {
    accountId: "broadcaster-1",
    login: "streamer",
    displayName: "Streamer",
    scopes,
    connectedAt: "2026-08-27T12:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z"
  };
}

function createConnectionStatus(account: TwitchAccount | null): TwitchConnectionStatus {
  if (account === null) {
    return {
      connected: false,
      authorizationState: "disconnected",
      missingScopes: [],
      account: null
    };
  }

  return {
    connected: true,
    authorizationState: "ready",
    missingScopes: [],
    account
  };
}

function createRealOAuthLifecycle(options: { readonly secretStore: SecretStore }) {
  const repository = new MemoryTwitchAccountRepository(createAccount(["channel:read:redemptions"]));
  const oauthApiClient = new LifecycleTwitchApiClient();
  const oauthService = new TwitchOAuthService({
    apiClient: oauthApiClient,
    clientId: "client-id",
    generateAuthorizationId: () => "authorization-1",
    repository,
    secretStore: options.secretStore
  });
  const rewardApiClient: TwitchRewardApiClient = {
    getCustomRewards: vi.fn(async () => activeCatalog)
  };
  const service = new TwitchRewardCatalogService({
    apiClient: rewardApiClient,
    clientId: "client-id",
    oauthService,
    repository,
    secretStore: options.secretStore
  });

  return { oauthApiClient, rewardApiClient, service };
}

function createSecretStore(getSecret: SecretStore["getSecret"]): SecretStore {
  return {
    deleteSecret: vi.fn(),
    getSecret,
    setSecret: vi.fn()
  };
}

class MemoryTwitchAccountRepository implements TwitchAccountRepository {
  constructor(private account: TwitchAccount | null) {}

  async saveAccount(account: TwitchAccount): Promise<TwitchAccount> {
    this.account = account;
    return account;
  }

  async findConnectedAccount(): Promise<TwitchAccount | null> {
    return this.account;
  }

  async deleteAccount(accountId: string): Promise<void> {
    if (this.account?.accountId === accountId) this.account = null;
  }
}

class LifecycleTwitchApiClient implements TwitchApiClient {
  validateCount = 0;

  async startDeviceAuthorization(): Promise<never> {
    throw new Error("not used");
  }

  async pollDeviceAuthorization(): Promise<never> {
    throw new Error("not used");
  }

  async refreshUserToken(): Promise<never> {
    throw new Error("not used");
  }

  async validateToken(): Promise<never> {
    this.validateCount += 1;
    throw new Error("not used");
  }

  async getCurrentUser(): Promise<never> {
    throw new Error("not used");
  }
}
