import { secretRefSchema, type SecretRef, type SecretStore } from "@stream-jams/core";

export type DevSecretStoreMode = "development" | "test" | "production";

export interface DevSecretStoreOptions {
  readonly mode: DevSecretStoreMode;
}

/** Development-only in-memory secret store used before OS credential wiring is available. */
export class DevSecretStore implements SecretStore {
  readonly #secrets = new Map<string, string>();

  constructor(options: DevSecretStoreOptions) {
    if (options.mode !== "development") {
      throw new Error("DevSecretStore can only be used in development mode.");
    }
  }

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    const parsedRef = parseSecretRef(ref);
    assertSecretValue(value);
    this.#secrets.set(secretKey(parsedRef), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    const parsedRef = parseSecretRef(ref);
    return this.#secrets.get(secretKey(parsedRef)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    const parsedRef = parseSecretRef(ref);
    this.#secrets.delete(secretKey(parsedRef));
  }
}

function parseSecretRef(ref: SecretRef): SecretRef {
  return secretRefSchema.parse(ref);
}

function secretKey(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}

function assertSecretValue(value: string): void {
  if (value.trim().length === 0) {
    throw new Error("Secret value must not be empty.");
  }
}
