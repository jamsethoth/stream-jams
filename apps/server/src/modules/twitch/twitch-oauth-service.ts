import type { SecretRef, SecretStore } from "@stream-jams/core";
import { runtimeSecretStoreUnavailableMessage } from "../security/runtime-secret-store.js";
import {
  TwitchApiHttpError,
  type TwitchApiClient,
  type TwitchDeviceTokenPollResult,
  type TwitchTokenGrant,
  type TwitchValidatedToken
} from "./twitch-api-client.js";
import {
  toTwitchConnectionStatus,
  type TwitchAccount,
  type TwitchAccountRepository,
  type TwitchConnectionStatus
} from "./twitch-account-repository.js";

export const defaultTwitchClientId = "r6jy78npqxcqe68xpsctkcecti6ba3";

export const defaultTwitchOAuthScopes = [
  "bits:read",
  "channel:read:hype_train",
  "channel:read:polls",
  "channel:read:predictions",
  "channel:read:redemptions",
  "channel:read:subscriptions",
  "moderator:read:followers"
] as const;

export type TwitchTokenSecretName = "access_token" | "refresh_token";

export interface TwitchConnectionStartResult {
  readonly authorizationId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
  readonly scopes: readonly string[];
}

export interface TwitchConnectionPollInput {
  readonly authorizationId: string;
}

export type TwitchConnectionPollResult =
  | { readonly status: "pending" }
  | { readonly status: "connected"; readonly connection: TwitchConnectionStatus }
  | {
      readonly status: "failed";
      readonly code: "TWITCH_OAUTH_DENIED" | "TWITCH_OAUTH_EXPIRED";
      readonly message: string;
    };

export interface TwitchOAuthServiceOptions {
  readonly apiClient: TwitchApiClient;
  readonly clientId: string;
  readonly assertSecretStoreAvailable?: (() => void) | undefined;
  readonly generateAuthorizationId: () => string;
  readonly now?: (() => Date) | undefined;
  readonly onConnectionChanged?: ((status: TwitchConnectionStatus) => void | Promise<void>) | undefined;
  readonly repository: TwitchAccountRepository;
  readonly scopes?: readonly string[] | undefined;
  readonly secretStore: SecretStore;
}

interface PendingDeviceAuthorization {
  readonly deviceCode: string;
  readonly scopes: readonly string[];
  readonly expiresAtMs: number;
  readonly intervalMs: number;
  nextPollAtMs: number;
}

export class TwitchOAuthAuthorizationError extends Error {
  readonly code = "TWITCH_OAUTH_AUTHORIZATION_INVALID";

  constructor() {
    super("Invalid Twitch device authorization");
    this.name = "TwitchOAuthAuthorizationError";
  }
}

export class TwitchOAuthProviderError extends Error {
  readonly code = "TWITCH_OAUTH_PROVIDER_ERROR";

  constructor(message = "Twitch OAuth provider response was invalid") {
    super(message);
    this.name = "TwitchOAuthProviderError";
  }
}

export class TwitchOAuthService {
  readonly #apiClient: TwitchApiClient;
  readonly #assertSecretStoreAvailable: (() => void) | undefined;
  readonly #clientId: string;
  readonly #generateAuthorizationId: () => string;
  readonly #now: () => Date;
  readonly #onConnectionChanged: ((status: TwitchConnectionStatus) => void | Promise<void>) | undefined;
  readonly #pendingAuthorizations = new Map<string, PendingDeviceAuthorization>();
  readonly #repository: TwitchAccountRepository;
  readonly #scopes: readonly string[];
  readonly #secretStore: SecretStore;

  constructor(options: TwitchOAuthServiceOptions) {
    this.#apiClient = options.apiClient;
    this.#assertSecretStoreAvailable = options.assertSecretStoreAvailable;
    this.#clientId = options.clientId;
    this.#generateAuthorizationId = options.generateAuthorizationId;
    this.#now = options.now ?? (() => new Date());
    this.#onConnectionChanged = options.onConnectionChanged;
    this.#repository = options.repository;
    this.#scopes = [...(options.scopes ?? defaultTwitchOAuthScopes)].sort();
    this.#secretStore = options.secretStore;
  }

  async getStatus(): Promise<TwitchConnectionStatus> {
    return this.#connectionStatus(await this.#repository.findConnectedAccount());
  }

  async createConnectionStart(): Promise<TwitchConnectionStartResult> {
    const now = this.#now();
    this.#pruneExpiredAuthorizations(now.getTime());
    this.#assertConfigured();
    const authorization = await this.#apiClient.startDeviceAuthorization({
      clientId: this.#clientId,
      scopes: this.#scopes
    });
    const expiresAtMs = now.getTime() + authorization.expiresIn * 1_000;
    const authorizationId = this.#generateAuthorizationId();

    this.#pendingAuthorizations.set(authorizationId, {
      deviceCode: authorization.deviceCode,
      scopes: this.#scopes,
      expiresAtMs,
      intervalMs: authorization.interval * 1_000,
      nextPollAtMs: now.getTime() + authorization.interval * 1_000
    });

    return {
      authorizationId,
      verificationUri: authorization.verificationUri,
      userCode: authorization.userCode,
      expiresAt: new Date(expiresAtMs).toISOString(),
      intervalSeconds: authorization.interval,
      scopes: this.#scopes
    };
  }

  async pollConnection(input: TwitchConnectionPollInput): Promise<TwitchConnectionPollResult> {
    const now = this.#now();
    const nowMs = now.getTime();
    this.#pruneExpiredAuthorizations(nowMs);
    this.#assertConfigured();
    const pendingAuthorization = this.#pendingAuthorizations.get(input.authorizationId);
    if (pendingAuthorization === undefined) {
      throw new TwitchOAuthAuthorizationError();
    }

    if (pendingAuthorization.nextPollAtMs > nowMs) {
      return { status: "pending" };
    }

    pendingAuthorization.nextPollAtMs = nowMs + pendingAuthorization.intervalMs;
    let result: TwitchDeviceTokenPollResult;
    try {
      result = await this.#apiClient.pollDeviceAuthorization({
        clientId: this.#clientId,
        deviceCode: pendingAuthorization.deviceCode,
        scopes: pendingAuthorization.scopes
      });
    } catch (error) {
      this.#pendingAuthorizations.delete(input.authorizationId);
      throw error;
    }
    switch (result.status) {
      case "pending":
        return { status: "pending" };
      case "denied":
        this.#pendingAuthorizations.delete(input.authorizationId);
        return {
          status: "failed",
          code: "TWITCH_OAUTH_DENIED",
          message: "Twitch authorization was denied"
        };
      case "expired":
        this.#pendingAuthorizations.delete(input.authorizationId);
        return {
          status: "failed",
          code: "TWITCH_OAUTH_EXPIRED",
          message: "Twitch authorization expired"
        };
      case "granted": {
        this.#pendingAuthorizations.delete(input.authorizationId);
        return {
          status: "connected",
          connection: await this.#storeTokenGrant(result.grant)
        };
      }
    }
  }

  async validateConnectedAccount(
    options: { readonly notifyConnectionChanged?: boolean } = {}
  ): Promise<{ readonly connection: TwitchConnectionStatus; readonly refreshed: boolean }> {
    this.#assertConfigured();
    const currentAccount = await this.#repository.findConnectedAccount();
    if (currentAccount === null) {
      return { connection: this.#connectionStatus(null), refreshed: false };
    }

    const accessToken = await this.#readSecret(createTwitchTokenSecretRef(currentAccount.accountId, "access_token"));
    if (accessToken === null) {
      throw new TwitchOAuthProviderError("Twitch access token is unavailable");
    }

    try {
      const validatedToken = await this.#apiClient.validateToken({ accessToken });
      assertValidatedTokenMatchesClient(validatedToken, this.#clientId);
      if (validatedToken.userId !== currentAccount.accountId) {
        throw new TwitchOAuthProviderError("Twitch token account did not match connected account");
      }
      return { connection: this.#connectionStatus(currentAccount), refreshed: false };
    } catch (error) {
      if (!(error instanceof TwitchApiHttpError) || error.status !== 401) {
        throw error;
      }
    }

    return {
      connection: await this.refreshConnectedAccount(options),
      refreshed: true
    };
  }

  async refreshConnectedAccount(
    options: { readonly notifyConnectionChanged?: boolean } = {}
  ): Promise<TwitchConnectionStatus> {
    this.#assertConfigured();
    const currentAccount = await this.#repository.findConnectedAccount();
    if (currentAccount === null) {
      return this.#connectionStatus(null);
    }

    const refreshToken = await this.#readSecret(createTwitchTokenSecretRef(currentAccount.accountId, "refresh_token"));
    if (refreshToken === null) {
      throw new TwitchOAuthProviderError("Twitch refresh token is unavailable");
    }

    const tokenGrant = await this.#apiClient.refreshUserToken({
      clientId: this.#clientId,
      refreshToken
    });
    return this.#storeTokenGrant(
      tokenGrant,
      currentAccount.connectedAt,
      options.notifyConnectionChanged ?? true
    );
  }

  async disconnect(): Promise<TwitchConnectionStatus> {
    const account = await this.#repository.findConnectedAccount();
    if (account === null) {
      return this.#connectionStatus(null);
    }

    await this.#deleteSecret(createTwitchTokenSecretRef(account.accountId, "access_token"));
    await this.#deleteSecret(createTwitchTokenSecretRef(account.accountId, "refresh_token"));
    await this.#repository.deleteAccount(account.accountId);
    const status = this.#connectionStatus(null);
    await this.#notifyConnectionChanged(status);
    return status;
  }

  #assertConfigured(): void {
    if (this.#clientId.trim() === "") {
      throw new TwitchOAuthProviderError("Twitch OAuth client ID is not configured");
    }

    try {
      this.#assertSecretStoreAvailable?.();
    } catch {
      throw new TwitchOAuthProviderError(runtimeSecretStoreUnavailableMessage);
    }
  }

  #pruneExpiredAuthorizations(nowMs: number): void {
    for (const [authorizationId, authorization] of this.#pendingAuthorizations) {
      if (authorization.expiresAtMs <= nowMs) {
        this.#pendingAuthorizations.delete(authorizationId);
      }
    }
  }

  async #storeTokenGrant(
    tokenGrant: TwitchTokenGrant,
    existingConnectedAt?: string,
    notifyConnectionChanged = true
  ): Promise<TwitchConnectionStatus> {
    const validatedToken = await this.#apiClient.validateToken({
      accessToken: tokenGrant.accessToken
    });
    assertValidatedTokenMatchesClient(validatedToken, this.#clientId);
    const user = await this.#apiClient.getCurrentUser({
      accessToken: tokenGrant.accessToken,
      clientId: this.#clientId
    });
    const now = this.#now().toISOString();
    const account: TwitchAccount = {
      accountId: validatedToken.userId,
      login: user.login,
      displayName: user.displayName,
      scopes: validatedToken.scopes,
      connectedAt: existingConnectedAt ?? now,
      updatedAt: now
    };

    const previousAccount = await this.#repository.findConnectedAccount();
    const accessTokenRef = createTwitchTokenSecretRef(account.accountId, "access_token");
    const refreshTokenRef = createTwitchTokenSecretRef(account.accountId, "refresh_token");
    const previousAccessToken = await this.#readSecret(accessTokenRef);
    const previousRefreshToken = await this.#readSecret(refreshTokenRef);
    let savedAccount: TwitchAccount;
    try {
      await this.#writeSecret(accessTokenRef, tokenGrant.accessToken);
      await this.#writeSecret(refreshTokenRef, tokenGrant.refreshToken);
      savedAccount = await this.#repository.saveAccount(account);
    } catch (error) {
      const rollback = await Promise.allSettled([
        this.#restoreSecret(accessTokenRef, previousAccessToken),
        this.#restoreSecret(refreshTokenRef, previousRefreshToken)
      ]);
      if (rollback.some((result) => result.status === "rejected")) {
        throw new TwitchOAuthProviderError(runtimeSecretStoreUnavailableMessage);
      }
      throw error;
    }
    if (previousAccount !== null && previousAccount.accountId !== account.accountId) {
      await this.#deleteSecret(createTwitchTokenSecretRef(previousAccount.accountId, "access_token"));
      await this.#deleteSecret(createTwitchTokenSecretRef(previousAccount.accountId, "refresh_token"));
    }

    const status = this.#connectionStatus(savedAccount);
    if (notifyConnectionChanged) {
      await this.#notifyConnectionChanged(status);
    }
    return status;
  }

  async #notifyConnectionChanged(status: TwitchConnectionStatus): Promise<void> {
    await this.#onConnectionChanged?.(status);
  }

  #connectionStatus(account: TwitchAccount | null): TwitchConnectionStatus {
    return toTwitchConnectionStatus(
      account,
      account === null ? [] : missingTwitchScopes(account.scopes, this.#scopes)
    );
  }

  async #writeSecret(ref: SecretRef, value: string): Promise<void> {
    try {
      await this.#secretStore.setSecret(ref, value);
    } catch {
      throw new TwitchOAuthProviderError(runtimeSecretStoreUnavailableMessage);
    }
  }

  async #readSecret(ref: SecretRef): Promise<string | null> {
    try {
      return await this.#secretStore.getSecret(ref);
    } catch {
      throw new TwitchOAuthProviderError(runtimeSecretStoreUnavailableMessage);
    }
  }

  async #deleteSecret(ref: SecretRef): Promise<void> {
    try {
      await this.#secretStore.deleteSecret(ref);
    } catch {
      throw new TwitchOAuthProviderError(runtimeSecretStoreUnavailableMessage);
    }
  }

  async #restoreSecret(ref: SecretRef, value: string | null): Promise<void> {
    if (value === null) {
      await this.#deleteSecret(ref);
      return;
    }
    await this.#writeSecret(ref, value);
  }
}

export function createTwitchTokenSecretRef(accountId: string, name: TwitchTokenSecretName): SecretRef {
  return {
    namespace: "twitch",
    accountId,
    name
  };
}

export function missingTwitchScopes(
  granted: readonly string[],
  required: readonly string[] = defaultTwitchOAuthScopes
): readonly string[] {
  const grantedSet = new Set(granted);
  return required.filter((scope) => !grantedSet.has(scope));
}

function assertValidatedTokenMatchesClient(validatedToken: TwitchValidatedToken, clientId: string): void {
  if (validatedToken.clientId !== clientId) {
    throw new TwitchOAuthProviderError("Twitch token client ID did not match configured client ID");
  }
}
