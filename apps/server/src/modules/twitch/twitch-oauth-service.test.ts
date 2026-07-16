import type { SecretRef, SecretStore } from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { describe, expect, it } from "vitest";
import type {
  TwitchApiClient,
  TwitchDeviceAuthorizationRequest,
  TwitchDeviceTokenPollResult,
  TwitchDeviceTokenRequest,
  TwitchRefreshTokenRequest,
  TwitchTokenGrant
} from "./twitch-api-client.js";
import type { TwitchAccount, TwitchAccountRepository, TwitchConnectionStatus } from "./twitch-account-repository.js";
import {
  createTwitchTokenSecretRef,
  defaultTwitchOAuthScopes,
  TwitchOAuthService
} from "./twitch-oauth-service.js";

describe("TwitchOAuthService", () => {
  it("starts device authorization with sorted default scopes and keeps deviceCode server-side", async () => {
    const { apiClient, service } = createService();

    const authorization = await service.createConnectionStart();

    expect(apiClient.startRequests).toEqual([
      {
        clientId: "client-id",
        scopes: [...defaultTwitchOAuthScopes].sort()
      }
    ]);
    expect(authorization).toEqual({
      authorizationId: "authorization-1",
      verificationUri: "https://www.twitch.tv/activate",
      userCode: "ABCD-EFGH",
      expiresAt: "2026-05-30T12:10:00.000Z",
      intervalSeconds: 5,
      scopes: [...defaultTwitchOAuthScopes].sort()
    });
    expect(authorization).not.toHaveProperty("deviceCode");
  });

  it("uses injected authorization IDs", async () => {
    const { service } = createService({ generateAuthorizationId: () => "opaque-id" });

    await expect(service.createConnectionStart()).resolves.toMatchObject({ authorizationId: "opaque-id" });
  });

  it("does not poll Twitch before the configured interval", async () => {
    const now = createClock();
    const { apiClient, service } = createService({ now: now.read });
    const authorization = await service.createConnectionStart();

    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).resolves.toEqual({ status: "pending" });

    expect(apiClient.pollRequests).toEqual([]);
  });

  it("advances next poll time after an upstream pending response", async () => {
    const now = createClock();
    const { apiClient, service } = createService({ now: now.read });
    const authorization = await service.createConnectionStart();
    now.advance(5_000);

    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).resolves.toEqual({ status: "pending" });
    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).resolves.toEqual({ status: "pending" });

    expect(apiClient.pollRequests).toEqual([
      {
        clientId: "client-id",
        deviceCode: "device-code-1",
        scopes: [...defaultTwitchOAuthScopes].sort()
      }
    ]);
  });

  it("consumes authorization when Twitch poll rejects", async () => {
    const now = createClock();
    const { apiClient, service } = createService({ now: now.read });
    const upstreamError = new Error("Twitch response was malformed");
    apiClient.pollError = upstreamError;
    const authorization = await service.createConnectionStart();
    now.advance(5_000);

    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toBe(upstreamError);
    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toMatchObject({
      code: "TWITCH_OAUTH_AUTHORIZATION_INVALID"
    });
  });

  it.each([
    ["denied", { code: "TWITCH_OAUTH_DENIED", message: "Twitch authorization was denied" }],
    ["expired", { code: "TWITCH_OAUTH_EXPIRED", message: "Twitch authorization expired" }]
  ] as const)("returns terminal %s result and removes pending authorization", async (upstreamStatus, expected) => {
    const now = createClock();
    const { apiClient, service } = createService({ now: now.read });
    apiClient.pollResult = { status: upstreamStatus };
    const authorization = await service.createConnectionStart();
    now.advance(5_000);

    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).resolves.toEqual({
      status: "failed",
      ...expected
    });
    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toMatchObject({
      code: "TWITCH_OAUTH_AUTHORIZATION_INVALID"
    });
  });

  it("rejects unknown authorization IDs with a controlled client error", async () => {
    const { service } = createService();

    await expect(service.pollConnection({ authorizationId: "missing-id" })).rejects.toMatchObject({
      code: "TWITCH_OAUTH_AUTHORIZATION_INVALID"
    });
  });

  it("stores granted tokens through SecretStore, persists metadata, and notifies connection changes", async () => {
    const now = createClock();
    const notifications: TwitchConnectionStatus[] = [];
    const { apiClient, repository, secretStore, service } = createService({
      now: now.read,
      onConnectionChanged(status) {
        notifications.push(status);
      }
    });
    apiClient.pollResult = { status: "granted", grant: createTokenGrant("1") };
    const authorization = await service.createConnectionStart();
    now.advance(5_000);

    const result = await service.pollConnection({ authorizationId: authorization.authorizationId });

    expect(result).toMatchObject({
      status: "connected",
      connection: {
        connected: true,
        account: {
          accountId: "141981764",
          login: "streamer",
          displayName: "Streamer",
          scopes: defaultTwitchOAuthScopes,
          connectedAt: "2026-05-30T12:00:05.000Z"
        }
      }
    });
    expect(apiClient.validateRequests).toEqual([{ accessToken: "access-token-1" }]);
    expect(apiClient.currentUserRequests).toEqual([{ accessToken: "access-token-1", clientId: "client-id" }]);
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBe("access-token-1");
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "refresh_token"))).resolves.toBe("refresh-token-1");
    expect(JSON.stringify(await repository.findConnectedAccount())).not.toContain("access-token");
    expect(JSON.stringify(await repository.findConnectedAccount())).not.toContain("refresh-token");
    expect(notifications).toHaveLength(1);
    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toMatchObject({
      code: "TWITCH_OAUTH_AUTHORIZATION_INVALID"
    });
  });

  it("refreshes public-client tokens while preserving original connectedAt", async () => {
    const now = createClock();
    const { apiClient, repository, secretStore, service } = createService({ now: now.read });
    apiClient.pollResult = { status: "granted", grant: createTokenGrant("1") };
    const authorization = await service.createConnectionStart();
    now.advance(5_000);
    await service.pollConnection({ authorizationId: authorization.authorizationId });
    now.advance(60_000);

    await expect(service.refreshConnectedAccount()).resolves.toMatchObject({ connected: true });

    expect(apiClient.refreshRequests).toEqual([{ clientId: "client-id", refreshToken: "refresh-token-1" }]);
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBe("access-token-2");
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "refresh_token"))).resolves.toBe("refresh-token-2");
    await expect(repository.findConnectedAccount()).resolves.toMatchObject({
      connectedAt: "2026-05-30T12:00:05.000Z",
      updatedAt: "2026-05-30T12:01:05.000Z"
    });
  });

  it("does not persist metadata or report success when credential storage fails", async () => {
    const now = createClock();
    const repository = new InMemoryTwitchAccountRepository();
    const secretStore = new FailingSecretStore();
    const notifications: TwitchConnectionStatus[] = [];
    const { apiClient, service } = createService({
      now: now.read,
      onConnectionChanged(status) {
        notifications.push(status);
      },
      repository,
      secretStore
    });
    apiClient.pollResult = { status: "granted", grant: createTokenGrant("1") };
    const authorization = await service.createConnectionStart();
    now.advance(5_000);

    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toMatchObject({
      code: "TWITCH_OAUTH_PROVIDER_ERROR"
    });

    await expect(repository.findConnectedAccount()).resolves.toBeNull();
    expect(notifications).toEqual([]);
    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toMatchObject({
      code: "TWITCH_OAUTH_AUTHORIZATION_INVALID"
    });
  });

  it.each(["access_token", "refresh_token", "account"] as const)(
    "restores previous tokens when %s persistence fails",
    async (failurePoint) => {
      const repository = new InMemoryTwitchAccountRepository();
      repository.account = {
        accountId: "141981764",
        login: "streamer",
        displayName: "Streamer",
        scopes: defaultTwitchOAuthScopes,
        connectedAt: "2026-05-30T12:00:00.000Z",
        updatedAt: "2026-05-30T12:00:00.000Z"
      };
      const secretStore = new FailAfterWriteSecretStore();
      const accessRef = createTwitchTokenSecretRef("141981764", "access_token");
      const refreshRef = createTwitchTokenSecretRef("141981764", "refresh_token");
      await secretStore.setSecret(accessRef, "access-token-old");
      await secretStore.setSecret(refreshRef, "refresh-token-old");
      secretStore.failOn = failurePoint === "account" ? null : failurePoint;
      repository.saveError = failurePoint === "account" ? new Error("account save failed") : null;
      const { service } = createService({ repository, secretStore });

      const error = await service.refreshConnectedAccount().then(
        () => null,
        (cause: unknown) => cause
      );

      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("access-token-2");
      expect(String(error)).not.toContain("refresh-token-2");
      await expect(secretStore.getSecret(accessRef)).resolves.toBe("access-token-old");
      await expect(secretStore.getSecret(refreshRef)).resolves.toBe("refresh-token-old");
    }
  );

  it("removes newly introduced tokens when account persistence fails", async () => {
    const now = createClock();
    const repository = new InMemoryTwitchAccountRepository();
    repository.saveError = new Error("account save failed");
    const secretStore = new InMemorySecretStore();
    const { apiClient, service } = createService({ now: now.read, repository, secretStore });
    apiClient.pollResult = { status: "granted", grant: createTokenGrant("1") };
    const authorization = await service.createConnectionStart();
    now.advance(5_000);

    await expect(service.pollConnection({ authorizationId: authorization.authorizationId })).rejects.toThrow("account save failed");

    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "access_token"))).resolves.toBeNull();
    await expect(secretStore.getSecret(createTwitchTokenSecretRef("141981764", "refresh_token"))).resolves.toBeNull();
  });
});

function createService(
  options: {
    readonly generateAuthorizationId?: () => string;
    readonly now?: () => Date;
    readonly onConnectionChanged?: (status: TwitchConnectionStatus) => void | Promise<void>;
    readonly repository?: TwitchAccountRepository;
    readonly secretStore?: SecretStore;
  } = {}
) {
  const apiClient = new FakeTwitchApiClient();
  const repository = options.repository ?? new InMemoryTwitchAccountRepository();
  const secretStore = options.secretStore ?? new InMemorySecretStore();
  const service = new TwitchOAuthService({
    apiClient,
    clientId: "client-id",
    generateAuthorizationId: options.generateAuthorizationId ?? (() => "authorization-1"),
    now: options.now ?? (() => new Date("2026-05-30T12:00:00.000Z")),
    ...(options.onConnectionChanged === undefined ? {} : { onConnectionChanged: options.onConnectionChanged }),
    repository,
    secretStore
  });

  return { apiClient, repository, secretStore, service };
}

function createClock() {
  let nowMs = Date.parse("2026-05-30T12:00:00.000Z");
  return {
    advance(milliseconds: number) {
      nowMs += milliseconds;
    },
    read: () => new Date(nowMs)
  };
}

function createTokenGrant(suffix: string): TwitchTokenGrant {
  return {
    accessToken: `access-token-${suffix}`,
    refreshToken: `refresh-token-${suffix}`,
    expiresIn: 14_400,
    scopes: defaultTwitchOAuthScopes,
    tokenType: "bearer"
  };
}

class FakeTwitchApiClient implements TwitchApiClient {
  readonly currentUserRequests: { readonly accessToken: string; readonly clientId: string }[] = [];
  readonly pollRequests: TwitchDeviceTokenRequest[] = [];
  readonly refreshRequests: TwitchRefreshTokenRequest[] = [];
  readonly startRequests: TwitchDeviceAuthorizationRequest[] = [];
  readonly validateRequests: { readonly accessToken: string }[] = [];
  pollError: Error | undefined;
  pollResult: TwitchDeviceTokenPollResult = { status: "pending" };

  async startDeviceAuthorization(input: TwitchDeviceAuthorizationRequest) {
    this.startRequests.push(input);
    return {
      deviceCode: "device-code-1",
      userCode: "ABCD-EFGH",
      verificationUri: "https://www.twitch.tv/activate",
      expiresIn: 600,
      interval: 5
    };
  }

  async pollDeviceAuthorization(input: TwitchDeviceTokenRequest): Promise<TwitchDeviceTokenPollResult> {
    this.pollRequests.push(input);
    if (this.pollError !== undefined) {
      throw this.pollError;
    }
    return this.pollResult;
  }

  async refreshUserToken(input: TwitchRefreshTokenRequest): Promise<TwitchTokenGrant> {
    this.refreshRequests.push(input);
    return createTokenGrant("2");
  }

  async validateToken(input: { readonly accessToken: string }) {
    this.validateRequests.push(input);
    return {
      clientId: "client-id",
      login: "streamer",
      scopes: defaultTwitchOAuthScopes,
      userId: "141981764",
      expiresIn: 14_000
    };
  }

  async getCurrentUser(input: { readonly accessToken: string; readonly clientId: string }) {
    this.currentUserRequests.push(input);
    return {
      id: "141981764",
      login: "streamer",
      displayName: "Streamer"
    };
  }
}

class InMemoryTwitchAccountRepository implements TwitchAccountRepository {
  account: TwitchAccount | null = null;
  saveError: Error | null = null;

  async saveAccount(account: TwitchAccount): Promise<TwitchAccount> {
    if (this.saveError !== null) {
      throw this.saveError;
    }
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

class FailingSecretStore implements SecretStore {
  async setSecret(): Promise<void> {
    throw new Error("credential store unavailable");
  }

  async getSecret(): Promise<string | null> {
    return null;
  }

  async deleteSecret(): Promise<void> {
    return;
  }
}

class FailAfterWriteSecretStore extends InMemorySecretStore {
  failOn: "access_token" | "refresh_token" | null = null;

  override async setSecret(ref: SecretRef, value: string): Promise<void> {
    await super.setSecret(ref, value);
    if (ref.name === this.failOn) {
      this.failOn = null;
      throw new Error(`credential store rejected ${value}`);
    }
  }
}
