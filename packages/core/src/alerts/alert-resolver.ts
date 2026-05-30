import type { AlertMatch } from "./alert-matcher.js";
import { DefaultAlertConditionEvaluator, type AlertConditionEvaluator } from "./condition-evaluator.js";
import type { NormalizedStreamEvent } from "../events/types.js";
import type { ResolvedAlert } from "../playback/types.js";
import type {
  OverlayInstruction,
  OverlayPurpose,
  OverlayScope,
  OverlayVisualInstruction
} from "../overlays/types.js";
import type { TtsPlaybackInstruction } from "../tts/types.js";
import { DefaultTemplateRenderer, type TemplateRenderer } from "../templates/template-renderer.js";
import type { AlertTtsConfig, AlertVariant } from "./types.js";

export type AlertResolverIdKind = "resolved-alert" | "overlay-instruction";

export interface AlertResolverTarget {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly moduleId?: string;
}

export interface ResolveAlertMatchesInput {
  readonly matches: readonly AlertMatch[];
  readonly target: AlertResolverTarget;
  readonly visualAssetMediaTypes?: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>;
}

export interface AlertResolver {
  resolveMatches(input: ResolveAlertMatchesInput): readonly ResolvedAlert[];
}

export interface AlertResolverDependencies {
  readonly generateId: (kind: AlertResolverIdKind) => string;
  readonly random?: () => number;
  readonly templateRenderer?: TemplateRenderer;
  readonly conditionEvaluator?: AlertConditionEvaluator;
}

export class AlertVariantSelectionError extends Error {
  constructor(readonly ruleId: string) {
    super(`Alert rule "${ruleId}" does not have an enabled variant`);
    this.name = "AlertVariantSelectionError";
  }
}

export class DefaultAlertResolver implements AlertResolver {
  readonly #generateId: (kind: AlertResolverIdKind) => string;
  readonly #random: () => number;
  readonly #templateRenderer: TemplateRenderer;
  readonly #conditionEvaluator: AlertConditionEvaluator;

  constructor(dependencies: AlertResolverDependencies) {
    this.#generateId = dependencies.generateId;
    this.#random = dependencies.random ?? Math.random;
    this.#templateRenderer = dependencies.templateRenderer ?? new DefaultTemplateRenderer();
    this.#conditionEvaluator = dependencies.conditionEvaluator ?? new DefaultAlertConditionEvaluator();
  }

  resolveMatches(input: ResolveAlertMatchesInput): readonly ResolvedAlert[] {
    return [...input.matches]
      .sort((left, right) => {
        const priorityDifference = right.rule.priority - left.rule.priority;
        return priorityDifference === 0 ? left.rule.id.localeCompare(right.rule.id) : priorityDifference;
      })
      .map((match) => this.#resolveMatch(match, input.target, input.visualAssetMediaTypes ?? {}));
  }

  #resolveMatch(
    match: AlertMatch,
    target: AlertResolverTarget,
    visualAssetMediaTypes: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>
  ): ResolvedAlert {
    const variant = this.#selectVariant(match);
    const resolvedAlertId = this.#generateId("resolved-alert");
    const overlayInstruction = this.#createOverlayInstruction(match, variant, target, visualAssetMediaTypes);

    return {
      id: resolvedAlertId,
      sourceEventId: match.event.id,
      ruleId: match.rule.id,
      variantId: variant.id,
      overlayInstruction
    };
  }

  #selectVariant(match: AlertMatch): AlertVariant {
    const matchingVariants = match.rule.variants.filter(
      (variant) =>
        variant.enabled &&
        (variant.conditions ?? []).every((condition) => this.#conditionEvaluator.evaluate(condition, match.event))
    );
    if (matchingVariants.length === 0) {
      throw new AlertVariantSelectionError(match.rule.id);
    }

    const highestPriority = Math.max(...matchingVariants.map((variant) => variant.priority ?? 0));
    const topPriorityVariants = matchingVariants.filter((variant) => (variant.priority ?? 0) === highestPriority);
    const totalWeight = topPriorityVariants.reduce((sum, variant) => sum + variant.weight, 0);
    const randomValue = clampRandom(this.#random());
    const threshold = randomValue * totalWeight;
    let cumulativeWeight = 0;

    for (const variant of topPriorityVariants) {
      cumulativeWeight += variant.weight;
      if (threshold < cumulativeWeight) {
        return variant;
      }
    }

    return topPriorityVariants[topPriorityVariants.length - 1]!;
  }

  #createOverlayInstruction(
    match: AlertMatch,
    variant: AlertVariant,
    target: AlertResolverTarget,
    visualAssetMediaTypes: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>
  ): OverlayInstruction {
    return {
      id: this.#generateId("overlay-instruction"),
      overlayId: target.overlayId,
      moduleId: target.moduleId ?? "alerts",
      purpose: target.purpose,
      scope: target.scope,
      visual:
        variant.visualAssetId === null
          ? null
          : {
              assetId: variant.visualAssetId,
              mediaType: visualAssetMediaTypes[variant.visualAssetId] ?? "image",
              layout: variant.layout
            },
      audio:
        variant.audioAssetId === null
          ? null
          : {
              assetId: variant.audioAssetId,
              volume: 1
            },
      text: {
        text: this.#templateRenderer.render({
          template: variant.textTemplate,
          values: createTemplateContext(match.event)
        }),
        layout: variant.layout
      },
      tts: this.#createTtsInstruction(match, variant.ttsConfig),
      durationMs: variant.durationMs
    };
  }

  #createTtsInstruction(match: AlertMatch, config: AlertTtsConfig | null): TtsPlaybackInstruction | null {
    if (config === null || !config.enabled || !passesMinimumAmount(match.event.amount, config.minimumAmount)) {
      return null;
    }

    return {
      mode: "browser-speech",
      text: this.#templateRenderer.render({
        template: config.template,
        values: createTemplateContext(match.event)
      }),
      audioAssetId: null,
      providerPayload: {
        providerId: config.providerId,
        voiceId: config.voiceId
      }
    };
  }
}

function createTemplateContext(event: NormalizedStreamEvent): Record<string, unknown> {
  const metadata = sanitizeMetadataRecord(event.metadata);
  const context: Record<string, unknown> = {
    id: event.id,
    providerId: event.providerId,
    occurredAt: event.occurredAt,
    type: event.type,
    actor: {
      id: event.actor.id,
      displayName: event.actor.displayName
    },
    message: event.message,
    amount: event.amount,
    metadata
  };

  if ("tier" in event) {
    context.tier = event.tier;
  }

  if ("streakMonths" in event) {
    context.streakMonths = event.streakMonths;
    context.tenure = event.streakMonths;
    context.tenureMonths = event.streakMonths;
  }

  if (event.type === "cheer") {
    context.cheerAmount = event.amount;
  }

  if (event.type === "raid") {
    context.raidViewers = event.amount;
  }

  if (event.type === "channel_point_redemption") {
    context.rewardId = event.rewardId;
    context.rewardTitle = event.rewardTitle;
    context.channelPointReward = event.rewardId;
    context.userInput = event.userInput;
  }

  if (Object.prototype.hasOwnProperty.call(metadata, "giftCount")) {
    context.giftCount = metadata.giftCount;
  }

  return context;
}

function sanitizeMetadataRecord(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (isRawProviderPayloadKey(key)) {
      continue;
    }

    const sanitizedValue = sanitizeMetadataValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }

  return sanitized;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }

  if (typeof value === "object") {
    return sanitizeMetadataRecord(value as Record<string, unknown>);
  }

  return undefined;
}

function isRawProviderPayloadKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return normalizedKey === "rawproviderpayload" || normalizedKey === "rawpayload" || normalizedKey === "providerpayload";
}

function passesMinimumAmount(amount: number | null, minimumAmount: number | null): boolean {
  return minimumAmount === null || (typeof amount === "number" && amount >= minimumAmount);
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1 - Number.EPSILON;
  }

  return value;
}
