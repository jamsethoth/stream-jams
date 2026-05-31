import type { SecretRef, SecretStore } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import type {
  TwitchApiClient,
  TwitchAuthorizationCodeRequest,
  TwitchRefreshTokenRequest,
  TwitchTokenGrant
} from "./twitch-api-client.js";
import type { TwitchAccount, TwitchAccountRepository, TwitchConnectionStatus } from "./twitch-account-repository.js";
import {
  createTwitchTokenSecretRef,
  defaultTwitchOAuthScopes,
  TwitchOAuthService,
  TwitchOAuthStateError
} from "./twitch-oauth-service.js";

describe("TwitchOAuthService", () => {
  it("generates authorization-code URLs with state and MVP scopes", () => {
    const { service } = createService();

    const authorization = service.createConnectionStart({
      redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
    });
    const url = new URL(authorization.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:39187/twitch/auth/callback");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(defaultTwitchOAuthScopes);
    expect(authorization.scopes).toEqual(defaultTwitchOAuthScopes);
  });

  it("rejects callback state mismatches before token exchange", async () => {
    const { apiClient, service } = createService();

    await expect(service.completeCallback({ code: "oauth-code", state: "missing-state" })).rejects.toBeInstanceOf(
      TwitchOAuthStateError
    );

    expect(apiClient.exchangeRequests).toEqual([]);
  });

  it("stores OAuth tokens through SecretStore and persists only non-secret account metadata", async () => {
    const { apiClient, repository, secretStore, service } = createService();
    const authorization = service.createConnectionStart({
      redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
    });

    const status = await service.completeCallback({
      code: "oauth-code",
      state: authorization.state
    });

    expect(apiClient.exchangeRequests).toEqual([
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "oauth-code",
        redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
      }
    ]);
    expect(status).toMatchObject({
      connected: true,
      account: {
        accountId: "141981764",
        login: "streamer",
        displayName: "Streamer",
        scopes: defaultTwitchOAuthScopes
      }
    });
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBe(
      "access-token-1"
    );
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "refresh_token"))).resolves.toBe(
      "refresh-token-1"
    );
    expect(JSON.stringify(await repository.findConnectedAccount())).not.toContain("access-token");
    expect(JSON.stringify(await repository.findConnectedAccount())).not.toContain("refresh-token");
  });

  it("refreshes connected accounts and rotates stored token secrets", async () => {
    const { apiClient, secretStore, service } = createService();
    const authorization = service.createConnectionStart({
      redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
    });
    await service.completeCallback({ code: "oauth-code", state: authorization.state });

    const refreshed = await service.refreshConnectedAccount();

    expect(refreshed.connected).toBe(true);
    expect(apiClient.refreshRequests).toEqual([
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token-1"
      }
    ]);
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBe(
      "access-token-2"
    );
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "refresh_token"))).resolves.toBe(
      "refresh-token-2"
    );
  });

  it("disconnects accounts by deleting token secrets and metadata", async () => {
    const { repository, secretStore, service } = createService();
    const authorization = service.createConnectionStart({
      redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
    });
    await service.completeCallback({ code: "oauth-code", state: authorization.state });

    const status = await service.disconnect();

    expect(status).toEqual({
      connected: false,
      account: null
    });
    await expect(repository.findConnectedAccount()).resolves.toBeNull();
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBeNull();
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "refresh_token"))).resolves.toBeNull();
  });
  it("notifies connection lifecycle hooks after account connection changes", async () => {
    const notifications: TwitchConnectionStatus[] = [];
    const { service } = createService({
      onConnectionChanged(status) {
        notifications.push(status);
      }
    });
    const authorization = service.createConnectionStart({
      redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
    });

    await service.completeCallback({ code: "oauth-code", state: authorization.state });
    await service.refreshConnectedAccount();
    await service.disconnect();

    expect(notifications.map((status) => status.connected)).toEqual([true, true, false]);
    expect(notifications[0]).toMatchObject({
      connected: true,
      account: {
        accountId: "141981764",
        scopes: defaultTwitchOAuthScopes
      }
    });
    expect(notifications[2]).toEqual({
      connected: false,
      account: null
    });
  });
  it("removes prior account token secrets when a different broadcaster connects", async () => {
    const { repository, secretStore, service } = createService();
    await repository.saveAccount({
      accountId: "old-id",
      login: "oldstreamer",
      displayName: "Old Streamer",
      scopes: ["bits:read"],
      connectedAt: "2026-05-30T11:00:00.000Z",
      updatedAt: "2026-05-30T11:00:00.000Z"
    });
    await secretStore.setSecret(createTwitchTokenSecretRef("old-id", "access_token"), "old-access");
    await secretStore.setSecret(createTwitchTokenSecretRef("old-id", "refresh_token"), "old-refresh");
    const authorization = service.createConnectionStart({
      redirectUri: "http://127.0.0.1:39187/twitch/auth/callback"
    });

    const status = await service.completeCallback({
      code: "oauth-code",
      state: authorization.state
    });

    expect(status).toMatchObject({
      connected: true,
      account: {
        accountId: "141981764"
      }
    });
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("old-id", "access_token"))).resolves.toBeNull();
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("old-id", "refresh_token"))).resolves.toBeNull();
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBe("access-token-1");
  });
});

function createService(options: { readonly onConnectionChanged?: (status: TwitchConnectionStatus) => void | Promise<void> } = {}) {
  const apiClient = new FakeTwitchApiClient();
  const repository = new InMemoryTwitchAccountRepository();
  const secretStore = new InMemorySecretStore();
  const service = new TwitchOAuthService({
    apiClient,
    clientId: "client-id",
    clientSecret: "client-secret",
    generateState: () => "state-1",
    now: () => new Date("2026-05-30T12:00:00.000Z"),
    ...(options.onConnectionChanged === undefined ? {} : { onConnectionChanged: options.onConnectionChanged }),
    repository,
    secretStore
  });

  return {
    apiClient,
    repository,
    secretStore,
    service
  };
}

class FakeTwitchApiClient implements TwitchApiClient {
  readonly exchangeRequests: TwitchAuthorizationCodeRequest[] = [];
  readonly refreshRequests: TwitchRefreshTokenRequest[] = [];

  async exchangeAuthorizationCode(input: TwitchAuthorizationCodeRequest): Promise<TwitchTokenGrant> {
    this.exchangeRequests.push(input);
    return {
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      expiresIn: 14_400,
      scopes: defaultTwitchOAuthScopes,
      tokenType: "bearer"
    };
  }

  async refreshUserToken(input: TwitchRefreshTokenRequest): Promise<TwitchTokenGrant> {
    this.refreshRequests.push(input);
    return {
      accessToken: "access-token-2",
      refreshToken: "refresh-token-2",
      expiresIn: 14_000,
      scopes: defaultTwitchOAuthScopes,
      tokenType: "bearer"
    };
  }

  async validateToken() {
    return {
      clientId: "client-id",
      login: "streamer",
      scopes: defaultTwitchOAuthScopes,
      userId: "141981764",
      expiresIn: 14_000
    };
  }

  async getCurrentUser() {
    return {
      id: "141981764",
      login: "streamer",
      displayName: "Streamer"
    };
  }
}

class InMemoryTwitchAccountRepository implements TwitchAccountRepository {
  account: TwitchAccount | null = null;

  async saveAccount(account: TwitchAccount): Promise<TwitchAccount> {
    this.account = account;
    return account;
  }

  async findConnectedAccount(): Promise<TwitchAccount | null> {
    return this.account;
  }

  async deleteAccount(accountId: string): Promise<void> {
    if (this.account?.accountId === accountId) {
      this.account = null;
    }
  }
}

class InMemorySecretStore implements SecretStore {
  readonly #secrets = new Map<string, string>();

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    this.#secrets.set(secretKey(ref), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    return this.#secrets.get(secretKey(ref)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    this.#secrets.delete(secretKey(ref));
  }
}

function secretKey(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}
