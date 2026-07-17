import {
  evaluateProviderActivation,
  providerActivationImpactSchema,
  providerActivationResultSchema,
  providerCapabilityForKind,
  providerRegistrationAttemptSchema,
  providerSetupInputSchema,
  providerValidationResultSchema,
  providerVoiceTestResultSchema,
  registeredProviderDetailSchema,
  ttsProviderSafetySettingsSchema,
  type ActionableManagementError,
  type ProviderActivationImpact,
  type ProviderActivationResult,
  type ProviderCapability,
  type ProviderKind,
  type ProviderRegistrationAttempt,
  type ProviderSetupInput,
  type ProviderValidationResult,
  type ProviderVoiceTestResult,
  type RegisteredProviderDetail,
  type RegisteredProviderView,
  type SecretRef,
  type TtsProviderSafetySettings
} from "@stream-jams/core";
import type {
  ProviderRegistrationRecord,
  SqliteProviderRegistrationRepository
} from "./sqlite-provider-registration-repository.js";

export interface ProviderVoiceTestInput {
  readonly provider: RegisteredProviderDetail;
  readonly text: string;
}

export interface ProviderManagementAdapter {
  validate(input: ProviderSetupInput): Promise<ProviderValidationResult>;
  testVoice?(input: ProviderVoiceTestInput): Promise<ProviderVoiceTestResult>;
}

export interface ProviderManagementServiceOptions {
  readonly repository: SqliteProviderRegistrationRepository;
  readonly adapters: ReadonlyMap<ProviderKind, ProviderManagementAdapter>;
  readonly secretStore: Pick<SecretStoreBoundary, "setSecret" | "getSecret" | "deleteSecret">;
  readonly getActivationImpact: (providerId: string) => Promise<ProviderActivationImpact>;
  readonly getUsedByAlertCount: (kind: ProviderKind) => Promise<number>;
  readonly generateId: () => string;
  readonly generateReferenceId: () => string;
  readonly onEventSourceChanged?: (() => void | Promise<void>) | undefined;
  readonly now?: () => Date;
}

interface SecretStoreBoundary {
  setSecret(ref: SecretRef, value: string): Promise<void>;
  getSecret(ref: SecretRef): Promise<string | null>;
  deleteSecret(ref: SecretRef): Promise<void>;
}

export class ProviderActivationBlockedError extends Error {
  readonly code = "PROVIDER_ACTIVATION_BLOCKED";

  constructor(readonly impact: ProviderActivationImpact) {
    super("Provider activation is blocked by the active alert configuration");
    this.name = "ProviderActivationBlockedError";
  }
}

export class ProviderActivationConfirmationRequiredError extends Error {
  readonly code = "PROVIDER_ACTIVATION_CONFIRMATION_REQUIRED";

  constructor(readonly impact: ProviderActivationImpact) {
    super("Provider activation requires confirmation of its alert impact");
    this.name = "ProviderActivationConfirmationRequiredError";
  }
}

export class ProviderRegistrationNotFoundError extends Error {
  readonly code = "PROVIDER_REGISTRATION_NOT_FOUND";

  constructor(readonly providerId: string) {
    super(`Provider registration "${providerId}" was not found`);
    this.name = "ProviderRegistrationNotFoundError";
  }
}

export class ProviderManagementService {
  readonly #repository: SqliteProviderRegistrationRepository;
  readonly #adapters: ReadonlyMap<ProviderKind, ProviderManagementAdapter>;
  readonly #secretStore: ProviderManagementServiceOptions["secretStore"];
  readonly #getActivationImpact: ProviderManagementServiceOptions["getActivationImpact"];
  readonly #getUsedByAlertCount: ProviderManagementServiceOptions["getUsedByAlertCount"];
  readonly #generateId: () => string;
  readonly #generateReferenceId: () => string;
  readonly #onEventSourceChanged: () => void | Promise<void>;
  readonly #now: () => Date;

  constructor(options: ProviderManagementServiceOptions) {
    this.#repository = options.repository;
    this.#adapters = options.adapters;
    this.#secretStore = options.secretStore;
    this.#getActivationImpact = options.getActivationImpact;
    this.#getUsedByAlertCount = options.getUsedByAlertCount;
    this.#generateId = options.generateId;
    this.#generateReferenceId = options.generateReferenceId;
    this.#onEventSourceChanged = options.onEventSourceChanged ?? (() => {});
    this.#now = options.now ?? (() => new Date());
  }

  async validateProvider(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    const parsed = providerSetupInputSchema.parse(input);
    const adapter = this.#adapters.get(parsed.kind);
    if (adapter === undefined) {
      return this.#failedValidation(
        `${formatProviderKind(parsed.kind)} is not available`,
        "This runtime does not have a validation adapter for the selected provider.",
        "Install or enable the provider adapter, then retry setup."
      );
    }

    try {
      return providerValidationResultSchema.parse(await adapter.validate(parsed));
    } catch (error) {
      return this.#failedValidation(
        `${formatProviderKind(parsed.kind)} validation failed`,
        error instanceof Error ? error.message : "The provider returned an unknown validation error.",
        "Check the provider connection settings, make sure its local server is running, and retry."
      );
    }
  }

  async registerProvider(input: ProviderSetupInput): Promise<ProviderRegistrationAttempt> {
    const parsed = providerSetupInputSchema.parse(input);
    const validation = await this.validateProvider(parsed);
    if (!validation.valid) {
      return providerRegistrationAttemptSchema.parse({
        status: "validation-failed",
        provider: null,
        validation
      });
    }

    const capability = providerCapabilityForKind(parsed.kind);
    const active = (await this.#repository.findActive(capability)) === null;
    const providerId = this.#generateId();
    const now = this.#now().toISOString();
    const secret = providerCredential(parsed);
    const secretRef = secret === null ? null : createProviderSecretRef(providerId);
    const record: ProviderRegistrationRecord = {
      provider: {
        id: providerId,
        name: parsed.name,
        kind: parsed.kind,
        capability,
        active,
        connectionState: validation.connectionState,
        intakeState:
          capability === "event-source" ? (active ? validation.intakeState ?? "inactive" : "inactive") : null,
        validatedAt: validation.validatedAt,
        error: validation.error,
        usedByAlertCount: 0
      },
      configuration: parsed.configuration,
      availableVoices: validation.availableVoices,
      secretRef,
      ttsSafety: capability === "tts" ? defaultTtsSafety(validation.availableVoices[0]?.id ?? null) : null,
      createdAt: now,
      updatedAt: now
    };

    if (secretRef !== null && secret !== null) {
      await this.#secretStore.setSecret(secretRef, secret);
    }

    try {
      const saved = await this.#repository.save(record);
      if (saved.provider.capability === "event-source" && saved.provider.active) {
        await this.#onEventSourceChanged();
      }
      return providerRegistrationAttemptSchema.parse({
        status: "registered",
        provider: await this.#toDetail(saved),
        validation
      });
    } catch (error) {
      if (secretRef !== null) {
        await this.#secretStore.deleteSecret(secretRef);
      }
      throw error;
    }
  }

  async listProviders(capability: ProviderCapability): Promise<readonly RegisteredProviderView[]> {
    const records = await this.#repository.list(capability);
    return Promise.all(records.map(async (record) => (await this.#toDetail(record)).provider));
  }

  async getProvider(providerId: string): Promise<RegisteredProviderDetail> {
    return this.#toDetail(await this.#requireRecord(providerId));
  }

  async getActivationImpact(providerId: string): Promise<ProviderActivationImpact> {
    await this.#requireRecord(providerId);
    return providerActivationImpactSchema.parse(await this.#getActivationImpact(providerId));
  }

  async activateProvider(providerId: string, confirmWarnings: boolean): Promise<ProviderActivationResult> {
    const target = await this.#requireRecord(providerId);
    const impact = await this.getActivationImpact(providerId);
    const decision = evaluateProviderActivation(impact);
    if (!decision.allowed) {
      throw new ProviderActivationBlockedError(impact);
    }
    if (decision.requiresConfirmation && !confirmWarnings) {
      throw new ProviderActivationConfirmationRequiredError(impact);
    }

    const result = await this.#repository.activate(providerId);
    const activated = await this.#repository.save({
      ...result.provider,
      provider: {
        ...result.provider.provider,
        intakeState:
          target.provider.capability === "event-source"
            ? target.provider.connectionState === "connected"
              ? "active"
              : "error"
            : null
      },
      updatedAt: this.#now().toISOString()
    });
    if (result.replacedProviderId !== null) {
      const replaced = await this.#repository.findById(result.replacedProviderId);
      if (replaced?.provider.capability === "event-source") {
        await this.#repository.save({
          ...replaced,
          provider: { ...replaced.provider, intakeState: "inactive" },
          updatedAt: this.#now().toISOString()
        });
      }
    }

    if (target.provider.capability === "event-source") {
      await this.#onEventSourceChanged();
    }

    return providerActivationResultSchema.parse({
      provider: (await this.#toDetail(activated)).provider,
      replacedProviderId: result.replacedProviderId,
      impact
    });
  }

  async deactivateProvider(providerId: string): Promise<RegisteredProviderView> {
    const target = await this.#requireRecord(providerId);
    const deactivated = await this.#repository.save({
      ...target,
      provider: {
        ...target.provider,
        active: false,
        intakeState: target.provider.capability === "event-source" ? "inactive" : null
      },
      updatedAt: this.#now().toISOString()
    });
    if (target.provider.capability === "event-source") {
      await this.#onEventSourceChanged();
    }
    return (await this.#toDetail(deactivated)).provider;
  }

  async getTtsSafety(providerId: string): Promise<TtsProviderSafetySettings> {
    const record = await this.#requireRecord(providerId);
    if (record.ttsSafety === null) {
      throw new TypeError("Event-source providers do not have TTS safety settings");
    }
    return record.ttsSafety;
  }

  async updateTtsSafety(providerId: string, settings: TtsProviderSafetySettings): Promise<TtsProviderSafetySettings> {
    const record = await this.#requireRecord(providerId);
    if (record.provider.capability !== "tts") {
      throw new TypeError("Event-source providers do not have TTS safety settings");
    }
    const parsed = ttsProviderSafetySettingsSchema.parse(settings);
    const updated = await this.#repository.updateTtsSafety(providerId, parsed);
    if (updated?.ttsSafety === null || updated?.ttsSafety === undefined) {
      throw new ProviderRegistrationNotFoundError(providerId);
    }
    return updated.ttsSafety;
  }

  async testVoice(providerId: string, text: string): Promise<ProviderVoiceTestResult> {
    const detail = await this.getProvider(providerId);
    const adapter = this.#adapters.get(detail.provider.kind);
    if (adapter?.testVoice === undefined) {
      return providerVoiceTestResultSchema.parse({
        delivered: false,
        error: this.#managementError(
          "Voice test is unavailable",
          "The selected provider does not expose a voice-test action.",
          "Validate the provider connection or choose a provider that supports voice tests."
        )
      });
    }

    try {
      return providerVoiceTestResultSchema.parse(await adapter.testVoice({ provider: detail, text }));
    } catch (error) {
      return providerVoiceTestResultSchema.parse({
        delivered: false,
        error: this.#managementError(
          "Voice test failed",
          error instanceof Error ? error.message : "The provider returned an unknown voice-test error.",
          "Check the provider connection, then retry the voice test."
        )
      });
    }
  }

  async #toDetail(record: ProviderRegistrationRecord): Promise<RegisteredProviderDetail> {
    return registeredProviderDetailSchema.parse({
      provider: {
        ...record.provider,
        usedByAlertCount: await this.#getUsedByAlertCount(record.provider.kind)
      },
      configuration: record.configuration,
      availableVoices: record.availableVoices,
      ttsSafety: record.ttsSafety
    });
  }

  async #requireRecord(providerId: string): Promise<ProviderRegistrationRecord> {
    const record = await this.#repository.findById(providerId);
    if (record === null) {
      throw new ProviderRegistrationNotFoundError(providerId);
    }
    return record;
  }

  #failedValidation(summary: string, cause: string, nextStep: string): ProviderValidationResult {
    return providerValidationResultSchema.parse({
      valid: false,
      connectionState: "error",
      intakeState: null,
      validatedAt: this.#now().toISOString(),
      availableVoices: [],
      error: this.#managementError(summary, cause, nextStep)
    });
  }

  #managementError(summary: string, cause: string, nextStep: string): ActionableManagementError {
    const referenceId = this.#generateReferenceId();
    return {
      summary,
      cause,
      nextStep,
      severity: "error",
      occurredAt: this.#now().toISOString(),
      referenceId,
      correction: {
        label: "Open Diagnostics",
        route: `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}`
      }
    };
  }
}

function providerCredential(input: ProviderSetupInput): string | null {
  return input.kind === "streamerbot" && typeof input.credential === "string" && input.credential.length > 0
    ? input.credential
    : null;
}

function createProviderSecretRef(providerId: string): SecretRef {
  return { namespace: "streamerbot", accountId: providerId, name: "password" };
}

function defaultTtsSafety(defaultVoiceId: string | null): TtsProviderSafetySettings {
  return {
    defaultVoiceId,
    volume: 1,
    minimumRate: 0.5,
    maximumRate: 2,
    maximumTextLength: 240
  };
}

function formatProviderKind(kind: ProviderKind): string {
  switch (kind) {
    case "twitch":
      return "Twitch";
    case "streamerbot":
      return "Streamer.bot";
    case "speakerbot":
      return "Speaker.bot";
    case "browser-speech":
      return "Browser Speech";
  }
}
