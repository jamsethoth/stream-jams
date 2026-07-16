import {
  DefaultTemplateRenderer,
  alertEditorDocumentSchema,
  alertEditorTestRequestSchema,
  getAlertEditorAffectedProfileIds,
  type AlertEditorDocument,
  type AlertEditorTestRequest,
  type AlertEditorTestResult,
  type AlertLayer,
  type AlertRepository,
  type AlertRule,
  type AlertTargetProfileDocument,
  type NormalizedStreamEvent,
  type OverlayElementLayout,
  type ResolvedAlert,
  type TargetProfileId
} from "@stream-jams/core";
import type {
  AlertRuleManagementMetadata,
  AlertSetMetadataRepository
} from "./alert-set-management-service.js";

export interface AlertEditorDocumentRepository {
  find(alertId: string): Promise<AlertEditorDocument | null>;
  save(document: AlertEditorDocument): Promise<AlertEditorDocument>;
}

export interface AlertEditorTestPlayback {
  readonly sourceEvent: NormalizedStreamEvent;
  readonly alerts: readonly ResolvedAlert[];
}

export interface AlertEditorAtomicSaveInput {
  readonly document: AlertEditorDocument;
  readonly metadata: AlertRuleManagementMetadata;
  readonly rule: AlertRule;
}

export interface AlertEditorServiceOptions {
  readonly documents: AlertEditorDocumentRepository;
  readonly rules: Pick<AlertRepository, "findRuleById" | "listCollections" | "saveRule">;
  readonly metadata: Pick<AlertSetMetadataRepository, "findRule" | "saveRule">;
  readonly hasConnectedOutput: (targetProfileId: TargetProfileId) => Promise<boolean>;
  readonly enqueueTest: (playback: AlertEditorTestPlayback) => Promise<void>;
  readonly findAssetMediaType?: (assetId: string) => Promise<"image" | "gif" | "video" | "audio" | null>;
  readonly generateId: () => string;
  readonly generateReferenceId: () => string;
  readonly now?: () => Date;
  readonly saveAtomically?: (input: AlertEditorAtomicSaveInput) => Promise<AlertEditorDocument>;
}

export class AlertEditorNotFoundError extends Error {
  readonly code = "ALERT_EDITOR_NOT_FOUND";

  constructor(readonly alertId: string) {
    super(`Alert "${alertId}" was not found.`);
    this.name = "AlertEditorNotFoundError";
  }
}

export class AlertEditorValidationError extends Error {
  readonly code = "ALERT_EDITOR_INVALID";

  constructor(readonly issues: readonly string[]) {
    super(issues.join(" "));
    this.name = "AlertEditorValidationError";
  }
}

export class AlertEditorDeliveryBlockedError extends Error {
  readonly code = "ALERT_EDITOR_TEST_BLOCKED";

  constructor(readonly nextStep: string) {
    super(nextStep);
    this.name = "AlertEditorDeliveryBlockedError";
  }
}

export class AlertEditorLiveImpactConfirmationRequiredError extends Error {
  readonly code = "ALERT_EDITOR_LIVE_IMPACT_CONFIRMATION_REQUIRED";

  constructor(readonly affectedProfileIds: readonly TargetProfileId[]) {
    super(`Saving can change active live output for ${affectedProfileIds.join(" and ")}. Review the changes and confirm the live impact before saving.`);
    this.name = "AlertEditorLiveImpactConfirmationRequiredError";
  }
}

export class AlertEditorService {
  readonly #options: AlertEditorServiceOptions;
  readonly #templateRenderer = new DefaultTemplateRenderer();
  readonly #now: () => Date;

  constructor(options: AlertEditorServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  async getDocument(alertId: string): Promise<AlertEditorDocument> {
    const stored = await this.#options.documents.find(alertId);
    if (stored !== null) return stored;

    const rule = await this.#findRule(alertId);
    const metadata = await this.#options.metadata.findRule(alertId);
    return createDocumentFromRule(rule, metadata);
  }

  async saveDocument(
    alertId: string,
    candidate: AlertEditorDocument,
    confirmLiveImpact = false
  ): Promise<AlertEditorDocument> {
    const document = alertEditorDocumentSchema.parse(candidate);
    if (document.id !== alertId) {
      throw new AlertEditorValidationError(["The editor document does not match the selected alert."]);
    }
    validateDocumentForSave(document);

    const rule = await this.#findRule(alertId);
    const current = await this.#options.documents.find(alertId)
      ?? createDocumentFromRule(rule, await this.#options.metadata.findRule(alertId));
    const affectedProfileIds = getAlertEditorAffectedProfileIds(current, document);
    if (!confirmLiveImpact && affectedProfileIds.length > 0) {
      const collections = await this.#options.rules.listCollections();
      const activeSetIds = new Set(collections.filter((collection) => collection.enabled).map((collection) => collection.id));
      if (activeSetIds.has(current.setId) || activeSetIds.has(document.setId)) {
        throw new AlertEditorLiveImpactConfirmationRequiredError(affectedProfileIds);
      }
    }
    const projectedRule = projectDocumentToRule(document, rule);
    const projectedMetadata = ruleMetadataFromDocument(document);
    if (this.#options.saveAtomically !== undefined) {
      return this.#options.saveAtomically({ document, metadata: projectedMetadata, rule: projectedRule });
    }
    await this.#options.rules.saveRule(projectedRule);
    await this.#options.metadata.saveRule(projectedMetadata);
    return this.#options.documents.save(document);
  }

  async sendTest(alertId: string, candidate: AlertEditorTestRequest): Promise<AlertEditorTestResult> {
    const request = alertEditorTestRequestSchema.parse(candidate);
    if (request.document.id !== alertId) {
      throw new AlertEditorValidationError(["The test document does not match the selected alert."]);
    }

    const profile = profileById(request.document, request.targetProfileId);
    const profileIssues = validateProfile(request.document, profile);
    if (!profile.enabled || profile.reviewState !== "ready" || profileIssues.length > 0) {
      throw new AlertEditorDeliveryBlockedError(
        `Finish reviewing and enable the ${request.targetProfileId} profile before sending it to an output.`
      );
    }
    if (!(await this.#options.hasConnectedOutput(request.targetProfileId))) {
      throw new AlertEditorDeliveryBlockedError(
        `Connect the ${request.targetProfileId} browser-source output, then try Send test again.`
      );
    }

    const referenceId = this.#options.generateReferenceId();
    const sourceEvent = createTestEvent(request.document, request.samplePayload, referenceId, this.#now());
    const visualAssetMediaTypes = await this.#resolveVisualAssetMediaTypes(request.document);
    const alerts = this.#createTestAlerts(request, profile, sourceEvent, visualAssetMediaTypes);
    if (alerts.length === 0) {
      throw new AlertEditorDeliveryBlockedError(
        "The selected profile has no visible layer that can be sent with the current audio and TTS settings."
      );
    }

    await this.#options.enqueueTest({ sourceEvent, alerts });
    return {
      status: "queued",
      targetProfileId: request.targetProfileId,
      referenceId,
      test: true
    };
  }

  async #findRule(alertId: string): Promise<AlertRule> {
    const rule = await this.#options.rules.findRuleById(alertId);
    if (rule === null) throw new AlertEditorNotFoundError(alertId);
    return rule;
  }

  #createTestAlerts(
    request: AlertEditorTestRequest,
    profile: AlertTargetProfileDocument,
    sourceEvent: NormalizedStreamEvent,
    visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>
  ): readonly ResolvedAlert[] {
    const layouts = new Map(profile.layerLayouts.map((layout) => [layout.layerId, layout]));
    const context = createTemplateContext(request.samplePayload, sourceEvent);
    const layers = [...request.document.layers]
      .filter((layer) => layer.visible)
      .sort((left, right) => left.order - right.order)
      .filter((layer) => (layer.type === "audio" ? request.includeAudio : layer.type === "tts" ? request.includeTts : true));

    return layers.flatMap((layer) => {
      const layout = layouts.get(layer.id);
      const instruction = createLayerInstruction(
        layer,
        layout,
        request.document.durationMs,
        request.targetProfileId,
        context,
        this.#templateRenderer,
        this.#options.generateId(),
        visualAssetMediaTypes
      );
      if (instruction === null) return [];
      return [
        {
          id: this.#options.generateId(),
          sourceEventId: sourceEvent.id,
          ruleId: request.document.id,
          variantId: layer.id,
          overlayInstruction: instruction
        }
      ];
    });
  }

  async #resolveVisualAssetMediaTypes(
    document: AlertEditorDocument
  ): Promise<Readonly<Record<string, "image" | "gif" | "video">>> {
    if (this.#options.findAssetMediaType === undefined) return {};
    const mediaTypes: Record<string, "image" | "gif" | "video"> = {};
    const assetIds = [...new Set(document.layers.flatMap((layer) =>
      layer.type === "image" || layer.type === "video" ? [layer.assetId] : []
    ))];
    await Promise.all(assetIds.map(async (assetId) => {
      const mediaType = await this.#options.findAssetMediaType!(assetId);
      if (mediaType === "image" || mediaType === "gif" || mediaType === "video") {
        mediaTypes[assetId] = mediaType;
      }
    }));
    return mediaTypes;
  }
}

const animation = {
  mode: "preset" as const,
  entrance: "fade",
  exit: "fade",
  durationMs: 300,
  delayMs: 0,
  easing: "ease-out"
};

function createDocumentFromRule(
  rule: AlertRule,
  metadata: AlertRuleManagementMetadata | null
): AlertEditorDocument {
  const variant = rule.variants[0];
  if (variant === undefined || rule.collectionIds[0] === undefined) {
    throw new AlertEditorValidationError(["This alert is missing a set or default variation and cannot be edited."]);
  }

  const layers: AlertLayer[] = [];
  if (variant.visualAssetId !== null) {
    layers.push(layerBase(`${rule.id}-visual`, "Visual", "image", layers.length, { assetId: variant.visualAssetId }));
  }
  layers.push(layerBase(`${rule.id}-text`, "Message", "text", layers.length, { template: variant.textTemplate }));
  if (variant.audioAssetId !== null) {
    layers.push(layerBase(`${rule.id}-audio`, "Audio", "audio", layers.length, { assetId: variant.audioAssetId, volume: 1 }));
  }
  if (variant.ttsConfig !== null) {
    layers.push(layerBase(`${rule.id}-tts`, "Text to speech", "tts", layers.length, { template: variant.ttsConfig.template }));
  }

  const enabledProfiles = new Set(metadata?.targetProfileIds ?? ["landscape"]);
  const document = {
    id: rule.id,
    setId: rule.collectionIds[0],
    providerKind: metadata?.providerKind ?? "twitch",
    eventType: rule.eventType,
    kind: "default" as const,
    parentAlertId: null,
    name: rule.name,
    enabled: rule.enabled,
    conditions: rule.conditions,
    durationMs: variant.durationMs,
    layers,
    targetProfiles: [
      createTargetProfile("landscape", enabledProfiles.has("landscape"), "ready", layers, variant.layout),
      createTargetProfile(
        "vertical",
        enabledProfiles.has("vertical"),
        metadata?.reviewState === "ready" && enabledProfiles.has("vertical") ? "ready" : "needs-review",
        layers,
        fitLayout(variant.layout, 1080, 1920)
      )
    ],
    samplePayloads: createBuiltInSamples(rule.eventType)
  };
  return alertEditorDocumentSchema.parse(document);
}

function layerBase<T extends AlertLayer["type"]>(
  id: string,
  name: string,
  type: T,
  order: number,
  details: Omit<Extract<AlertLayer, { type: T }>, "id" | "name" | "type" | "visible" | "order" | "animation">
): Extract<AlertLayer, { type: T }> {
  return { id, name, type, visible: true, order, animation, ...details } as Extract<AlertLayer, { type: T }>;
}

function createTargetProfile(
  id: TargetProfileId,
  enabled: boolean,
  reviewState: "ready" | "needs-review",
  layers: readonly AlertLayer[],
  layout: OverlayElementLayout
): AlertTargetProfileDocument {
  return {
    id,
    enabled,
    reviewState,
    layerLayouts: layers
      .filter((layer) => requiresLayout(layer))
      .map((layer, index) => ({ ...layout, layerId: layer.id, zIndex: layout.zIndex + index }))
  };
}

function fitLayout(layout: OverlayElementLayout, width: number, height: number): OverlayElementLayout {
  const fittedWidth = Math.min(layout.width, width);
  const fittedHeight = Math.min(layout.height, height);
  return {
    x: Math.max(0, Math.min(layout.x, width - fittedWidth)),
    y: Math.max(0, Math.min(layout.y, height - fittedHeight)),
    width: fittedWidth,
    height: fittedHeight,
    zIndex: layout.zIndex
  };
}

function validateDocumentForSave(document: AlertEditorDocument): void {
  const layerIds = document.layers.map((layer) => layer.id);
  const issues = layerIds.length === new Set(layerIds).size ? [] : ["Layer names must identify unique layers."];
  const enabledProfiles = document.targetProfiles.filter((profile) => profile.enabled);
  if (enabledProfiles.length === 0) issues.push("Enable at least one target profile before saving.");
  for (const profile of enabledProfiles) {
    if (profile.reviewState !== "ready") {
      issues.push(`Finish reviewing the ${profile.id} profile before enabling it.`);
    }
    issues.push(...validateProfile(document, profile));
  }
  if (issues.length > 0) throw new AlertEditorValidationError(issues);
}

function validateProfile(document: AlertEditorDocument, profile: AlertTargetProfileDocument): readonly string[] {
  const dimensions = profile.id === "landscape" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  const layouts = new Map<string, OverlayElementLayout>();
  const issues: string[] = [];
  for (const layout of profile.layerLayouts) {
    if (layouts.has(layout.layerId)) issues.push(`${profile.id} contains duplicate layout data for ${layout.layerId}.`);
    layouts.set(layout.layerId, layout);
    if (layout.x + layout.width > dimensions.width || layout.y + layout.height > dimensions.height) {
      issues.push(`${layout.layerId} extends outside the ${profile.id} canvas.`);
    }
  }
  for (const layer of document.layers.filter((candidate) => candidate.visible && requiresLayout(candidate))) {
    if (!layouts.has(layer.id)) issues.push(`${layer.name} needs a layout in the ${profile.id} profile.`);
  }
  return issues;
}

function requiresLayout(layer: AlertLayer): boolean {
  return layer.type === "text" || layer.type === "image" || layer.type === "video" || layer.type === "shape";
}

function projectDocumentToRule(document: AlertEditorDocument, rule: AlertRule): AlertRule {
  const currentVariant = rule.variants[0];
  if (currentVariant === undefined) {
    throw new AlertEditorValidationError(["This alert has no default variation to update."]);
  }
  const text = document.layers.find((layer) => layer.type === "text");
  const visual = document.layers.find((layer) => layer.type === "image" || layer.type === "video");
  const audio = document.layers.find((layer) => layer.type === "audio");
  const tts = document.layers.find((layer) => layer.type === "tts");
  const profile = document.targetProfiles.find((candidate) => candidate.enabled && candidate.reviewState === "ready")!;
  const primaryLayerId = visual?.id ?? text?.id;
  const layout = profile.layerLayouts.find((candidate) => candidate.layerId === primaryLayerId) ?? currentVariant.layout;
  return {
    ...rule,
    name: document.name,
    eventType: document.eventType,
    enabled: document.enabled,
    conditions: document.conditions,
    collectionIds: [document.setId],
    variants: [
      {
        ...currentVariant,
        enabled: document.enabled,
        visualAssetId: visual?.assetId ?? null,
        audioAssetId: audio?.assetId ?? null,
        textTemplate: text?.template ?? "",
        ttsConfig:
          tts === undefined || currentVariant.ttsConfig === null
            ? null
            : { ...currentVariant.ttsConfig, enabled: true, template: tts.template },
        durationMs: document.durationMs,
        layout
      },
      ...rule.variants.slice(1)
    ]
  };
}

function ruleMetadataFromDocument(document: AlertEditorDocument): AlertRuleManagementMetadata {
  return {
    ruleId: document.id,
    providerKind: document.providerKind,
    reviewState: document.targetProfiles.some((profile) => profile.enabled && profile.reviewState === "needs-review")
      ? "needs-review"
      : "ready",
    targetProfileIds: document.targetProfiles.filter((profile) => profile.enabled).map((profile) => profile.id)
  };
}

function profileById(document: AlertEditorDocument, profileId: TargetProfileId): AlertTargetProfileDocument {
  return document.targetProfiles.find((profile) => profile.id === profileId)!;
}

function createBuiltInSamples(eventType: AlertEditorDocument["eventType"]) {
  const common = { actor: { id: "sample-user", displayName: "StreamerFan" }, userName: "StreamerFan" };
  const edge = {
    actor: { id: "sample-edge", displayName: "A-Very-Long-Display-Name-For-Layout-Review" },
    userName: "A-Very-Long-Display-Name-For-Layout-Review"
  };
  const eventValues = eventType === "raid" ? { amount: 125, raidViewers: 125 }
    : eventType === "cheer" ? { amount: 500, cheerAmount: 500 }
    : eventType === "subscription" || eventType === "resubscription" ? { amount: 1, tier: "1000" }
    : eventType === "channel_point_redemption" ? { rewardTitle: "Highlight my message", userInput: "Sample message" }
    : {};
  return [
    { id: "normal", label: "Normal example", kind: "built-in" as const, payload: { ...common, ...eventValues } },
    { id: "edge", label: "Long-content example", kind: "built-in" as const, payload: { ...edge, ...eventValues } }
  ];
}

function createTestEvent(
  document: AlertEditorDocument,
  payload: Record<string, unknown>,
  referenceId: string,
  now: Date
): NormalizedStreamEvent {
  const actorValue = payload.actor;
  const actorRecord = typeof actorValue === "object" && actorValue !== null ? actorValue as Record<string, unknown> : {};
  const displayName = String(actorRecord.displayName ?? payload.userName ?? "Sample user");
  const amount = typeof payload.amount === "number" ? payload.amount : 1;
  const base = {
    id: referenceId,
    providerId: "twitch" as const,
    sourcePlatform: "twitch" as const,
    ingestProvider: document.providerKind === "streamerbot" ? "streamerbot" as const : "twitch" as const,
    occurredAt: now.toISOString(),
    actor: { id: actorRecord.id === undefined ? null : String(actorRecord.id), displayName },
    message: typeof payload.message === "string" ? payload.message : null,
    metadata: { ...payload, test: true, referenceId }
  };
  switch (document.eventType) {
    case "follow": return { ...base, type: "follow", amount: null };
    case "subscription": return { ...base, type: "subscription", amount, tier: readTier(payload.tier) };
    case "resubscription": return { ...base, type: "resubscription", amount, tier: readTier(payload.tier), streakMonths: amount };
    case "cheer": return { ...base, type: "cheer", amount };
    case "raid": return { ...base, type: "raid", amount };
    case "channel_point_redemption":
      return {
        ...base,
        type: "channel_point_redemption",
        amount: null,
        rewardId: String(payload.rewardId ?? "sample-reward"),
        rewardTitle: String(payload.rewardTitle ?? "Sample reward"),
        userInput: typeof payload.userInput === "string" ? payload.userInput : null
      };
  }
}

function readTier(value: unknown): "1000" | "2000" | "3000" | "prime" {
  return value === "2000" || value === "3000" || value === "prime" ? value : "1000";
}

function createTemplateContext(payload: Record<string, unknown>, event: NormalizedStreamEvent): Record<string, unknown> {
  return {
    ...payload,
    actor: event.actor,
    amount: event.amount,
    message: event.message,
    metadata: event.metadata,
    type: event.type
  };
}

function createLayerInstruction(
  layer: AlertLayer,
  layout: OverlayElementLayout | undefined,
  durationMs: number,
  targetProfileId: TargetProfileId,
  context: Record<string, unknown>,
  renderer: DefaultTemplateRenderer,
  instructionId: string,
  visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>
): ResolvedAlert["overlayInstruction"] | null {
  const base = {
    id: instructionId,
    overlayId: "default",
    moduleId: "alerts",
    purpose: "live" as const,
    scope: "module" as const,
    targetProfileId,
    visual: null,
    audio: null,
    text: null,
    tts: null,
    durationMs
  };
  if (layer.type === "text" && layout !== undefined) {
    return { ...base, text: { text: renderer.render({ template: layer.template, values: context }), layout } };
  }
  if ((layer.type === "image" || layer.type === "video") && layout !== undefined) {
    return {
      ...base,
      visual: { assetId: layer.assetId, mediaType: visualAssetMediaTypes[layer.assetId] ?? layer.type, layout }
    };
  }
  if (layer.type === "audio") {
    return { ...base, audio: { assetId: layer.assetId, volume: layer.volume } };
  }
  if (layer.type === "tts") {
    return {
      ...base,
      tts: {
        mode: "browser-speech",
        text: renderer.render({ template: layer.template, values: context }),
        audioAssetId: null,
        providerPayload: null
      }
    };
  }
  return null;
}
