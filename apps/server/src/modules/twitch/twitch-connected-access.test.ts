import { describe, expect, it } from "vitest";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { createTwitchConnectedAccessReader } from "./twitch-connected-access.js";
import { createTwitchTokenSecretRef } from "./twitch-oauth-service.js";
import type { TwitchAccount } from "./twitch-account-repository.js";

const account: TwitchAccount = { accountId: "123", login: "streamer", displayName: "Streamer", scopes: [], connectedAt: "now", updatedAt: "now" };

describe("createTwitchConnectedAccessReader", () => {
  it("returns the stored user token with the app client id", async () => {
    const secretStore = new InMemorySecretStore();
    await secretStore.setSecret(createTwitchTokenSecretRef("123", "access_token"), "user-token");
    const read = createTwitchConnectedAccessReader({ repository: { findConnectedAccount: async () => account }, secretStore, clientId: "client" });
    await expect(read()).resolves.toEqual({ accessToken: "user-token", clientId: "client" });
  });

  it("returns null without a connected account or a stored token", async () => {
    const secretStore = new InMemorySecretStore();
    await expect(createTwitchConnectedAccessReader({ repository: { findConnectedAccount: async () => null }, secretStore, clientId: "client" })()).resolves.toBeNull();
    await expect(createTwitchConnectedAccessReader({ repository: { findConnectedAccount: async () => account }, secretStore, clientId: "client" })()).resolves.toBeNull();
  });
});
