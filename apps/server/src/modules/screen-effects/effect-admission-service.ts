import {
  effectTriggerSchema,
  matchesEffectBinding,
  resolveEffectContent,
  type EffectContentSnapshot,
  type EffectOccurrence,
  type EffectQueue,
  type EffectTrigger,
  type PlaybackCooldownKeyService,
  type PlaybackDedupeKeyService,
  type ScreenEffectDocument,
  type ScreenEffectRepository
} from "@stream-jams/core";

export type EffectAdmissionOutcomeStatus =
  | "queued"
  | "cooldown"
  | "full"
  | "no-output"
  | "missing-reference"
  | "unavailable-output"
  | "module-disabled";

export interface EffectAdmissionOutcome {
  readonly effectId: string;
  readonly status: EffectAdmissionOutcomeStatus;
  readonly occurrenceId?: string;
}

export type EffectAdmissionResult =
  | { readonly status: "module-disabled"; readonly eventId: string; readonly outcomes: readonly [] }
  | { readonly status: "duplicate"; readonly eventId: string; readonly outcomes: readonly [] }
  | { readonly status: "no-matches"; readonly eventId: string; readonly outcomes: readonly [] }
  | {
      readonly status: "processed";
      readonly eventId: string;
      readonly outcomes: readonly EffectAdmissionOutcome[];
    };

export interface EffectAdmissionServiceOptions {
  readonly repository: Pick<ScreenEffectRepository, "list" | "find">;
  readonly queue: EffectQueue;
  readonly dedupe: PlaybackDedupeKeyService;
  readonly cooldowns: PlaybackCooldownKeyService;
  readonly getModuleCooldownSeconds: () => Promise<number>;
  readonly generateOccurrenceId: () => string;
  readonly random?: () => number;
  readonly now?: () => number;
  readonly validateReferences?: (content: EffectContentSnapshot) => Promise<boolean>;
  readonly validateOutputAvailability?: (content: EffectContentSnapshot) => Promise<boolean>;
  readonly isModuleEnabled?: () => Promise<boolean>;
  readonly onOutcome?: (result: EffectAdmissionResult) => void | Promise<void>;
}

interface MatchedEffect {
  readonly document: ScreenEffectDocument;
  readonly trigger: EffectTrigger;
}

const EFFECT_DEDUPE_NAMESPACE = "screen-effects";
const EFFECT_COOLDOWN_NAMESPACE = "screen-effects-effect";
const MODULE_COOLDOWN_NAMESPACE = "screen-effects-module";

export class EffectDefinitionNotFoundError extends Error {
  constructor(readonly effectId: string) {
    super(`Screen Effect "${effectId}" was not found`);
    this.name = "EffectDefinitionNotFoundError";
  }
}

export class EffectRecentOccurrenceNotFoundError extends Error {
  constructor(readonly occurrenceId: string) {
    super(`Screen Effect occurrence "${occurrenceId}" is not retained`);
    this.name = "EffectRecentOccurrenceNotFoundError";
  }
}

export class EffectVariantNotFoundError extends Error {
  constructor(readonly effectId: string, readonly variantId: string) {
    super(`Screen Effect variant "${variantId}" was not found in "${effectId}"`);
    this.name = "EffectVariantNotFoundError";
  }
}

export class EffectAdmissionService {
  readonly #repository: Pick<ScreenEffectRepository, "list" | "find">;
  readonly #queue: EffectQueue;
  readonly #dedupe: PlaybackDedupeKeyService;
  readonly #cooldowns: PlaybackCooldownKeyService;
  readonly #getModuleCooldownSeconds: () => Promise<number>;
  readonly #generateOccurrenceId: () => string;
  readonly #random: () => number;
  readonly #now: () => number;
  readonly #validateReferences: (content: EffectContentSnapshot) => Promise<boolean>;
  readonly #validateOutputAvailability: (content: EffectContentSnapshot) => Promise<boolean>;
  readonly #isModuleEnabled: () => Promise<boolean>;
  readonly #onOutcome: NonNullable<EffectAdmissionServiceOptions["onOutcome"]>;
  #nextSequence = 0;

  constructor(options: EffectAdmissionServiceOptions) {
    this.#repository = options.repository;
    this.#queue = options.queue;
    this.#dedupe = options.dedupe;
    this.#cooldowns = options.cooldowns;
    this.#getModuleCooldownSeconds = options.getModuleCooldownSeconds;
    this.#generateOccurrenceId = options.generateOccurrenceId;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
    this.#validateReferences = options.validateReferences ?? (async () => true);
    this.#validateOutputAvailability = options.validateOutputAvailability ?? (async () => true);
    this.#isModuleEnabled = options.isModuleEnabled ?? (async () => true);
    this.#onOutcome = options.onOutcome ?? (() => {});
  }

  async handleTriggers(candidateTriggers: readonly EffectTrigger[]): Promise<EffectAdmissionResult> {
    const triggers = effectTriggerSchema.array().min(1).parse(candidateTriggers);
    const eventId = triggers[0]!.eventId;
    if (triggers.some((trigger) => trigger.eventId !== eventId)) {
      throw new TypeError("Screen Effects trigger batches must describe one upstream event");
    }
    if (!await this.#isModuleEnabled()) {
      return this.#report({ status: "module-disabled", eventId, outcomes: [] });
    }

    if (!this.#dedupe.acceptKey(EFFECT_DEDUPE_NAMESPACE, eventId)) {
      return this.#report({ status: "duplicate", eventId, outcomes: [] });
    }

    const [documents, moduleCooldownSeconds] = await Promise.all([
      this.#repository.list(),
      this.#getModuleCooldownSeconds()
    ]);
    validateCooldown(moduleCooldownSeconds);
    const matches = matchEffects(documents, triggers);
    if (!await this.#isModuleEnabled()) {
      return this.#report({ status: "module-disabled", eventId, outcomes: [] });
    }
    if (matches.length === 0) {
      return this.#report({ status: "no-matches", eventId, outcomes: [] });
    }

    return this.#admitMatches(eventId, matches, moduleCooldownSeconds);
  }

  async testEffect(effectId: string): Promise<EffectAdmissionOutcome> {
    if (!await this.#isModuleEnabled()) return { effectId, status: "module-disabled" };
    const document = await this.#repository.find(effectId);
    if (document === null) {
      throw new EffectDefinitionNotFoundError(effectId);
    }
    if (!this.#queue.hasPendingCapacity()) {
      return { effectId, status: "full" };
    }
    const content = resolveEffectContent(document, this.#random());
    return this.#enqueueExplicit(content, null);
  }

  async testEffectVariant(effectId: string, variantId: string): Promise<EffectAdmissionOutcome> {
    if (!await this.#isModuleEnabled()) return { effectId, status: "module-disabled" };
    const document = await this.#repository.find(effectId);
    if (document === null) {
      throw new EffectDefinitionNotFoundError(effectId);
    }
    const variant = document.variants.find((candidate) => candidate.id === variantId && candidate.enabled);
    if (variant === undefined) {
      throw new EffectVariantNotFoundError(effectId, variantId);
    }
    if (!this.#queue.hasPendingCapacity()) {
      return { effectId, status: "full" };
    }
    return this.#enqueueExplicit({
      effectId: document.id,
      effectName: document.name,
      variant: structuredClone(variant),
      priority: document.priority
    }, null);
  }

  async replayRecent(occurrenceId: string): Promise<EffectAdmissionOutcome> {
    const retained = this.#queue.snapshot().recent.find((candidate) => candidate.id === occurrenceId);
    if (retained === undefined) {
      throw new EffectRecentOccurrenceNotFoundError(occurrenceId);
    }
    if (!await this.#isModuleEnabled()) {
      return { effectId: retained.content.effectId, status: "module-disabled" };
    }
    if (!this.#queue.hasPendingCapacity()) {
      return { effectId: retained.content.effectId, status: "full" };
    }
    return this.#enqueueExplicit(retained.content, retained.trigger);
  }

  async #enqueueExplicit(
    content: EffectContentSnapshot,
    trigger: EffectTrigger | null
  ): Promise<EffectAdmissionOutcome> {
    if (!await this.#isModuleEnabled()) {
      return { effectId: content.effectId, status: "module-disabled" };
    }
    if (!hasSelectedOutput(content.variant)) {
      return { effectId: content.effectId, status: "no-output" };
    }
    if (!await this.#validateReferences(content)) {
      return { effectId: content.effectId, status: "missing-reference" };
    }
    if (!await this.#validateOutputAvailability(content)) {
      return { effectId: content.effectId, status: "unavailable-output" };
    }
    if (!this.#queue.hasPendingCapacity()) {
      return { effectId: content.effectId, status: "full" };
    }

    const occurrenceId = this.#generateOccurrenceId();
    const queued = this.#queue.enqueue(this.#createOccurrence(occurrenceId, content, trigger));
    return queued === "full"
      ? { effectId: content.effectId, status: "full" }
      : { effectId: content.effectId, status: "queued", occurrenceId };
  }

  async #admitMatches(
    eventId: string,
    matches: readonly MatchedEffect[],
    moduleCooldownSeconds: number
  ): Promise<EffectAdmissionResult> {
    const moduleReady = this.#cooldowns.canPlayKey(
      MODULE_COOLDOWN_NAMESPACE,
      "screen-effects",
      moduleCooldownSeconds
    );
    const outcomes: EffectAdmissionOutcome[] = [];
    let admittedAny = false;
    for (const match of matches) {
      const { document } = match;
      if (
        !moduleReady
        || !this.#cooldowns.canPlayKey(EFFECT_COOLDOWN_NAMESPACE, document.id, document.cooldownSeconds)
      ) {
        outcomes.push({ effectId: document.id, status: "cooldown" });
        continue;
      }
      if (!this.#queue.hasPendingCapacity()) {
        outcomes.push({ effectId: document.id, status: "full" });
        continue;
      }

      const content = resolveEffectContent(document, this.#random());
      if (!hasSelectedOutput(content.variant)) {
        outcomes.push({ effectId: document.id, status: "no-output" });
        continue;
      }
      if (!await this.#validateReferences(content)) {
        outcomes.push({ effectId: document.id, status: "missing-reference" });
        continue;
      }
      if (!await this.#validateOutputAvailability(content)) {
        outcomes.push({ effectId: document.id, status: "unavailable-output" });
        continue;
      }
      if (!await this.#isModuleEnabled()) {
        outcomes.push({ effectId: document.id, status: "module-disabled" });
        continue;
      }

      const occurrenceId = this.#generateOccurrenceId();
      const occurrence = this.#createOccurrence(occurrenceId, content, match.trigger);
      if (this.#queue.enqueue(occurrence) === "full") {
        outcomes.push({ effectId: document.id, status: "full" });
        continue;
      }

      admittedAny = true;
      this.#cooldowns.recordPlaybackKey(EFFECT_COOLDOWN_NAMESPACE, document.id, document.cooldownSeconds);
      outcomes.push({ effectId: document.id, status: "queued", occurrenceId });
    }

    if (admittedAny) {
      this.#cooldowns.recordPlaybackKey(MODULE_COOLDOWN_NAMESPACE, "screen-effects", moduleCooldownSeconds);
    }
    return this.#report({ status: "processed", eventId, outcomes });
  }

  #createOccurrence(
    occurrenceId: string,
    content: EffectContentSnapshot,
    trigger: EffectTrigger | null
  ): EffectOccurrence {
    return {
      id: occurrenceId,
      moduleId: "screen-effects",
      trigger: trigger === null ? null : structuredClone(trigger),
      content: structuredClone(content),
      enqueuedAtMs: this.#now(),
      sequence: this.#nextSequence++,
      startedAtMs: null,
      completedAtMs: null,
      status: "queued"
    };
  }

  async #report<TResult extends EffectAdmissionResult>(result: TResult): Promise<TResult> {
    try {
      await this.#onOutcome(result);
    } catch {
      // Diagnostics must not turn a settled admission decision into another delivery attempt.
    }
    return result;
  }
}

function matchEffects(
  documents: readonly ScreenEffectDocument[],
  triggers: readonly EffectTrigger[]
): readonly MatchedEffect[] {
  const matches: MatchedEffect[] = [];
  for (const document of documents) {
    if (!document.enabled) continue;
    const trigger = document.bindings
      .map((binding) => triggers.find((candidate) => matchesEffectBinding(binding, candidate)))
      .find((candidate): candidate is EffectTrigger => candidate !== undefined);
    if (trigger !== undefined) matches.push({ document, trigger });
  }
  return matches.sort((left, right) => {
    if (left.document.priority !== right.document.priority) {
      return left.document.priority > right.document.priority ? -1 : 1;
    }
    return left.document.id < right.document.id ? -1 : left.document.id > right.document.id ? 1 : 0;
  });
}

function hasSelectedOutput(variant: ScreenEffectDocument["variants"][number]): boolean {
  const hasVisual = variant.visual !== null
    && (variant.visualOutputs.browserSource || variant.visualOutputs.desktop);
  const hasAudioSource = variant.sound !== null
    || (variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio);
  const hasAudio = hasAudioSource
    && (variant.outputs.browserSource || variant.outputs.deviceRouteIds.length > 0);
  return hasVisual || hasAudio;
}

function validateCooldown(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 86_400) {
    throw new RangeError("Screen Effects module cooldown must be between 0 and 86400 seconds");
  }
}
