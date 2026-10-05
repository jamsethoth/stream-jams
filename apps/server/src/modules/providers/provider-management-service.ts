import { randomBytes } from "node:crypto";
import {
  evaluateProviderActivation,
  localWebSocketConnectionSchema,
  providerActivationImpactSchema,
  providerActivationResultSchema,
  providerCapabilityForKind,
  providerRegistrationAttemptSchema,
  musicCredentialReplacementInputSchema,
  musicCredentialReplacementResultSchema,
  providerSetupInputSchema,
  providerValidationResultSchema,
  providerVoiceTestResultSchema,
  registeredProviderDetailSchema,
  streamerBotSubscriptionCatalogSchema,
  streamerBotSubscriptionUpdateInputSchema,
  ttsProviderSafetySettingsSchema,
  type ActionableManagementError,
  type Logger,
  type ProviderActivationImpact,
  type ProviderActivationResult,
  type ProviderCapability,
  type ProviderKind,
  type ProviderRegistrationAttempt,
  type ProviderSetupInput,
  type ProviderValidationResult,
  type ProviderVoiceTestResult,
  type PearConfiguration,
  type MusicCredentialReplacementInput,
  type MusicCredentialReplacementResult,
  type RegisteredProviderDetail,
  type RegisteredProviderView,
  type SecretRef,
  type StreamerBotSubscriptionCatalog,
  type StreamerBotSubscriptionSelection,
  type StreamerBotSubscriptionUpdateInput,
  type TtsProviderSafetySettings
} from "@stream-jams/core";
import type {
  ProviderRegistrationRecord,
  SqliteProviderRegistrationRepository
} from "./sqlite-provider-registration-repository.js";
import type { PearPairingClaim, PearPairingService } from "../music/pear-pairing-service.js";

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
  readonly musicPairing?: Pick<PearPairingService, "reserve"> | undefined;
  readonly validateMusicConnection?: ((config: PearConfiguration, token: string, signal: AbortSignal) => Promise<ProviderValidationResult>) | undefined;
  /** Own the complete async Pear lifecycle, including queued writes and postcommit cleanup. */
  readonly runMusicMutation?: <T>(work: () => Promise<T>) => Promise<T>;
  readonly getActivationImpact: (providerId: string) => Promise<ProviderActivationImpact>;
  readonly getUsedByAlertCount: (kind: ProviderKind) => Promise<number>;
  readonly generateId: () => string;
  readonly generateReferenceId: () => string;
  readonly logger?: Pick<Logger, "error"> | undefined;
  readonly onEventSourceChanged?: (() => void | Promise<void>) | undefined;
  readonly onMusicSourceChanged?: (() => void | Promise<void>) | undefined;
  readonly streamerBotSubscriptions?: StreamerBotSubscriptionRuntime | undefined;
  readonly getVerifiedTwitchBroadcasterId?: (() => Promise<string | null>) | undefined;
  readonly now?: () => Date;
}

export interface StreamerBotSubscriptionRuntime {
  getCatalog(providerId: string): Promise<Record<string, readonly string[]>>;
  replaceExternalSubscriptions(
    providerId: string,
    next: readonly StreamerBotSubscriptionSelection[],
    broadcasterId: string | null
  ): Promise<{ rollback(): Promise<void> }>;
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

export class StreamerBotSubscriptionWrongProviderError extends Error {
  readonly code = "STREAMERBOT_SUBSCRIPTIONS_WRONG_PROVIDER";

  constructor() {
    super("Streamer.bot subscriptions require a Streamer.bot provider");
    this.name = "StreamerBotSubscriptionWrongProviderError";
  }
}

export class StreamerBotSubscriptionInactiveError extends Error {
  readonly code = "STREAMERBOT_SUBSCRIPTIONS_INACTIVE";

  constructor() {
    super("Only the active Streamer.bot provider can update subscriptions");
    this.name = "StreamerBotSubscriptionInactiveError";
  }
}

export class StreamerBotSubscriptionSelectionUnavailableError extends Error {
  readonly code = "STREAMERBOT_SUBSCRIPTION_UNAVAILABLE";

  constructor(readonly unavailableSelections: readonly StreamerBotSubscriptionSelection[]) {
    super("One or more selected Streamer.bot events are no longer advertised");
    this.name = "StreamerBotSubscriptionSelectionUnavailableError";
  }
}

export class StreamerBotBroadcasterUnverifiedError extends Error {
  readonly code = "STREAMERBOT_BROADCASTER_UNVERIFIED";

  constructor() {
    super("The selected Twitch broadcaster is not the currently verified catalog account");
    this.name = "StreamerBotBroadcasterUnverifiedError";
  }
}

export class ProviderManagementService {
  readonly #repository: SqliteProviderRegistrationRepository;
  readonly #adapters: ReadonlyMap<ProviderKind, ProviderManagementAdapter>;
  readonly #secretStore: ProviderManagementServiceOptions["secretStore"];
  readonly #musicPairing: ProviderManagementServiceOptions["musicPairing"];
  readonly #validateMusicConnection: ProviderManagementServiceOptions["validateMusicConnection"];
  readonly #runMusicMutation: NonNullable<ProviderManagementServiceOptions["runMusicMutation"]>;
  readonly #getActivationImpact: ProviderManagementServiceOptions["getActivationImpact"];
  readonly #getUsedByAlertCount: ProviderManagementServiceOptions["getUsedByAlertCount"];
  readonly #generateId: () => string;
  readonly #generateReferenceId: () => string;
  readonly #logger: Pick<Logger, "error"> | null;
  readonly #onEventSourceChanged: () => void | Promise<void>;
  readonly #onMusicSourceChanged: () => void | Promise<void>;
  readonly #streamerBotSubscriptions: StreamerBotSubscriptionRuntime | null;
  readonly #getVerifiedTwitchBroadcasterId: () => Promise<string | null>;
  readonly #now: () => Date;
  #pendingStreamerBotSubscriptionMutation: Promise<unknown> = Promise.resolve();
  #pendingMusicCredentialMutation: Promise<unknown> = Promise.resolve();

  constructor(options: ProviderManagementServiceOptions) {
    this.#repository = options.repository;
    this.#adapters = options.adapters;
    this.#secretStore = options.secretStore;
    this.#musicPairing = options.musicPairing;
    this.#validateMusicConnection = options.validateMusicConnection;
    this.#runMusicMutation = options.runMusicMutation ?? (work => work());
    this.#getActivationImpact = options.getActivationImpact;
    this.#getUsedByAlertCount = options.getUsedByAlertCount;
    this.#generateId = options.generateId;
    this.#generateReferenceId = options.generateReferenceId;
    this.#logger = options.logger ?? null;
    this.#onEventSourceChanged = options.onEventSourceChanged ?? (() => {});
    this.#onMusicSourceChanged = options.onMusicSourceChanged ?? (() => {});
    this.#streamerBotSubscriptions = options.streamerBotSubscriptions ?? null;
    this.#getVerifiedTwitchBroadcasterId = options.getVerifiedTwitchBroadcasterId ?? (async () => null);
    this.#now = options.now ?? (() => new Date());
  }

  async validateProvider(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    const parsed = providerSetupInputSchema.parse(input);
    return parsed.kind === "pear-desktop" ? this.#runMusicMutation(() => this.#validateProvider(parsed)) : this.#validateProvider(parsed);
  }

  async #validateProvider(parsed: ReturnType<typeof providerSetupInputSchema.parse>): Promise<ProviderValidationResult> {
    if (parsed.kind === "pear-desktop") {
      if (parsed.pairingAttemptId === undefined || this.#musicPairing === undefined || this.#validateMusicConnection === undefined) {
        return this.#failedValidation("Pear pairing is required", "Approve a local Pear pairing request before connecting.", "Pair Pear Desktop and retry setup.");
      }
      let claim: PearPairingClaim;
      try { claim = this.#musicPairing.reserve(parsed.pairingAttemptId, parsed.configuration); }
      // error-provenance: allow expected -- invalid/used pairing claims return bounded setup guidance
      catch { return this.#failedValidation("Pear pairing is unavailable", "The pairing request expired, was cancelled, or has already been used.", "Start a new pairing request."); }
      try {
        return await this.#validatePear(parsed.configuration, claim.token);
      } finally { claim.release(); }
    }
    if (parsed.kind === "streamerbot" && !parsed.credential && !parsed.configuration.allowUnauthenticatedLocalConnection) {
      return this.#failedValidation("Streamer.bot authentication must be configured", "A password or explicit local unauthenticated consent is required.", "Enable Authentication and Enforce in Streamer.bot and enter the password, or explicitly allow an unauthenticated local connection.");

    }
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
    }
    // error-provenance: allow expected -- adapter error text may contain provider credentials; record only the bounded management failure
    catch {
      return this.#failedValidation(
        `${formatProviderKind(parsed.kind)} validation failed`,
        "The provider connection could not be validated.",
        "Check the provider connection settings, make sure its local server is running, and retry."
      );
    }
  }

  async registerProvider(input: ProviderSetupInput): Promise<ProviderRegistrationAttempt> {
    const parsed = providerSetupInputSchema.parse(input);
    return parsed.kind === "pear-desktop" ? this.#runMusicMutation(() => this.#registerProvider(parsed)) : this.#registerProvider(parsed);
  }

  async #registerProvider(parsed: ReturnType<typeof providerSetupInputSchema.parse>): Promise<ProviderRegistrationAttempt> {
    let claim: PearPairingClaim | null = null;
    if (parsed.kind === "pear-desktop" && parsed.pairingAttemptId !== undefined && this.#musicPairing !== undefined && this.#validateMusicConnection !== undefined) {
      try { claim = this.#musicPairing.reserve(parsed.pairingAttemptId, parsed.configuration); }
      // error-provenance: allow expected -- invalid claim follows the ordinary failed-validation path below
      catch { /* Validation below returns a bounded management error. */ }
    }
    const validation = claim !== null && parsed.kind === "pear-desktop"
      ? await this.#validatePear(parsed.configuration, claim.token)
      : await this.#validateProvider(parsed);
    claim?.assertActive();
    if (!validation.valid) {
      claim?.release();
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
    const secret = parsed.kind === "pear-desktop"
      ? claim?.token ?? null
      : providerCredential(parsed);
    const secretRef = secret === null ? null : createProviderSecretRef(providerId, parsed.kind);
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
      try {
        claim?.assertActive();
        await this.#secretStore.setSecret(secretRef, secret);
        claim?.assertActive();
      }
      catch (error) {
        await this.#secretStore.deleteSecret(secretRef);
        claim?.release();
        throw error;
      }
    }

    let saved: ProviderRegistrationRecord;
    try {
      claim?.assertActive();
      saved = await this.#repository.save(record);
      claim?.assertActive();
      claim?.complete();
    } catch (error) {
      if (claim !== null) await this.#repository.delete(providerId);
      if (secretRef !== null) await this.#secretStore.deleteSecret(secretRef);
      claim?.release();
      throw error;
    }
    try {
      if (saved.provider.capability === "event-source" && saved.provider.active) {
        await this.#onEventSourceChanged();
      }
      if (saved.provider.capability === "music-source" && saved.provider.active) {
        await this.#onMusicSourceChanged();
      }
    }
    // error-provenance: allow expected -- committed registration stays durable while runtime retries independently
    catch {
      // The record and its credential are durable. Runtime reconciliation retries separately.
    }
    return providerRegistrationAttemptSchema.parse({
      status: "registered", provider: await this.#toDetail(saved), validation
    });
  }

  /** Replace an existing Pear credential without changing its registration or active selection. */
  replaceMusicCredential(providerId: string, input: MusicCredentialReplacementInput): Promise<MusicCredentialReplacementResult> {
    return this.#runMusicMutation(() => this.#queueMusicCredentialReplacement(providerId, input));
  }

  #queueMusicCredentialReplacement(providerId: string, input: MusicCredentialReplacementInput): Promise<MusicCredentialReplacementResult> {
    const result = this.#pendingMusicCredentialMutation.then(() => this.#replaceMusicCredential(providerId, input));
    this.#pendingMusicCredentialMutation = result.catch(
      // error-provenance: allow expected -- caller observes replacement error; serialized queue remains usable
      () => undefined
    );
    return result;
  }

  async #replaceMusicCredential(providerId: string, input: MusicCredentialReplacementInput): Promise<MusicCredentialReplacementResult> {
    const parsed = musicCredentialReplacementInputSchema.parse(input);
    const record = await this.#requireRecord(providerId);
    if (record.provider.kind !== "pear-desktop" || this.#musicPairing === undefined || this.#validateMusicConnection === undefined) {
      throw new MusicCredentialReplacementUnavailableError();
    }
    let claim: PearPairingClaim;
    try { claim = this.#musicPairing.reserve(parsed.pairingAttemptId, parsed.configuration); }
    // error-provenance: allow expected -- rejected replacement claim returns bounded setup guidance
    catch { return { validation: await this.#failedValidation("Pear pairing is unavailable", "The pairing request expired, was cancelled, or has already been used.", "Start a new pairing request."), runtimeReconcilePending: false, credentialRetirementPending: false }; }
    const newSecretRef: SecretRef = { namespace: "music", accountId: providerId, name: `access-token-${randomBytes(16).toString("hex")}` };
    let attemptedSave = false;
    let previousForRollback: ProviderRegistrationRecord | null = null;
    try {
      const validation = await this.#validatePear(parsed.configuration, claim.token);
      claim.assertActive();
      if (!validation.valid) return { validation, runtimeReconcilePending: false, credentialRetirementPending: false };
      await this.#secretStore.setSecret(newSecretRef, claim.token);
      claim.assertActive();
      const current = await this.#requireRecord(providerId);
      if (current.provider.kind !== "pear-desktop") throw new MusicCredentialReplacementUnavailableError();
      previousForRollback = current;
      claim.assertActive();
      attemptedSave = true;
      await this.#repository.save({
        ...current,
        configuration: parsed.configuration,
        secretRef: newSecretRef,
        provider: { ...current.provider, connectionState: validation.connectionState, validatedAt: validation.validatedAt, error: null },
        updatedAt: this.#now().toISOString()
      });
      claim.assertActive();
      claim.complete();
      // The repository now durably points at the new credential. Runtime errors cannot undo it.
      let runtimeReconcilePending = false;
      try { if (current.provider.active) await this.#onMusicSourceChanged(); }
      // error-provenance: allow expected -- committed credential remains valid; management reports pending runtime retry
      catch { runtimeReconcilePending = true; }
      let credentialRetirementPending = false;
      if (current.secretRef !== null) {
        try { await this.#secretStore.deleteSecret(current.secretRef); }
        // error-provenance: allow cleanup -- new credential is durable; management reports old-secret retirement pending
        catch { credentialRetirementPending = true; }
      }
      return musicCredentialReplacementResultSchema.parse({ validation, runtimeReconcilePending, credentialRetirementPending });
    } catch (error) {
      if (attemptedSave && previousForRollback !== null) {
        const afterFailure = await this.#repository.findById(providerId);
        if (afterFailure?.secretRef?.name === newSecretRef.name) {
          await this.#repository.save({
            ...afterFailure,
            configuration: previousForRollback.configuration,
            secretRef: previousForRollback.secretRef,
            provider: {
              ...afterFailure.provider,
              connectionState: previousForRollback.provider.connectionState,
              validatedAt: previousForRollback.provider.validatedAt,
              error: previousForRollback.provider.error
            },
            updatedAt: this.#now().toISOString()
          });
        }
      }
      await this.#secretStore.deleteSecret(newSecretRef);
      throw error;
    } finally {
      claim.release();
    }
  }

  async #validatePear(config: PearConfiguration, token: string): Promise<ProviderValidationResult> {
    try {
      const result = providerValidationResultSchema.parse(await this.#validateMusicConnection!(config, token, AbortSignal.timeout(5_000)));
      if (result.valid) return { ...result, error: null };
    }
    // error-provenance: allow expected -- upstream connection errors may contain credentials; return bounded guidance
    catch { /* Never surface upstream credential-bearing diagnostics. */ }
    return this.#failedValidation("Pear connection failed", "Pear did not confirm a usable music connection.", "Check Pear Desktop and retry pairing.");
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
    return target.provider.capability === "music-source"
      ? this.#runMusicMutation(() => this.#activateProvider(providerId, confirmWarnings))
      : this.#activateProvider(providerId, confirmWarnings);
  }

  async #activateProvider(providerId: string, confirmWarnings: boolean): Promise<ProviderActivationResult> {
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
    const activated = target.provider.capability === "music-source" ? result.provider : await this.#repository.save({
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
    if (target.provider.capability === "music-source") {
      await this.#onMusicSourceChanged();
    }

    return providerActivationResultSchema.parse({
      provider: (await this.#toDetail(activated)).provider,
      replacedProviderId: result.replacedProviderId,
      impact
    });
  }

  async deactivateProvider(providerId: string): Promise<RegisteredProviderView> {
    const target = await this.#requireRecord(providerId);
    return target.provider.capability === "music-source"
      ? this.#runMusicMutation(() => this.#deactivateProvider(providerId))
      : this.#deactivateProvider(providerId);
  }

  async #deactivateProvider(providerId: string): Promise<RegisteredProviderView> {
    const target = await this.#requireRecord(providerId);
    const deactivated = target.provider.capability === "music-source"
      ? await this.#repository.deactivateMusic(providerId)
      : await this.#repository.save({
      ...target,
      provider: {
        ...target.provider,
        active: false,
        intakeState: target.provider.capability === "event-source" ? "inactive" : null
      },
      updatedAt: this.#now().toISOString()
    });
    if (deactivated === null) throw new ProviderRegistrationNotFoundError(providerId);
    if (target.provider.capability === "event-source") {
      await this.#onEventSourceChanged();
    }
    if (target.provider.capability === "music-source" && target.provider.active) {
      await this.#onMusicSourceChanged();
    }
    return (await this.#toDetail(deactivated)).provider;
  }

  async getStreamerBotSubscriptions(providerId: string): Promise<StreamerBotSubscriptionCatalog> {
    const record = await this.#requireStreamerBot(providerId);
    const configuration = readStreamerBotConfiguration(record);
    if (!record.provider.active || this.#streamerBotSubscriptions === null) {
      return toStreamerBotSubscriptionCatalog(record.provider.id, configuration, null);
    }

    const catalog = await this.#streamerBotSubscriptions.getCatalog(providerId);
    return toStreamerBotSubscriptionCatalog(record.provider.id, configuration, catalog);
  }

  updateStreamerBotSubscriptions(
    providerId: string,
    input: StreamerBotSubscriptionUpdateInput
  ): Promise<StreamerBotSubscriptionCatalog> {
    const result = this.#pendingStreamerBotSubscriptionMutation.then(
      () => this.#updateStreamerBotSubscriptions(providerId, input)
    );
    this.#pendingStreamerBotSubscriptionMutation = result.catch(
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    () => undefined);
    return result;
  }

  async #updateStreamerBotSubscriptions(
    providerId: string,
    input: StreamerBotSubscriptionUpdateInput
  ): Promise<StreamerBotSubscriptionCatalog> {
    const parsed = streamerBotSubscriptionUpdateInputSchema.parse(input);
    const record = await this.#requireStreamerBot(providerId);
    if (!record.provider.active || this.#streamerBotSubscriptions === null) {
      throw new StreamerBotSubscriptionInactiveError();
    }

    if (parsed.twitchBroadcasterId !== null) {
      const verifiedBroadcasterId = await this.#getVerifiedTwitchBroadcasterId();
      if (verifiedBroadcasterId !== parsed.twitchBroadcasterId) {
        throw new StreamerBotBroadcasterUnverifiedError();
      }
    }

    const configuration = readStreamerBotConfiguration(record);
    const catalog = await this.#streamerBotSubscriptions.getCatalog(providerId);
    const unavailable = unavailableSelections(parsed.externalSubscriptions, catalog);
    if (unavailable.length > 0) {
      throw new StreamerBotSubscriptionSelectionUnavailableError(unavailable);
    }

    const runtimeMutation = await this.#streamerBotSubscriptions.replaceExternalSubscriptions(
      providerId,
      parsed.externalSubscriptions,
      parsed.twitchBroadcasterId
    );
    try {
      await this.#repository.save({
        ...record,
        configuration: {
          protocol: configuration.protocol,
          host: configuration.host,
          port: configuration.port,
          endpoint: configuration.endpoint,
          allowUnauthenticatedLocalConnection: configuration.allowUnauthenticatedLocalConnection,
          twitchBroadcasterId: parsed.twitchBroadcasterId,
          externalSubscriptions: parsed.externalSubscriptions
        },
        updatedAt: this.#now().toISOString()
      });
    } catch (error) {
      try {
        await runtimeMutation.rollback();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Provider persistence failed and the live Streamer.bot subscription rollback also failed",
          // eslint-disable-next-line preserve-caught-error -- the outer persistence failure stays primary; rollback remains secondary in errors
          { cause: error }
        );
      }
      throw error;
    }

    return toStreamerBotSubscriptionCatalog(providerId, {
      ...configuration,
      twitchBroadcasterId: parsed.twitchBroadcasterId,
      externalSubscriptions: parsed.externalSubscriptions
    }, catalog);
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
        error: await this.#managementError(
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
        error: await this.#managementError(
          "Voice test failed",
          error instanceof Error ? error.message : "The provider returned an unknown voice-test error.",
          "Review the provider error, correct the voice alias or connection settings, then retry the voice test."
        )
      });
    }
  }

  async #toDetail(record: ProviderRegistrationRecord): Promise<RegisteredProviderDetail> {
    const localProvider = record.provider.kind === "streamerbot" || record.provider.kind === "speakerbot";
    const validConnection = !localProvider || localWebSocketConnectionSchema.safeParse({
      protocol: record.configuration.protocol,
      host: record.configuration.host,
      port: record.configuration.port,
      endpoint: record.configuration.endpoint
    }).success;
    const unsafeError = validConnection ? null : await this.#managementError(
      "Provider connection settings require replacement",
      "The saved connection is not a supported credential-free local connection.",
      "Replace the provider with a loopback host and a path-only endpoint."
    );
    return registeredProviderDetailSchema.parse({
      provider: {
        ...record.provider,
        ...(!validConnection ? { connectionState: "error", intakeState: record.provider.capability === "event-source" ? "inactive" : null, error: unsafeError } : {}),
        usedByAlertCount: await this.#getUsedByAlertCount(record.provider.kind)
      },
      configuration: validConnection ? record.configuration : {},
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

  async #requireStreamerBot(providerId: string): Promise<ProviderRegistrationRecord> {
    const record = await this.#requireRecord(providerId);
    if (record.provider.kind !== "streamerbot") {
      throw new StreamerBotSubscriptionWrongProviderError();
    }
    return record;
  }

  async #failedValidation(summary: string, cause: string, nextStep: string): Promise<ProviderValidationResult> {
    return providerValidationResultSchema.parse({
      valid: false,
      connectionState: "error",
      intakeState: null,
      validatedAt: this.#now().toISOString(),
      availableVoices: [],
      error: await this.#managementError(summary, cause, nextStep)
    });
  }

  async #managementError(summary: string, cause: string, nextStep: string): Promise<ActionableManagementError> {
    const referenceId = this.#generateReferenceId();
    const error: ActionableManagementError = {
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
    await this.#logger?.error(cause, {
      module: "providers",
      source: "provider.management.failure",
      correlationId: referenceId,
      processingId: null,
      metadata: { summary, nextStep }
    });
    return error;
  }
}

export class MusicCredentialReplacementUnavailableError extends Error {
  readonly code = "MUSIC_CREDENTIAL_REPLACEMENT_UNAVAILABLE";
  constructor() { super("This registration cannot be re-paired with Pear Desktop"); }
}

type StreamerBotConfiguration = Extract<
  ReturnType<typeof providerSetupInputSchema.parse>,
  { readonly kind: "streamerbot" }
>["configuration"];

function readStreamerBotConfiguration(record: ProviderRegistrationRecord): StreamerBotConfiguration {
  const parsed = providerSetupInputSchema.parse({
    name: record.provider.name,
    kind: "streamerbot",
    configuration: record.configuration
  });
  if (parsed.kind !== "streamerbot") throw new StreamerBotSubscriptionWrongProviderError();
  return parsed.configuration;
}

function toStreamerBotSubscriptionCatalog(
  providerId: string,
  configuration: StreamerBotConfiguration,
  catalog: Record<string, readonly string[]> | null
): StreamerBotSubscriptionCatalog {
  const sources = catalog === null
    ? []
    : Object.entries(catalog)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([sourceKey, eventTypes]) => ({ sourceKey, eventTypes: [...eventTypes].sort() }));
  return streamerBotSubscriptionCatalogSchema.parse({
    providerId,
    available: catalog !== null,
    sources,
    selected: configuration.externalSubscriptions,
    unavailableSelections: catalog === null
      ? configuration.externalSubscriptions
      : unavailableSelections(configuration.externalSubscriptions, catalog),
    twitchBroadcasterId: configuration.twitchBroadcasterId
  });
}

function unavailableSelections(
  selections: readonly StreamerBotSubscriptionSelection[],
  catalog: Record<string, readonly string[]>
): StreamerBotSubscriptionSelection[] {
  return selections.flatMap((selection) => {
    const available = new Set(catalog[selection.sourceKey] ?? []);
    const eventTypes = selection.eventTypes.filter((eventType) => !available.has(eventType));
    return eventTypes.length === 0 ? [] : [{ sourceKey: selection.sourceKey, eventTypes }];
  });
}

function providerCredential(input: ProviderSetupInput): string | null {
  return input.kind === "streamerbot" && typeof input.credential === "string" && input.credential.length > 0
    ? input.credential
    : null;
}

function createProviderSecretRef(providerId: string, kind: ProviderKind): SecretRef {
  return kind === "pear-desktop"
    ? { namespace: "music", accountId: providerId, name: "access-token" }
    : { namespace: "streamerbot", accountId: providerId, name: "password" };
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
    case "pear-desktop":
      return "Pear Desktop";
  }
}
