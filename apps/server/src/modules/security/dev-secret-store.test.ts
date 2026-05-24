import type { SecretRef } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { DevSecretStore } from "./dev-secret-store.js";

const overlayKeyRef: SecretRef = {
  namespace: "overlay",
  accountId: "default-overlay",
  name: "live-key"
};

describe("DevSecretStore", () => {
  it("stores, reads, and deletes secrets in development mode", async () => {
    const store = new DevSecretStore({ mode: "development" });

    await store.setSecret(overlayKeyRef, "ovl_secret_value");

    await expect(store.getSecret(overlayKeyRef)).resolves.toBe("ovl_secret_value");
    await expect(store.deleteSecret(overlayKeyRef)).resolves.toBeUndefined();
    await expect(store.getSecret(overlayKeyRef)).resolves.toBeNull();
  });

  it("refuses to construct outside development mode", () => {
    expect(() => new DevSecretStore({ mode: "test" })).toThrow("development");
    expect(() => new DevSecretStore({ mode: "production" })).toThrow("development");
  });

  it("validates SecretRef values before writing to memory", async () => {
    const store = new DevSecretStore({ mode: "development" });
    const invalidRef = { ...overlayKeyRef, name: "" } as SecretRef;

    await expect(store.setSecret(invalidRef, "ovl_secret_value")).rejects.toThrow();
    await expect(store.getSecret(overlayKeyRef)).resolves.toBeNull();
  });
});
