import type { SecretRef, SecretStore } from "@stream-jams/core";

export type SecretRefKey = (ref: SecretRef) => string;

export function createSequence(prefix: string): () => string {
  let value = 0;
  return () => {
    value += 1;
    return `${prefix}-${value}`;
  };
}

export function createSecretRefKey(ref: SecretRef): string {
  return `${ref.namespace}:${ref.accountId}:${ref.name}`;
}

export class InMemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();
  readonly #keyForRef: SecretRefKey;

  constructor(keyForRef: SecretRefKey = createSecretRefKey) {
    this.#keyForRef = keyForRef;
  }

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    this.values.set(this.#keyForRef(ref), value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    return this.values.get(this.#keyForRef(ref)) ?? null;
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    this.values.delete(this.#keyForRef(ref));
  }
}

export function expectNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
