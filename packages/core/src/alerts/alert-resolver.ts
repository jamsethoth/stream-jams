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

export interface AlertTemplateSampleContextSource {
  readonly eventType: NormalizedStreamEvent["type"];
  readonly samplePayload: Record<string, unknown>;
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
          text: this.#renderedTextTemplateRenderer.render({ template: layer.template, values: createAlertTemplateContext(match.event) }),
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
          text: this.#ttsTemplateRenderer.render({ template: layer.template, values: createAlertTemplateContext(match.event) }),
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
          values: createAlertTemplateContext(match.event)
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
        values: createAlertTemplateContext(match.event)
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

export function createAlertTemplateContext(
  source: NormalizedStreamEvent | AlertTemplateSampleContextSource
): Record<string, unknown> {
  const isSample = "samplePayload" in source;
  const eventType = isSample ? source.eventType : source.type;
  const values = (isSample ? source.samplePayload : source) as Record<string, unknown>;
  const actor = isSample
    ? readTemplateActor(values.actor, values.userName)
    : source.actor;
  const metadata = sanitizeMetadataRecord(asRecord(values.metadata));
  const context: Record<string, unknown> = {
    id: values.id,
    providerId: values.providerId,
    sourcePlatform: values.sourcePlatform,
    ingestProvider: values.ingestProvider,
    occurredAt: values.occurredAt,
    type: eventType,
    actor,
    userName: actor.displayName,
    message: values.message ?? null,
    amount: values.amount ?? null,
    metadata
  };

  if (Object.prototype.hasOwnProperty.call(metadata, "giftCount")) {
    context.giftCount = metadata.giftCount;
  }

  switch (eventType) {
    case "follow":
    case "stream_offline":
      break;
    case "subscription":
      context.tier = values.tier;
      break;
    case "resubscription": {
      const streakMonths = values.streakMonths ?? null;
      context.totalMonths = values.totalMonths ?? values.amount;
      context.streakMonths = streakMonths;
      context.tier = values.tier;
      context.tenure = values.tenure ?? streakMonths;
      context.tenureMonths = values.tenureMonths ?? streakMonths;
      break;
    }
    case "cheer":
      context.cheerAmount = values.cheerAmount ?? values.amount;
      break;
    case "raid":
      context.raidViewers = values.raidViewers ?? values.amount;
      break;
    case "channel_point_redemption":
      context.rewardId = values.rewardId;
      context.rewardTitle = values.rewardTitle;
      context.channelPointReward = values.channelPointReward ?? values.rewardId;
      context.userInput = values.userInput ?? null;
      break;
    case "gift_subscription": {
      const recipient = readTemplateActor(values.recipient, actor.displayName);
      const gifter = readNullableTemplateActor(values.gifter);
      context.recipient = recipient;
      context.gifter = gifter;
      context.recipientName = readText(values.recipientName) ?? recipient.displayName;
      context.gifterName = readText(values.gifterName) ?? gifter?.displayName ?? null;
      context.tier = values.tier;
      break;
    }
    case "community_gift":
      context.gifterName = readText(values.gifterName) ?? actor.displayName;
      context.giftCount = values.giftCount ?? values.amount;
      context.tier = values.tier;
      context.cumulativeGifts = values.cumulativeGifts ?? values.cumulativeTotal ?? null;
      context.cumulativeTotal = values.cumulativeTotal ?? values.cumulativeGifts ?? null;
      break;
    case "hype_train_start":
    case "hype_train_progress":
    case "hype_train_end":
      context.level = values.level ?? null;
      context.progress = values.progress ?? null;
      context.goal = values.goal ?? null;
      context.total = values.total ?? null;
      break;
    case "poll_start":
    case "poll_progress":
    case "poll_end":
      context.title = values.title;
      context.totalVotes = values.totalVotes;
      context.status = values.status;
      break;
    case "prediction_start":
    case "prediction_progress":
    case "prediction_lock":
    case "prediction_end":
      context.title = values.title;
      context.totalUsers = values.totalUsers;
      context.totalPoints = values.totalPoints;
      context.status = values.status;
      break;
    case "stream_online":
      context.streamType = values.streamType ?? null;
      break;
  }

  return context;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readTemplateActor(value: unknown, fallbackDisplayName: unknown) {
  const actor = asRecord(value);
  return {
    id: typeof actor.id === "string" ? actor.id : null,
    displayName: readText(actor.displayName) ?? readText(fallbackDisplayName) ?? ""
  };
}

function readNullableTemplateActor(value: unknown) {
  return value === null || value === undefined ? null : readTemplateActor(value, null);
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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
