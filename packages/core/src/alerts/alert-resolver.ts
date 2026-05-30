import type { AlertMatch } from "./alert-matcher.js";
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

  constructor(dependencies: AlertResolverDependencies) {
    this.#generateId = dependencies.generateId;
    this.#random = dependencies.random ?? Math.random;
    this.#templateRenderer = dependencies.templateRenderer ?? new DefaultTemplateRenderer();
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
    const enabledVariants = match.rule.variants.filter((variant) => variant.enabled);
    if (enabledVariants.length === 0) {
      throw new AlertVariantSelectionError(match.rule.id);
    }

    const totalWeight = enabledVariants.reduce((sum, variant) => sum + variant.weight, 0);
    const randomValue = clampRandom(this.#random());
    const threshold = randomValue * totalWeight;
    let cumulativeWeight = 0;

    for (const variant of enabledVariants) {
      cumulativeWeight += variant.weight;
      if (threshold < cumulativeWeight) {
        return variant;
      }
    }

    return enabledVariants[enabledVariants.length - 1]!;
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
          values: match.event
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
        values: match.event
      }),
      audioAssetId: null,
      providerPayload: {
        providerId: config.providerId,
        voiceId: config.voiceId
      }
    };
  }
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
