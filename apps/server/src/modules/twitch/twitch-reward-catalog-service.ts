import type { SecretStore, TwitchCustomRewardCatalog } from "@stream-jams/core";
import { runtimeSecretStoreUnavailableMessage } from "../security/runtime-secret-store.js";
import { TwitchApiHttpError, type TwitchRewardApiClient } from "./twitch-api-client.js";
import type { TwitchAccount, TwitchAccountRepository } from "./twitch-account-repository.js";
import {
  createTwitchTokenSecretRef,
  TwitchOAuthProviderError,
  type TwitchOAuthService
} from "./twitch-oauth-service.js";

const requiredRewardCatalogScope = "channel:read:redemptions";

type TwitchRewardCatalogErrorCode =
  | "TWITCH_REWARD_CATALOG_DISCONNECTED"
  | "TWITCH_REWARD_CATALOG_SCOPE_REQUIRED"
  | "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"
  | "TWITCH_REWARD_CATALOG_INELIGIBLE";

export class TwitchRewardCatalogError extends Error {
  constructor(
    readonly code: TwitchRewardCatalogErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TwitchRewardCatalogError";
  }
}

export interface TwitchRewardCatalogServiceOptions {
  readonly apiClient: TwitchRewardApiClient;
  readonly clientId: string;
  readonly oauthService: Pick<TwitchOAuthService, "refreshConnectedAccount" | "validateConnectedAccount">;
  readonly repository: TwitchAccountRepository;
  readonly secretStore: SecretStore;
}

export class TwitchRewardCatalogService {
  readonly #apiClient: TwitchRewardApiClient;
  readonly #clientId: string;
  readonly #oauthService: TwitchRewardCatalogServiceOptions["oauthService"];
  readonly #repository: TwitchAccountRepository;
  readonly #secretStore: SecretStore;

  constructor(options: TwitchRewardCatalogServiceOptions) {
    this.#apiClient = options.apiClient;
    this.#clientId = options.clientId;
    this.#oauthService = options.oauthService;
    this.#repository = options.repository;
    this.#secretStore = options.secretStore;
  }

  async listCustomRewards(): Promise<TwitchCustomRewardCatalog> {
    let firstRequest = await this.#readCatalogRequest("TWITCH_REWARD_CATALOG_DISCONNECTED");
    const validation = await this.#oauthService.validateConnectedAccount({ notifyConnectionChanged: false });
    if (!validation.connection.connected) {
      throw new TwitchRewardCatalogError(
        "TWITCH_REWARD_CATALOG_DISCONNECTED",
        "Connect a Twitch broadcaster account before loading custom rewards"
      );
    }
    if (validation.refreshed) {
      firstRequest = await this.#readCatalogRequest("TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED");
    }
    try {
      return await this.#apiClient.getCustomRewards(firstRequest);
    } catch (error) {
      if (!(error instanceof TwitchApiHttpError) || error.status !== 401) {
        throw mapCatalogApiError(error);
      }
    }

    await this.#oauthService.refreshConnectedAccount({ notifyConnectionChanged: false });
    const finalRequest = await this.#readCatalogRequest("TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED");
    try {
      return await this.#apiClient.getCustomRewards(finalRequest);
    } catch (error) {
      throw mapCatalogApiError(error);
    }
  }

  async #readCatalogRequest(
    missingAccountCode: Extract<
      TwitchRewardCatalogErrorCode,
      "TWITCH_REWARD_CATALOG_DISCONNECTED" | "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED"
    >
  ): Promise<{ readonly accessToken: string; readonly clientId: string; readonly broadcasterId: string }> {
    const account = await this.#repository.findConnectedAccount();
    if (account === null) {
      throw new TwitchRewardCatalogError(
        missingAccountCode,
        missingAccountCode === "TWITCH_REWARD_CATALOG_DISCONNECTED"
          ? "Connect a Twitch broadcaster account before loading custom rewards"
          : "Reconnect Twitch before loading custom rewards"
      );
    }
    assertRewardCatalogScope(account);

    let accessToken: string | null;
    try {
      accessToken = await this.#secretStore.getSecret(
        createTwitchTokenSecretRef(account.accountId, "access_token")
      );
    } catch {
      throw new TwitchOAuthProviderError(runtimeSecretStoreUnavailableMessage);
    }
    if (accessToken === null) {
      throw new TwitchRewardCatalogError(
        "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED",
        "Reconnect Twitch before loading custom rewards"
      );
    }

    return {
      accessToken,
      clientId: this.#clientId,
      broadcasterId: account.accountId
    };
  }
}

function assertRewardCatalogScope(account: TwitchAccount): void {
  if (!account.scopes.includes(requiredRewardCatalogScope)) {
    throw new TwitchRewardCatalogError(
      "TWITCH_REWARD_CATALOG_SCOPE_REQUIRED",
      "Reconnect Twitch with channel points access before loading custom rewards"
    );
  }
}

function mapCatalogApiError(error: unknown): unknown {
  if (error instanceof TwitchApiHttpError) {
    if (error.status === 401) {
      return new TwitchRewardCatalogError(
        "TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED",
        "Reconnect Twitch before loading custom rewards"
      );
    }
    if (error.status === 403) {
      return new TwitchRewardCatalogError(
        "TWITCH_REWARD_CATALOG_INELIGIBLE",
        "The connected Twitch broadcaster is not eligible to list custom rewards"
      );
    }
  }

  return error;
}
