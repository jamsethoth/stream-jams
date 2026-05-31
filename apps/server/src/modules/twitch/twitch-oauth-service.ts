import type { SecretRef, SecretStore } from "@stream-jams/core";
import type { TwitchApiClient, TwitchTokenGrant, TwitchValidatedToken } from "./twitch-api-client.js";
import {
  toTwitchConnectionStatus,
  type TwitchAccount,
  type TwitchAccountRepository,
  type TwitchConnectionStatus
} from "./twitch-account-repository.js";

export const defaultTwitchOAuthScopes = [
  "bits:read",
  "channel:read:redemptions",
  "channel:read:subscriptions",
  "moderator:read:followers"
] as const;

export type TwitchTokenSecretName = "access_token" | "refresh_token";

export interface TwitchConnectionStartInput {
  readonly redirectUri: string;
}

export interface TwitchConnectionStartResult {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly scopes: readonly string[];
}

export interface TwitchOAuthCallbackInput {
  readonly code: string;
  readonly state: string;
}

export interface TwitchOAuthServiceOptions {
  readonly apiClient: TwitchApiClient;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly generateState: () => string;
  readonly now?: (() => Date) | undefined;
  readonly onConnectionChanged?: ((status: TwitchConnectionStatus) => void | Promise<void>) | undefined;
  readonly repository: TwitchAccountRepository;
  readonly scopes?: readonly string[] | undefined;
  readonly secretStore: SecretStore;
}

interface PendingOAuthState {
  readonly redirectUri: string;
}

export class TwitchOAuthStateError extends Error {
  readonly code = "TWITCH_OAUTH_STATE_INVALID";

  constructor() {
    super("Invalid Twitch OAuth state");
    this.name = "TwitchOAuthStateError";
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
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #generateState: () => string;
  readonly #now: () => Date;
  readonly #onConnectionChanged: ((status: TwitchConnectionStatus) => void | Promise<void>) | undefined;
  readonly #pendingStates = new Map<string, PendingOAuthState>();
  readonly #repository: TwitchAccountRepository;
  readonly #scopes: readonly string[];
  readonly #secretStore: SecretStore;

  constructor(options: TwitchOAuthServiceOptions) {
    this.#apiClient = options.apiClient;
    this.#clientId = options.clientId;
    this.#clientSecret = options.clientSecret;
    this.#generateState = options.generateState;
    this.#now = options.now ?? (() => new Date());
    this.#onConnectionChanged = options.onConnectionChanged;
    this.#repository = options.repository;
    this.#scopes = [...(options.scopes ?? defaultTwitchOAuthScopes)].sort();
    this.#secretStore = options.secretStore;
  }

  async getStatus(): Promise<TwitchConnectionStatus> {
    return toTwitchConnectionStatus(await this.#repository.findConnectedAccount());
  }

  createConnectionStart(input: TwitchConnectionStartInput): TwitchConnectionStartResult {
    this.#assertConfigured();
    const state = this.#generateState();
    this.#pendingStates.set(state, {
      redirectUri: input.redirectUri
    });

    const authorizationUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", this.#clientId);
    authorizationUrl.searchParams.set("redirect_uri", input.redirectUri);
    authorizationUrl.searchParams.set("scope", this.#scopes.join(" "));
    authorizationUrl.searchParams.set("state", state);

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
      scopes: this.#scopes
    };
  }

  async completeCallback(input: TwitchOAuthCallbackInput): Promise<TwitchConnectionStatus> {
    this.#assertConfigured();
    const pendingState = this.#pendingStates.get(input.state);
    if (pendingState === undefined) {
      throw new TwitchOAuthStateError();
    }

    this.#pendingStates.delete(input.state);
    const tokenGrant = await this.#apiClient.exchangeAuthorizationCode({
      clientId: this.#clientId,
      clientSecret: this.#clientSecret,
      code: input.code,
      redirectUri: pendingState.redirectUri
    });
    return this.#storeTokenGrant(tokenGrant);
  }

  async refreshConnectedAccount(): Promise<TwitchConnectionStatus> {
    this.#assertConfigured();
    const currentAccount = await this.#repository.findConnectedAccount();
    if (currentAccount === null) {
      return toTwitchConnectionStatus(null);
    }

    const refreshToken = await this.#secretStore.getSecret(
      createTwitchTokenSecretRef(currentAccount.accountId, "refresh_token")
    );
    if (refreshToken === null) {
      throw new TwitchOAuthProviderError("Twitch refresh token is unavailable");
    }

    const tokenGrant = await this.#apiClient.refreshUserToken({
      clientId: this.#clientId,
      clientSecret: this.#clientSecret,
      refreshToken
    });
    return this.#storeTokenGrant(tokenGrant, currentAccount.connectedAt);
  }

  async disconnect(): Promise<TwitchConnectionStatus> {
    const account = await this.#repository.findConnectedAccount();
    if (account === null) {
      return toTwitchConnectionStatus(null);
    }

    await this.#secretStore.deleteSecret(createTwitchTokenSecretRef(account.accountId, "access_token"));
    await this.#secretStore.deleteSecret(createTwitchTokenSecretRef(account.accountId, "refresh_token"));
    await this.#repository.deleteAccount(account.accountId);
    const status = toTwitchConnectionStatus(null);
    await this.#notifyConnectionChanged(status);
    return status;
  }

  #assertConfigured(): void {
    if (this.#clientId.trim() === "" || this.#clientSecret.trim() === "") {
      throw new TwitchOAuthProviderError("Twitch OAuth client credentials are not configured");
    }
  }

  async #storeTokenGrant(tokenGrant: TwitchTokenGrant, existingConnectedAt?: string): Promise<TwitchConnectionStatus> {
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
    await this.#secretStore.setSecret(createTwitchTokenSecretRef(account.accountId, "access_token"), tokenGrant.accessToken);
    await this.#secretStore.setSecret(
      createTwitchTokenSecretRef(account.accountId, "refresh_token"),
      tokenGrant.refreshToken
    );
    const savedAccount = await this.#repository.saveAccount(account);
    if (previousAccount !== null && previousAccount.accountId !== account.accountId) {
      await this.#secretStore.deleteSecret(createTwitchTokenSecretRef(previousAccount.accountId, "access_token"));
      await this.#secretStore.deleteSecret(createTwitchTokenSecretRef(previousAccount.accountId, "refresh_token"));
    }

    const status = toTwitchConnectionStatus(savedAccount);
    await this.#notifyConnectionChanged(status);
    return status;
  }

  async #notifyConnectionChanged(status: TwitchConnectionStatus): Promise<void> {
    await this.#onConnectionChanged?.(status);
  }
}

export function createTwitchTokenSecretRef(accountId: string, name: TwitchTokenSecretName): SecretRef {
  return {
    namespace: "twitch",
    accountId,
    name
  };
}

function assertValidatedTokenMatchesClient(validatedToken: TwitchValidatedToken, clientId: string): void {
  if (validatedToken.clientId !== clientId) {
    throw new TwitchOAuthProviderError("Twitch token client ID did not match configured client ID");
  }
}
