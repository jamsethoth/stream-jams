import type { SecretRef } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { OsSecretStore, type OsCredentialAdapter } from "./os-secret-store.js";

const twitchTokenRef: SecretRef = {
  namespace: "twitch",
  accountId: "channel-123",
  name: "oauth-token"
};

/** OS secret-store test adapter that records credential calls in memory. */
class FakeCredentialAdapter implements OsCredentialAdapter {
  readonly values = new Map<string, string>();

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.values.set(`${service}:${account}`, password);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.values.get(`${service}:${account}`) ?? null;
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(`${service}:${account}`);
  }
}

describe("OsSecretStore", () => {
  it("stores, reads, and deletes secrets through an injected credential adapter", async () => {
    const credentials = new FakeCredentialAdapter();
    const store = new OsSecretStore({ credentials, servicePrefix: "stream-jams-test" });

    await store.setSecret(twitchTokenRef, "token-value");

    expect(credentials.values.get("stream-jams-test:twitch:oauth-token:channel-123")).toBe("token-value");
    await expect(store.getSecret(twitchTokenRef)).resolves.toBe("token-value");
    await expect(store.deleteSecret(twitchTokenRef)).resolves.toBeUndefined();
    await expect(store.getSecret(twitchTokenRef)).resolves.toBeNull();
  });

  it("validates SecretRef values before reaching the credential adapter", async () => {
    const credentials = new FakeCredentialAdapter();
    const store = new OsSecretStore({ credentials });
    const invalidRef = { ...twitchTokenRef, accountId: " " } as SecretRef;

    await expect(store.setSecret(invalidRef, "token-value")).rejects.toThrow();
    expect(credentials.values.size).toBe(0);
  });
});
