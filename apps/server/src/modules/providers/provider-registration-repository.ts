import type { ProviderCapability, RegisteredProviderView, SecretRef, TtsProviderSafetySettings, TtsVoice } from "@stream-jams/core";

export interface ProviderRegistrationRecord {
  readonly provider: RegisteredProviderView;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly availableVoices: readonly TtsVoice[];
  readonly secretRef: SecretRef | null;
  readonly ttsSafety: TtsProviderSafetySettings | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderActivationRecordResult {
  readonly provider: ProviderRegistrationRecord;
  readonly replacedProviderId: string | null;
}

export interface ProviderRegistrationRepository {
  save(record: ProviderRegistrationRecord): Promise<ProviderRegistrationRecord>;
  delete(providerId: string): Promise<void>;
  findById(providerId: string): Promise<ProviderRegistrationRecord | null>;
  list(capability: ProviderCapability): Promise<readonly ProviderRegistrationRecord[]>;
  findActive(capability: ProviderCapability): Promise<ProviderRegistrationRecord | null>;
  activate(providerId: string): Promise<ProviderActivationRecordResult>;
  deactivateMusic(providerId: string): Promise<ProviderRegistrationRecord | null>;
  updateTtsSafety(
    providerId: string,
    settings: TtsProviderSafetySettings
  ): Promise<ProviderRegistrationRecord | null>;
}
