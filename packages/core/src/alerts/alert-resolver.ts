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
import { DefaultModerationService, type ModerationService } from "../moderation/moderation-service.js";
import { SafeTemplateRenderer } from "../templates/safe-template-renderer.js";
import { DefaultTemplateRenderer, type TemplateRenderer } from "../templates/template-renderer.js";
import type { AlertTtsConfig, AlertVariant } from "./types.js";
import type {
  AlertEditorDocument,
  AlertLayer,
  TargetProfileId
} from "../management/contracts.js";
import type { OverlayElementLayout, OverlayTargetProfileId } from "../overlays/types.js";

export type AlertResolverIdKind = "resolved-alert" | "overlay-instruction";

export interface AlertResolverTarget {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly moduleId?: string;
  readonly targetProfileId?: OverlayTargetProfileId | null;
}

export interface ResolveAlertMatchesInput {
  readonly matches: readonly AlertMatch[];
  readonly target: AlertResolverTarget;
  readonly visualAssetMediaTypes?: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>;
  readonly editorDocuments?: ReadonlyMap<string, AlertEditorDocument>;
  readonly selectedVariants?: ReadonlyMap<string, AlertVariant>;
}

export interface AlertResolver {
  selectVariants(matches: readonly AlertMatch[]): ReadonlyMap<string, AlertVariant>;
  resolveMatches(input: ResolveAlertMatchesInput): readonly ResolvedAlert[];
}

export interface AlertResolverDependencies {
  readonly generateId: (kind: AlertResolverIdKind) => string;
  readonly random?: () => number;
  readonly templateRenderer?: TemplateRenderer;
  readonly renderedTextTemplateRenderer?: TemplateRenderer;
  readonly ttsTemplateRenderer?: TemplateRenderer;
  readonly moderationService?: ModerationService | undefined;
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
  readonly #renderedTextTemplateRenderer: TemplateRenderer;
  readonly #ttsTemplateRenderer: TemplateRenderer;
  readonly #conditionEvaluator: AlertConditionEvaluator;

  constructor(dependencies: AlertResolverDependencies) {
    this.#generateId = dependencies.generateId;
    this.#random = dependencies.random ?? Math.random;
    const templateRenderer = dependencies.templateRenderer ?? new DefaultTemplateRenderer();
    const moderationService = dependencies.moderationService ?? new DefaultModerationService();
    this.#renderedTextTemplateRenderer =
      dependencies.renderedTextTemplateRenderer ??
      new SafeTemplateRenderer({
        moderationService,
        templateRenderer,
        target: "rendered"
      });
    this.#ttsTemplateRenderer =
      dependencies.ttsTemplateRenderer ??
      new SafeTemplateRenderer({
        moderationService,
        templateRenderer,
        target: "tts"
      });
    this.#conditionEvaluator = dependencies.conditionEvaluator ?? new DefaultAlertConditionEvaluator();
  }

  resolveMatches(input: ResolveAlertMatchesInput): readonly ResolvedAlert[] {
    const matches = [...input.matches].sort((left, right) => {
        const priorityDifference = right.rule.priority - left.rule.priority;
        return priorityDifference === 0 ? left.rule.id.localeCompare(right.rule.id) : priorityDifference;
      });
    const targetProfileId = toEditorTargetProfileId(input.target.targetProfileId);
    if (targetProfileId !== null) {
      return matches.flatMap((match) => {
        const variant = input.selectedVariants?.get(match.rule.id) ?? this.#selectVariant(match);
        const defaultVariant = match.rule.variants[0];
        const editorId = variant.id === defaultVariant?.id ? match.rule.id : variant.id;
        const document = input.editorDocuments?.get(editorId);
        return document === undefined
          ? [this.#resolveMatch(match, input.target, input.visualAssetMediaTypes ?? {}, variant)]
          : this.#resolveEditorDocument(match, variant, document, targetProfileId, input.target, input.visualAssetMediaTypes ?? {});
      });
    }
    return matches.map((match) => this.#resolveMatch(
      match,
      input.target,
      input.visualAssetMediaTypes ?? {},
      input.selectedVariants?.get(match.rule.id)
    ));
  }

  selectVariants(matches: readonly AlertMatch[]): ReadonlyMap<string, AlertVariant> {
    return new Map(matches.map((match) => [match.rule.id, this.#selectVariant(match)]));
  }

  #resolveEditorDocument(
    match: AlertMatch,
    variant: AlertVariant,
    document: AlertEditorDocument,
    targetProfileId: TargetProfileId,
    target: AlertResolverTarget,
    visualAssetMediaTypes: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>
  ): readonly ResolvedAlert[] {
    const profile = document.targetProfiles.find((candidate) => candidate.id === targetProfileId);
    if (!document.enabled || profile?.enabled !== true || profile.reviewState !== "ready") {
      return [];
    }

    const layouts = new Map(profile.layerLayouts.map((layout) => [layout.layerId, layout]));
    return [...document.layers]
      .filter((layer) => layer.visible)
      .sort((left, right) => left.order - right.order)
      .flatMap((layer) => {
        const instruction = this.#createEditorLayerInstruction(
          match,
          layer,
          layouts.get(layer.id),
          document.durationMs,
          targetProfileId,
          target,
          visualAssetMediaTypes
        );
        if (instruction === null) return [];
        return [{
          id: this.#generateId("resolved-alert"),
          sourceEventId: match.event.id,
          ruleId: match.rule.id,
          variantId: variant.id,
          overlayInstruction: instruction
        }];
      });
  }

  #createEditorLayerInstruction(
    match: AlertMatch,
    layer: AlertLayer,
    layout: OverlayElementLayout | undefined,
    durationMs: number,
    targetProfileId: TargetProfileId,
    target: AlertResolverTarget,
    visualAssetMediaTypes: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>
  ): OverlayInstruction | null {
    const base = {
      id: this.#generateId("overlay-instruction"),
      overlayId: target.overlayId,
      moduleId: target.moduleId ?? "alerts",
      purpose: target.purpose,
      scope: target.scope,
      targetProfileId,
      visual: null,
      audio: null,
      text: null,
      shape: null,
      animation: layer.animation,
      tts: null,
      durationMs
    };
    if (layer.type === "text" && layout !== undefined) {
      return {
        ...base,
        text: {
          text: this.#renderedTextTemplateRenderer.render({ template: layer.template, values: createTemplateContext(match.event) }),
          layout
        }
      };
    }
    if ((layer.type === "image" || layer.type === "video") && layout !== undefined) {
      return {
        ...base,
        visual: {
          assetId: layer.assetId,
          mediaType: visualAssetMediaTypes[layer.assetId] ?? layer.type,
          layout
        }
      };
    }
    if (layer.type === "audio") {
      return { ...base, audio: { assetId: layer.assetId, volume: layer.volume } };
    }
    if (layer.type === "tts") {
      if (!layer.enabled) return null;
      return {
        ...base,
        tts: {
          mode: layer.providerId === "browser-speech" ? "browser-speech" : "remote-trigger",
          text: this.#ttsTemplateRenderer.render({ template: layer.template, values: createTemplateContext(match.event) }),
          audioAssetId: null,
          providerPayload: { providerId: layer.providerId, layerId: layer.id }
        }
      };
    }
    if (layer.type === "shape" && layout !== undefined) {
      return { ...base, shape: { fill: layer.fill, layout } };
    }
    return null;
  }

  #resolveMatch(
    match: AlertMatch,
    target: AlertResolverTarget,
    visualAssetMediaTypes: Readonly<Record<string, OverlayVisualInstruction["mediaType"]>>,
    selectedVariant?: AlertVariant
  ): ResolvedAlert {
    const variant = selectedVariant ?? this.#selectVariant(match);
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
      ...(target.targetProfileId === undefined ? {} : { targetProfileId: target.targetProfileId }),
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
        text: this.#renderedTextTemplateRenderer.render({
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
      mode: config.providerId === "speakerbot" ? "remote-trigger" : "browser-speech",
      text: this.#ttsTemplateRenderer.render({
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

function toEditorTargetProfileId(value: OverlayTargetProfileId | null | undefined): TargetProfileId | null {
  return value === "landscape" || value === "vertical" ? value : null;
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
    userName: event.actor.displayName,
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
