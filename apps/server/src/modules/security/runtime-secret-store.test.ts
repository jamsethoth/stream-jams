import type { SecretRef } from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { describe, expect, it } from "vitest";
import type { OsCredentialAdapter } from "./os-secret-store.js";
import {
  createRuntimeSecretStore,
  runtimeSecretStoreUnavailableMessage,
  SecretStoreUnavailableError
} from "./runtime-secret-store.js";

const twitchAccessTokenRef: SecretRef = {
  namespace: "twitch",
  accountId: "channel-123",
  name: "access_token"
};

describe("createRuntimeSecretStore", () => {
  it("selects an OS-backed secret store and checks credential availability", async () => {
    const credentials = new RecordingCredentialAdapter();

    const selection = await createRuntimeSecretStore({
      credentials,
      generateHealthCheckValue: () => "health-check-value",
      now: () => new Date("2026-06-16T12:00:00.000Z")
    });

    expect(selection.status).toEqual({
      state: "ready",
      lastErrorAt: null,
      message: null
    });
    expect(credentials.values.has("stream-jams:management:credential-store-health-check:local-runtime")).toBe(false);

    await selection.secretStore.setSecret(twitchAccessTokenRef, "access-token-secret");

    expect(credentials.values.get("stream-jams:twitch:access_token:channel-123")).toBe("access-token-secret");
    await expect(selection.secretStore.getSecret(twitchAccessTokenRef)).resolves.toBe("access-token-secret");
    expect(() => selection.assertAvailable()).not.toThrow();
  });

  it("returns an unavailable store when credential availability checks fail", async () => {
    const selection = await createRuntimeSecretStore({
      credentials: new FailingCredentialAdapter(),
      now: () => new Date("2026-06-16T12:00:00.000Z")
    });

    expect(selection.status).toEqual({
      state: "degraded",
      lastErrorAt: "2026-06-16T12:00:00.000Z",
      message: runtimeSecretStoreUnavailableMessage
    });
    expect(() => selection.assertAvailable()).toThrow(SecretStoreUnavailableError);
    await expect(selection.secretStore.setSecret(twitchAccessTokenRef, "access-token-secret")).rejects.toThrow(
      SecretStoreUnavailableError
    );
  });

  it("uses injected secret stores only through explicit test seams", async () => {
    const secretStore = new InMemorySecretStore();

    const selection = await createRuntimeSecretStore({
      secretStore,
      credentials: new FailingCredentialAdapter()
    });

    expect(selection.status.state).toBe("ready");
    expect(selection.secretStore).toBe(secretStore);
    expect(() => selection.assertAvailable()).not.toThrow();
  });
});

class RecordingCredentialAdapter implements OsCredentialAdapter {
  readonly values = new Map<string, string>();

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.values.set(credentialKey(service, account), password);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.values.get(credentialKey(service, account)) ?? null;
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(credentialKey(service, account));
  }
}

class FailingCredentialAdapter implements OsCredentialAdapter {
  async setPassword(): Promise<void> {
    throw new Error("secret service unavailable");
  }

  async getPassword(): Promise<string | null> {
    throw new Error("secret service unavailable");
  }

  async deletePassword(): Promise<boolean> {
    throw new Error("secret service unavailable");
  }
}

function credentialKey(service: string, account: string): string {
  return `${service}:${account}`;
}
