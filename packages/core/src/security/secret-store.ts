import type { SecretRef } from "./types.js";

export interface SecretStore {
  setSecret(ref: SecretRef, value: string): Promise<void>;
  getSecret(ref: SecretRef): Promise<string | null>;
  deleteSecret(ref: SecretRef): Promise<void>;
}

export interface Redactor {
  redact<T>(value: T): T;
  redactText(value: string): string;
}
