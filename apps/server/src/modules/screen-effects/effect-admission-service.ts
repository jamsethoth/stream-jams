import {
  matchEffectBinding,
  resolveEffectContent,
  collectEffectDurationAssetIds,
  resolveMediaDuration,
  type AssetRecord,
  type BusEvent,
  type EffectContentSnapshot,
  type EffectOccurrence,
  type EffectQueue,
  type EffectTrigger,
  type IngestProviderId,
  type PlaybackCooldownKeyService,
  type PlaybackDedupeKeyService,
  type ScreenEffectDocument,
  type ScreenEffectRepository
} from "@stream-jams/core";
import { MediaUnavailableError, type LocalMediaService } from "../assets/local-media-service.js";
import { effectOccurrenceKey } from "./effect-playback-coordinator.js";

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
  readonly localMediaService?: LocalMediaService;
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
  readonly isEffectLive?: (effectId: string) => boolean;
  readonly onOutcome?: (result: EffectAdmissionResult) => void | Promise<void>;
  readonly assetDurationCatalog?: { getMany(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>> };
}

interface MatchedEffect {
  readonly document: ScreenEffectDocument;
  readonly trigger: EffectTrigger;
}

const EFFECT_DEDUPE_NAMESPACE = "screen-effects";
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
  readonly #isEffectLive: (effectId: string) => boolean;
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
  readonly #assetDurationCatalog: EffectAdmissionServiceOptions["assetDurationCatalog"] | null;
  #admissionTail = Promise.resolve();
  #nextSequence = 0;
  readonly #localMediaService: LocalMediaService | undefined;

  constructor(options: EffectAdmissionServiceOptions) {
    this.#localMediaService = options.localMediaService;
    this.#isEffectLive = options.isEffectLive ?? (() => true);
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
    this.#assetDurationCatalog = options.assetDurationCatalog ?? null;
  }

  /** Admits every enabled effect with a binding whose selector matches the journal-validated bus event. */
  async handleEvent(event: BusEvent): Promise<EffectAdmissionResult> {
    const { eventId } = event;
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
    const matches = matchEffects(documents, event);
    if (!await this.#isModuleEnabled()) {
      return this.#report({ status: "module-disabled", eventId, outcomes: [] });
    }
    if (matches.length === 0) {
      return this.#report({ status: "no-matches", eventId, outcomes: [] });
    }

    const admission = this.#admissionTail.then(
      () => this.#admitMatches(eventId, event.sourceKind, matches, moduleCooldownSeconds)
    );
    this.#admissionTail = admission.then(() => undefined, () => undefined);
    return admission;
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
    return this.#enqueueExplicit(retained.content, retained.trigger, false, retained.sourceKind);
  }

  async #enqueueExplicit(
    content: EffectContentSnapshot,
    trigger: EffectTrigger | null,
    requireLive = false,
    sourceKind: IngestProviderId | null = null
  ): Promise<EffectAdmissionOutcome> {
    const work = () => this.#enqueueCaptured(content, trigger, requireLive, sourceKind);
    try { return this.#localMediaService === undefined ? await work() : await this.#localMediaService.runAdmission(work); }
    catch (error) {
      if (error instanceof MediaUnavailableError) return { effectId: content.effectId, status: "missing-reference" };
      throw error;
    }
  }

  async #enqueueCaptured(
    content: EffectContentSnapshot,
    trigger: EffectTrigger | null,
    requireLive: boolean,
    sourceKind: IngestProviderId | null
  ): Promise<EffectAdmissionOutcome> {
    content = await this.#resolveContentDuration(content);
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
    if (requireLive && !this.#isEffectLive(content.effectId)) return { effectId: content.effectId, status: "module-disabled" };

    const occurrenceId = this.#generateOccurrenceId();
    const queued = this.#queue.enqueue(this.#createOccurrence(occurrenceId, content, trigger, sourceKind));
    if (queued !== "full") this.#localMediaService?.commitAdmission(effectOccurrenceKey("screen-effects", occurrenceId));
    return queued === "full"
      ? { effectId: content.effectId, status: "full" }
      : { effectId: content.effectId, status: "queued", occurrenceId };
  }

  async #admitMatches(
    eventId: string,
    sourceKind: IngestProviderId,
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
      if (!moduleReady) {
        outcomes.push({ effectId: document.id, status: "cooldown" });
        continue;
      }
      if (!this.#queue.hasPendingCapacity()) {
        outcomes.push({ effectId: document.id, status: "full" });
        continue;
      }

      const outcome = await this.#enqueueExplicit(resolveEffectContent(document, this.#random()), match.trigger, true, sourceKind);
      if (outcome.status === "module-disabled" && !this.#isEffectLive(document.id)) continue;
      outcomes.push(outcome);
      admittedAny ||= outcome.status === "queued";
    }

    if (admittedAny) {
      this.#cooldowns.recordPlaybackKey(MODULE_COOLDOWN_NAMESPACE, "screen-effects", moduleCooldownSeconds);
    }
    return this.#report({ status: "processed", eventId, outcomes });
  }

  async #resolveContentDuration(content: EffectContentSnapshot): Promise<EffectContentSnapshot> {
    if (this.#localMediaService !== undefined) {
      await this.#localMediaService.captureAdmission([
        ...(content.variant.visual === null ? [] : [content.variant.visual.assetId]),
        ...(content.variant.sound === null ? [] : [content.variant.sound.assetId])
      ]);
    }
    if (this.#assetDurationCatalog == null) return content;
    const ids = collectEffectDurationAssetIds(content.variant);
    const records = this.#localMediaService === undefined ? await this.#assetDurationCatalog.getMany(ids) : await this.#localMediaService.captureAdmission(ids);
    const resolution = resolveMediaDuration({
      mode: content.variant.durationMode ?? "custom",
      customDurationMs: content.variant.durationMs,
      fallbackDurationMs: 10_000,
      maximumDurationMs: 120_000,
      candidates: ids.flatMap((assetId) => {
        const record = records.get(assetId);
        return record === undefined ? [] : [{
          assetId,
          label: record.originalFileName,
          mediaType: record.mediaType,
          durationMs: record.durationMs,
          eligible: true
        }];
      })
    });
    return {
      ...content,
      variant: { ...content.variant, durationMs: resolution.durationMs },
      assetDurations: Object.fromEntries(ids.map((assetId) => [assetId, records.get(assetId)?.durationMs ?? null]))
    };
  }

  #createOccurrence(
    occurrenceId: string,
    content: EffectContentSnapshot,
    trigger: EffectTrigger | null,
    sourceKind: IngestProviderId | null
  ): EffectOccurrence {
    return {
      id: occurrenceId,
      moduleId: "screen-effects",
      trigger: trigger === null ? null : structuredClone(trigger),
      sourceKind,
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
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      // Diagnostics must not turn a settled admission decision into another delivery attempt.
    }
    return result;
  }
}

function matchEffects(
  documents: readonly ScreenEffectDocument[],
  event: BusEvent
): readonly MatchedEffect[] {
  const matches: MatchedEffect[] = [];
  for (const document of documents) {
    if (!document.enabled) continue;
    const trigger = document.bindings
      .map((binding) => matchEffectBinding(binding, event))
      .find((candidate): candidate is EffectTrigger => candidate !== null);
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
