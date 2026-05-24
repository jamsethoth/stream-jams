import { secretRefSchema, type SecretRef, type SecretStore } from "@stream-jams/core";

export interface OsCredentialAdapter {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export interface OsSecretStoreOptions {
  readonly credentials: OsCredentialAdapter;
  readonly servicePrefix?: string;
}

export class OsSecretStore implements SecretStore {
  readonly #credentials: OsCredentialAdapter;
  readonly #servicePrefix: string;

  constructor(options: OsSecretStoreOptions) {
    this.#credentials = options.credentials;
    this.#servicePrefix = options.servicePrefix ?? "stream-jams";
  }

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    const parsedRef = parseSecretRef(ref);
    assertSecretValue(value);
    await this.#credentials.setPassword(this.#serviceName(parsedRef), parsedRef.accountId, value);
  }

  async getSecret(ref: SecretRef): Promise<string | null> {
    const parsedRef = parseSecretRef(ref);
    return this.#credentials.getPassword(this.#serviceName(parsedRef), parsedRef.accountId);
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    const parsedRef = parseSecretRef(ref);
    await this.#credentials.deletePassword(this.#serviceName(parsedRef), parsedRef.accountId);
  }

  #serviceName(ref: SecretRef): string {
    return `${this.#servicePrefix}:${ref.namespace}:${ref.name}`;
  }
}

function parseSecretRef(ref: SecretRef): SecretRef {
  return secretRefSchema.parse(ref);
}

function assertSecretValue(value: string): void {
  if (value.trim().length === 0) {
    throw new Error("Secret value must not be empty.");
  }
}
