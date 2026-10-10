import type { SecretStore } from "@stream-jams/core";
import type { TwitchAccountRepository } from "./twitch-account-repository.js";
import { createTwitchTokenSecretRef } from "./twitch-oauth-service.js";

export interface TwitchConnectedAccess {
  readonly accessToken: string;
  readonly clientId: string;
}

export interface TwitchConnectedAccessOptions {
  readonly repository: Pick<TwitchAccountRepository, "findConnectedAccount">;
  readonly secretStore: Pick<SecretStore, "getSecret">;
  readonly clientId: string;
}

/**
 * Reads the connected account's stored user token for read-only Helix lookups. It never
 * refreshes or validates the token (the connection's own checks do that) and returns null
 * when no account is connected or its token is missing.
 */
export function createTwitchConnectedAccessReader(options: TwitchConnectedAccessOptions): () => Promise<TwitchConnectedAccess | null> {
  return async () => {
    const account = await options.repository.findConnectedAccount();
    if (account === null) return null;
    const accessToken = await options.secretStore.getSecret(createTwitchTokenSecretRef(account.accountId, "access_token"));
    return accessToken === null || accessToken === "" ? null : { accessToken, clientId: options.clientId };
  };
}
