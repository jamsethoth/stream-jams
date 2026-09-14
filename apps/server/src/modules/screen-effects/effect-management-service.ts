import {
  screenEffectDocumentSchema,
  type EffectBinding,
  type ScreenEffectDocument,
  type ScreenEffectRepository
} from "@stream-jams/core";
import type { EffectAdmissionOutcome } from "./effect-admission-service.js";

export class EffectDefinitionNotFoundError extends Error {
  constructor(readonly effectId: string) {
    super(`Screen Effect "${effectId}" was not found`);
    this.name = "EffectDefinitionNotFoundError";
  }
}

export class EffectDefinitionConflictError extends Error {
  constructor(readonly effectId: string) {
    super(`Screen Effect "${effectId}" already exists`);
    this.name = "EffectDefinitionConflictError";
  }
}

export class EffectLiveImpactConfirmationRequiredError extends Error {
  constructor() {
    super("Confirm the live impact before changing or testing an enabled Screen Effect");
    this.name = "EffectLiveImpactConfirmationRequiredError";
  }
}

export class EffectBindingUnavailableError extends Error {
  constructor(readonly bindingId: string) {
    super(`Screen Effect binding "${bindingId}" is not currently configured`);
    this.name = "EffectBindingUnavailableError";
  }
}

export class EffectTestDisabledError extends Error {
  constructor(readonly effectId: string) {
    super(`Enable Screen Effect "${effectId}" before sending a live test`);
    this.name = "EffectTestDisabledError";
  }
}

export class EffectTestVariantUnavailableError extends Error {
  constructor(readonly variantId: string) {
    super(`Screen Effect variant "${variantId}" is unavailable for live testing`);
    this.name = "EffectTestVariantUnavailableError";
  }
}

export interface EffectManagementServiceOptions {
  readonly repository: ScreenEffectRepository;
  readonly testEffectVariant: (effectId: string, variantId: string) => Promise<EffectAdmissionOutcome>;
  readonly isTwitchRewardAvailable?: (broadcasterId: string, rewardId: string) => Promise<boolean>;
  readonly isStreamerBotSelectionConfigured?: (
    providerId: string,
    sourceKey: string,
    eventType: string
  ) => Promise<boolean>;
  readonly runMutation?: <T>(work: () => Promise<T>) => Promise<T>;
}

export class EffectManagementService {
  readonly #repository: ScreenEffectRepository;
  readonly #testEffectVariant: EffectManagementServiceOptions["testEffectVariant"];
  readonly #isTwitchRewardAvailable: NonNullable<EffectManagementServiceOptions["isTwitchRewardAvailable"]>;
  readonly #isStreamerBotSelectionConfigured: NonNullable<EffectManagementServiceOptions["isStreamerBotSelectionConfigured"]>;
  readonly #runMutation: NonNullable<EffectManagementServiceOptions["runMutation"]>;
  #mutationTail = Promise.resolve();

  constructor(options: EffectManagementServiceOptions) {
    this.#repository = options.repository;
    this.#testEffectVariant = options.testEffectVariant;
    this.#isTwitchRewardAvailable = options.isTwitchRewardAvailable ?? (async () => true);
    this.#isStreamerBotSelectionConfigured = options.isStreamerBotSelectionConfigured ?? (async () => true);
    this.#runMutation = options.runMutation ?? (async (work) => work());
  }

  async list(): Promise<readonly ScreenEffectDocument[]> {
    return this.#repository.list();
  }

  async get(effectId: string): Promise<ScreenEffectDocument> {
    const document = await this.#repository.find(effectId);
    if (document === null) throw new EffectDefinitionNotFoundError(effectId);
    return document;
  }

  async create(candidate: ScreenEffectDocument): Promise<ScreenEffectDocument> {
    const document = screenEffectDocumentSchema.parse(candidate);
    if (document.enabled) {
      throw new EffectLiveImpactConfirmationRequiredError();
    }
    await this.#validateBindings(document.bindings);
    return this.#runSerializedMutation(async () => {
      if (await this.#repository.find(document.id) !== null) {
        throw new EffectDefinitionConflictError(document.id);
      }
      await this.#repository.save(document);
      return document;
    });
  }

  async update(
    effectId: string,
    candidate: ScreenEffectDocument,
    confirmLiveImpact: boolean
  ): Promise<ScreenEffectDocument> {
    const document = screenEffectDocumentSchema.parse(candidate);
    if (document.id !== effectId) {
      throw new EffectDefinitionConflictError(document.id);
    }
    await this.#validateBindings(document.bindings);
    return this.#runSerializedMutation(async () => {
      const current = await this.get(effectId);
      if (JSON.stringify(current) === JSON.stringify(document)) return current;
      if ((current.enabled || document.enabled) && !confirmLiveImpact) {
        throw new EffectLiveImpactConfirmationRequiredError();
      }
      await this.#repository.save(document);
      return document;
    });
  }

  async remove(effectId: string): Promise<void> {
    await this.#runSerializedMutation(async () => {
      await this.get(effectId);
      await this.#repository.remove(effectId);
    });
  }

  async test(
    effectId: string,
    variantId: string,
    confirmLiveImpact: boolean
  ): Promise<EffectAdmissionOutcome> {
    if (!confirmLiveImpact) throw new EffectLiveImpactConfirmationRequiredError();
    const document = await this.get(effectId);
    if (!document.enabled) throw new EffectTestDisabledError(effectId);
    if (!document.variants.some((variant) => variant.id === variantId && variant.enabled)) {
      throw new EffectTestVariantUnavailableError(variantId);
    }
    return this.#testEffectVariant(effectId, variantId);
  }

  async #validateBindings(bindings: readonly EffectBinding[]): Promise<void> {
    for (const binding of bindings) {
      const available = binding.kind === "twitch-reward"
        ? await this.#isTwitchRewardAvailable(binding.broadcasterId, binding.rewardId)
        : await this.#isStreamerBotSelectionConfigured(
          binding.providerId,
          binding.sourceKey,
          binding.eventType
        );
      if (!available) throw new EffectBindingUnavailableError(binding.id);
    }
  }

  async #runSerializedMutation<T>(work: () => Promise<T>): Promise<T> {
    const mutation = this.#mutationTail.then(() => this.#runMutation(work));
    this.#mutationTail = mutation.then(() => undefined, () => undefined);
    return mutation;
  }
}
