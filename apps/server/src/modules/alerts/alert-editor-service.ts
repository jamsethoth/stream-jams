import {
  DefaultTemplateRenderer,
  SafeTemplateRenderer,
  applyAlertStarterTheme,
  alertEditorDocumentSchema,
  alertEditorTestRequestSchema,
  getAlertTemplateVariableCatalog,
  getAlertEditorAffectedProfileIds,
  createAlertTemplateContext,
  createNormalizedAlertSampleEvent,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  defaultAlertStarterThemeId,
  validateAuthoredAlertConditions,
  type AlertCondition,
  type AlertEditorDocument,
  type AlertEditorTestRequest,
  type AlertEditorTestResult,
  type AlertLayer,
  type AlertRepository,
  type AlertRule,
  type AlertStarterThemeId,
  type AlertTargetProfileDocument,
  type AlertVariationAuthoringContext,
  type AlertVariationPriorityAssignment,
  type NormalizedStreamEvent,
  type OverlayElementLayout,
  type ResolvedAlert,
  type TargetProfileId,
  type ModerationService,
  type TemplateRenderer
} from "@stream-jams/core";
import type {
  AlertRuleManagementMetadata,
  AlertSetMetadataRepository
} from "./alert-set-management-service.js";

export interface AlertEditorDocumentRepository {
  find(alertId: string): Promise<AlertEditorDocument | null>;
  findMany(alertIds: readonly string[]): Promise<ReadonlyMap<string, AlertEditorDocument>>;
  save(document: AlertEditorDocument): Promise<AlertEditorDocument>;
  delete(alertId: string): Promise<void>;
}

export interface AlertEditorTestPlayback {
  readonly sourceEvent: NormalizedStreamEvent;
  readonly alerts: readonly ResolvedAlert[];
}

export interface AlertEditorAtomicSaveInput {
  readonly document: AlertEditorDocument;
  readonly expectedRule: AlertRule;
  readonly metadata: AlertRuleManagementMetadata;
  readonly rule: AlertRule;
}

export interface AlertEditorServiceOptions {
  readonly documents: AlertEditorDocumentRepository;
  readonly rules: Pick<AlertRepository, "findRuleById" | "listRules" | "listCollections" | "saveRule">;
  readonly metadata: Pick<AlertSetMetadataRepository, "findRule" | "saveRule">;
  readonly hasConnectedOutput: (targetProfileId: TargetProfileId) => Promise<boolean>;
  readonly enqueueTest: (playback: AlertEditorTestPlayback) => Promise<void>;
  readonly moderationService: ModerationService;
  readonly findAssetMediaType?: (assetId: string) => Promise<"image" | "gif" | "video" | "audio" | null>;
  readonly generateId: () => string;
  readonly generateReferenceId: () => string;
  readonly now?: () => Date;
  readonly saveAtomically: (input: AlertEditorAtomicSaveInput) => Promise<AlertEditorDocument>;
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
  readonly #renderedTextTemplateRenderer: SafeTemplateRenderer;
  readonly #ttsTemplateRenderer: SafeTemplateRenderer;
  readonly #now: () => Date;

  constructor(options: AlertEditorServiceOptions) {
    if (typeof options.saveAtomically !== "function") {
      throw new Error("AlertEditorService requires an atomic aggregate save dependency.");
    }
    this.#options = options;
    this.#renderedTextTemplateRenderer = new SafeTemplateRenderer({
      moderationService: options.moderationService,
      templateRenderer: this.#templateRenderer,
      target: "rendered"
    });
    this.#ttsTemplateRenderer = new SafeTemplateRenderer({
      moderationService: options.moderationService,
      templateRenderer: this.#templateRenderer,
      target: "tts"
    });
    this.#now = options.now ?? (() => new Date());
  }

  async getDocument(alertId: string): Promise<AlertEditorDocument> {
    const resolved = await this.#resolveEditorItem(alertId);
    const stored = await this.#options.documents.find(alertId);
    const metadata = await this.#options.metadata.findRule(resolved.rule.id);
    return stored === null
      ? createDocumentFromRule(resolved, metadata)
      : hydrateDocument(stored, resolved, metadata);
  }

  async getVariationContext(alertId: string): Promise<AlertVariationAuthoringContext> {
    const { rule } = await this.#resolveEditorItem(alertId);
    return {
      ruleId: rule.id,
      eventType: rule.eventType,
      candidates: rule.variants.map((variant, index) => ({
        editorId: index === 0 ? rule.id : variant.id,
        variantId: variant.id,
        kind: index === 0 ? "default" : "variation",
        name: index === 0 ? rule.name : variant.name,
        enabled: variant.enabled,
        conditions: (variant.conditions ?? []).map((condition) => ({
          ...condition,
          value: typeof condition.value === "object"
            ? [condition.value[0], condition.value[1]] as [number, number]
            : condition.value
        })),
        weight: variant.weight,
        priority: variant.priority ?? null
      }))
    };
  }

  async saveDocument(
    alertId: string,
    candidate: AlertEditorDocument,
    confirmLiveImpact = false,
    priorityAssignments: readonly AlertVariationPriorityAssignment[] = []
  ): Promise<AlertEditorDocument> {
    const document = alertEditorDocumentSchema.parse(candidate);
    if (document.id !== alertId) {
      throw new AlertEditorValidationError(["The editor document does not match the selected alert."]);
    }

    const resolved = await this.#resolveEditorItem(alertId);
    if (document.eventType !== resolved.rule.eventType) {
      throw new AlertEditorValidationError(["The alert event type does not match the selected alert."]);
    }
    const metadata = await this.#options.metadata.findRule(resolved.rule.id);
    const stored = await this.#options.documents.find(alertId);
    const current = stored === null
      ? createDocumentFromRule(resolved, metadata)
      : hydrateDocument(stored, resolved, metadata);
    const assignments = validatePriorityAssignments(resolved.rule, priorityAssignments);
    const selectedPriority = resolved.kind === "variation"
      ? assignments.get(resolved.variant.id) ?? resolved.variant.priority ?? null
      : resolved.variant.priority ?? null;
    const saveDocument = alertEditorDocumentSchema.parse({ ...document, priority: selectedPriority });
    validateDocumentForSave(saveDocument, current);
    validateConditionChanges(
      resolved.rule.eventType,
      "Rule",
      saveDocument.conditions,
      resolved.rule.conditions
    );
    validateConditionChanges(
      resolved.rule.eventType,
      "Variation",
      saveDocument.variantConditions,
      resolved.variant.conditions ?? []
    );
    const projectedRule = applyPriorityAssignments(
      projectDocumentToRule(saveDocument, resolved),
      assignments
    );
    const projectedMetadata = ruleMetadataFromDocument(saveDocument, resolved.rule.id);
    const affectedProfileIds = await this.#getAffectedProfileIds({
      current,
      currentMetadata: metadata,
      currentRule: resolved.rule,
      projected: saveDocument,
      projectedMetadata,
      projectedRule,
      selectedEditorId: resolved.editorId
    });
    if (!confirmLiveImpact && affectedProfileIds.size > 0) {
      const collections = await this.#options.rules.listCollections();
      const activeSetIds = new Set(collections.filter((collection) => collection.enabled).map((collection) => collection.id));
      if (activeSetIds.has(current.setId) || activeSetIds.has(document.setId)) {
        throw new AlertEditorLiveImpactConfirmationRequiredError([...affectedProfileIds]);
      }
    }
    return this.#options.saveAtomically({
      document: saveDocument,
      expectedRule: resolved.rule,
      metadata: projectedMetadata,
      rule: projectedRule
    });
  }

  async #getAffectedProfileIds(input: {
    readonly current: AlertEditorDocument;
    readonly currentMetadata: AlertRuleManagementMetadata | null;
    readonly currentRule: AlertRule;
    readonly projected: AlertEditorDocument;
    readonly projectedMetadata: AlertRuleManagementMetadata;
    readonly projectedRule: AlertRule;
    readonly selectedEditorId: string;
  }): Promise<Set<TargetProfileId>> {
    const siblingEditorIds = input.currentRule.variants.flatMap((variant, variantIndex) => {
      const editorId = variantIndex === 0 ? input.currentRule.id : variant.id;
      return editorId === input.selectedEditorId ? [] : [editorId];
    });
    const storedSiblings = await this.#options.documents.findMany(siblingEditorIds);
    const affectedProfileIds = new Set<TargetProfileId>();

    for (const [variantIndex, currentVariant] of input.currentRule.variants.entries()) {
      const projectedVariant = input.projectedRule.variants[variantIndex];
      if (projectedVariant === undefined) continue;
      const currentResolved = resolvedEditorItem(input.currentRule, currentVariant, variantIndex);
      const projectedResolved = resolvedEditorItem(input.projectedRule, projectedVariant, variantIndex);
      const currentDocument = currentResolved.editorId === input.selectedEditorId
        ? input.current
        : hydrateOrCreateDocument(storedSiblings.get(currentResolved.editorId), currentResolved, input.currentMetadata);
      const projectedDocument = projectedResolved.editorId === input.selectedEditorId
        ? input.projected
        : hydrateOrCreateDocument(storedSiblings.get(projectedResolved.editorId), projectedResolved, input.projectedMetadata);

      for (const profileId of getAlertEditorAffectedProfileIds(currentDocument, projectedDocument)) {
        affectedProfileIds.add(profileId);
      }
    }

    return affectedProfileIds;
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
    const sourceEvent = createNormalizedAlertSampleEvent({
      eventType: request.document.eventType,
      ingestProvider: request.document.providerKind === "streamerbot" ? "streamerbot" : "twitch",
      payload: request.samplePayload,
      id: referenceId,
      occurredAt: this.#now().toISOString()
    });
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

  async #resolveEditorItem(editorId: string): Promise<ResolvedEditorItem> {
    const directRule = await this.#options.rules.findRuleById(editorId);
    if (directRule !== null) {
      const variant = directRule.variants[0];
      if (variant === undefined) throw new AlertEditorNotFoundError(editorId);
      return { rule: directRule, variant, variantIndex: 0, editorId, kind: "default" };
    }

    for (const rule of await this.#options.rules.listRules()) {
      const variantIndex = rule.variants.findIndex((variant, index) => index > 0 && variant.id === editorId);
      if (variantIndex >= 0) {
        return { rule, variant: rule.variants[variantIndex]!, variantIndex, editorId, kind: "variation" };
      }
    }
    throw new AlertEditorNotFoundError(editorId);
  }

  #createTestAlerts(
    request: AlertEditorTestRequest,
    profile: AlertTargetProfileDocument,
    sourceEvent: NormalizedStreamEvent,
    visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>
  ): readonly ResolvedAlert[] {
    const layouts = new Map(profile.layerLayouts.map((layout) => [layout.layerId, layout]));
    const context = createAlertTemplateContext(sourceEvent);
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
        this.#renderedTextTemplateRenderer,
        this.#ttsTemplateRenderer,
        this.#options.generateId(),
        visualAssetMediaTypes
      );
      if (instruction === null) return [];
      return [
        {
          id: this.#options.generateId(),
          sourceEventId: sourceEvent.id,
          ruleId: request.document.parentAlertId ?? request.document.id,
          variantId: request.document.id,
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

interface ResolvedEditorItem {
  readonly rule: AlertRule;
  readonly variant: AlertRule["variants"][number];
  readonly variantIndex: number;
  readonly editorId: string;
  readonly kind: "default" | "variation";
}

function resolvedEditorItem(
  rule: AlertRule,
  variant: AlertRule["variants"][number],
  variantIndex: number
): ResolvedEditorItem {
  return {
    rule,
    variant,
    variantIndex,
    editorId: variantIndex === 0 ? rule.id : variant.id,
    kind: variantIndex === 0 ? "default" : "variation"
  };
}

function hydrateOrCreateDocument(
  stored: AlertEditorDocument | undefined,
  resolved: ResolvedEditorItem,
  metadata: AlertRuleManagementMetadata | null
): AlertEditorDocument {
  return stored === undefined
    ? createDocumentFromRule(resolved, metadata)
    : hydrateDocument(stored, resolved, metadata);
}

function createDocumentFromRule(
  resolved: ResolvedEditorItem,
  metadata: AlertRuleManagementMetadata | null,
  themeId: AlertStarterThemeId = defaultAlertStarterThemeId
): AlertEditorDocument {
  const { rule, variant } = resolved;
  if (rule.collectionIds[0] === undefined) {
    throw new AlertEditorValidationError(["This alert is missing a set or default variation and cannot be edited."]);
  }

  const layers: AlertLayer[] = [];
  if (variant.visualAssetId !== null) {
    layers.push(layerBase(`${resolved.editorId}-visual`, "Visual", "image", layers.length, { assetId: variant.visualAssetId }));
  }
  layers.push(layerBase(`${resolved.editorId}-text`, "Message", "text", layers.length, {
    template: variant.textTemplate,
    textStyle: structuredClone(compatibilityAlertTextStyle),
    boxStyle: structuredClone(compatibilityAlertTextBoxStyle)
  }));
  if (variant.audioAssetId !== null) {
    layers.push(layerBase(`${resolved.editorId}-audio`, "Audio", "audio", layers.length, { assetId: variant.audioAssetId, volume: 1 }));
  }
  if (variant.ttsConfig !== null) {
    layers.push(layerBase(`${resolved.editorId}-tts`, "Text to speech", "tts", layers.length, {
      enabled: variant.ttsConfig.enabled,
      providerId: variant.ttsConfig.providerId,
      template: variant.ttsConfig.template
    }));
  }

  const enabledProfiles = new Set(metadata?.targetProfileIds ?? ["landscape"]);
  const landscapeReviewState = metadata?.reviewState === "needs-review" ? "needs-review" : "ready";
  const document = {
    id: resolved.editorId,
    setId: rule.collectionIds[0],
    providerKind: metadata?.providerKind ?? "twitch",
    eventType: rule.eventType,
    kind: resolved.kind,
    parentAlertId: resolved.kind === "variation" ? rule.id : null,
    name: resolved.kind === "default" ? rule.name : variant.name,
    enabled: variant.enabled,
    conditions: rule.conditions,
    variantConditions: variant.conditions ?? [],
    weight: variant.weight,
    priority: variant.priority ?? null,
    cooldownSeconds: rule.cooldownSeconds,
    rulePriority: rule.priority,
    durationMs: variant.durationMs,
    layers,
    targetProfiles: [
      createTargetProfile("landscape", enabledProfiles.has("landscape"), landscapeReviewState, layers, variant.layout),
      createTargetProfile(
        "vertical",
        enabledProfiles.has("vertical"),
        metadata?.reviewState === "ready" && enabledProfiles.has("vertical") ? "ready" : "needs-review",
        layers,
        fitLayout(variant.layout, 1080, 1920)
      )
    ],
    templateVariables: getAlertTemplateVariableCatalog(rule.eventType),
    samplePayloads: createBuiltInSamples(rule.eventType)
  };
  const compatibilityDocument = alertEditorDocumentSchema.parse(document);
  const themedDocument = applyAlertStarterTheme(compatibilityDocument, themeId);
  return alertEditorDocumentSchema.parse({
    ...themedDocument,
    enabled: compatibilityDocument.enabled,
    targetProfiles: themedDocument.targetProfiles.map((profile) => {
      const compatibilityProfile = compatibilityDocument.targetProfiles.find(
        (candidate) => candidate.id === profile.id
      );
      if (compatibilityProfile === undefined) {
        throw new Error(`Missing compatibility target profile: ${profile.id}`);
      }
      return {
        ...profile,
        enabled: compatibilityProfile.enabled,
        reviewState: compatibilityProfile.reviewState
      };
    })
  });
}

export function createAlertEditorDocumentFromRule(
  rule: AlertRule,
  variantIndex: number,
  metadata: AlertRuleManagementMetadata | null,
  themeId: AlertStarterThemeId = defaultAlertStarterThemeId
): AlertEditorDocument {
  const variant = rule.variants[variantIndex];
  if (variant === undefined || variantIndex < 0) {
    throw new AlertEditorNotFoundError(variantIndex === 0 ? rule.id : String(variantIndex));
  }
  return createDocumentFromRule({
    rule,
    variant,
    variantIndex,
    editorId: variantIndex === 0 ? rule.id : variant.id,
    kind: variantIndex === 0 ? "default" : "variation"
  }, metadata, themeId);
}

function hydrateDocument(
  stored: AlertEditorDocument,
  resolved: ResolvedEditorItem,
  metadata: AlertRuleManagementMetadata | null
): AlertEditorDocument {
  const setId = resolved.rule.collectionIds[0];
  if (setId === undefined) {
    throw new AlertEditorValidationError(["This alert is missing a set and cannot be edited."]);
  }
  return alertEditorDocumentSchema.parse({
    ...stored,
    id: resolved.editorId,
    setId,
    providerKind: metadata?.providerKind ?? stored.providerKind,
    eventType: resolved.rule.eventType,
    kind: resolved.kind,
    parentAlertId: resolved.kind === "variation" ? resolved.rule.id : null,
    name: resolved.kind === "default" ? resolved.rule.name : resolved.variant.name,
    enabled: resolved.variant.enabled,
    conditions: resolved.rule.conditions,
    variantConditions: resolved.variant.conditions ?? [],
    weight: resolved.variant.weight,
    priority: resolved.variant.priority ?? null,
    cooldownSeconds: resolved.rule.cooldownSeconds,
    rulePriority: resolved.rule.priority,
    templateVariables: getAlertTemplateVariableCatalog(resolved.rule.eventType)
  });
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

function validateDocumentForSave(document: AlertEditorDocument, current: AlertEditorDocument): void {
  const layerIds = document.layers.map((layer) => layer.id);
  const issues = layerIds.length === new Set(layerIds).size ? [] : ["Layer names must identify unique layers."];
  const enabledProfiles = document.targetProfiles.filter((profile) => profile.enabled);
  if (enabledProfiles.length === 0) issues.push("Enable at least one target profile before saving.");
  if (!enabledProfiles.some((profile) => profile.reviewState === "ready")) {
    issues.push("Finish reviewing at least one enabled target profile before saving.");
  }
  for (const profile of enabledProfiles) {
    const currentProfile = current.targetProfiles.find((candidate) => candidate.id === profile.id);
    if (
      profile.reviewState !== "ready"
      && !(currentProfile?.enabled === true && currentProfile.reviewState === "needs-review")
    ) {
      issues.push(`Finish reviewing the ${profile.id} profile before enabling it.`);
    }
    issues.push(...validateProfile(document, profile));
  }
  if (issues.length > 0) throw new AlertEditorValidationError(issues);
}

function validatePriorityAssignments(
  rule: AlertRule,
  assignments: readonly AlertVariationPriorityAssignment[]
): ReadonlyMap<string, number> {
  if (assignments.length === 0) return new Map();

  const defaultVariant = rule.variants[0];
  if (defaultVariant === undefined) {
    throw new AlertEditorValidationError(["This alert is missing its default variation."]);
  }
  const conditionalIds = rule.variants.slice(1).map((variant) => variant.id);
  const conditionalIdSet = new Set(conditionalIds);
  const seen = new Set<string>();
  const issues: string[] = [];
  const priorityBase = Math.max(defaultVariant.priority ?? 0, 0);

  for (const assignment of assignments) {
    if (assignment.variationId === rule.id || assignment.variationId === defaultVariant.id) {
      issues.push("The default alert priority cannot be changed by a variation-group save.");
    } else if (!conditionalIdSet.has(assignment.variationId)) {
      issues.push(`Variation "${assignment.variationId}" does not belong to this alert.`);
    }
    if (seen.has(assignment.variationId)) {
      issues.push(`Variation "${assignment.variationId}" has more than one priority assignment.`);
    }
    seen.add(assignment.variationId);
    if (!Number.isInteger(assignment.priority) || assignment.priority <= priorityBase) {
      issues.push(`Variation "${assignment.variationId}" requires an integer priority above ${priorityBase}.`);
    }
  }

  const missingIds = conditionalIds.filter((id) => !seen.has(id));
  if (missingIds.length > 0) {
    issues.push(`Priority assignments are missing ${missingIds.join(", ")}.`);
  }
  if (assignments.length !== conditionalIds.length) {
    issues.push("A priority-group save must assign every non-default variation exactly once.");
  }

  const priorities = [...new Set(assignments.map(({ priority }) => priority))].sort((left, right) => left - right);
  if (priorities.some((priority, index) => priority !== priorityBase + index + 1)) {
    issues.push(`Priority groups must use contiguous values beginning at ${priorityBase + 1}.`);
  }

  if (issues.length > 0) throw new AlertEditorValidationError(issues);
  return new Map(assignments.map(({ variationId, priority }) => [variationId, priority]));
}

function validateConditionChanges(
  eventType: AlertEditorDocument["eventType"],
  scope: "Rule" | "Variation",
  candidateConditions: readonly AlertCondition[],
  savedConditions: readonly AlertCondition[]
): void {
  const unchangedUnsupported = savedConditions
    .filter((condition) => hasUnsupportedConditionIssue(eventType, condition))
    .map(serializeCondition);
  const issues: string[] = [];

  candidateConditions.forEach((condition, conditionIndex) => {
    const validationIssues = validateAuthoredAlertConditions(eventType, [condition]);
    if (validationIssues.length === 0) return;
    const onlyUnsupported = validationIssues.every(
      ({ code }) => code === "unsupported-field" || code === "unsupported-operator"
    );
    if (onlyUnsupported) {
      const serialized = serializeCondition(condition);
      const savedIndex = unchangedUnsupported.indexOf(serialized);
      if (savedIndex >= 0) {
        unchangedUnsupported.splice(savedIndex, 1);
        return;
      }
    }
    for (const issue of validationIssues) {
      issues.push(`${scope} condition ${conditionIndex + 1}: ${issue.message}`);
    }
  });

  if (issues.length > 0) throw new AlertEditorValidationError(issues);
}

function hasUnsupportedConditionIssue(
  eventType: AlertEditorDocument["eventType"],
  condition: AlertCondition
): boolean {
  return validateAuthoredAlertConditions(eventType, [condition]).some(
    ({ code }) => code === "unsupported-field" || code === "unsupported-operator"
  );
}

function serializeCondition(condition: AlertCondition): string {
  return JSON.stringify([condition.field, condition.operator, condition.value]);
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

function projectDocumentToRule(document: AlertEditorDocument, resolved: ResolvedEditorItem): AlertRule {
  const { rule, variant: currentVariant } = resolved;
  const text = document.layers.find((layer) => layer.type === "text");
  const visual = document.layers.find((layer) => layer.type === "image" || layer.type === "video");
  const audio = document.layers.find((layer) => layer.type === "audio");
  const tts = document.layers.find((layer) => layer.type === "tts");
  const profile = document.targetProfiles.find((candidate) => candidate.enabled && candidate.reviewState === "ready")!;
  const primaryLayerId = visual?.id ?? text?.id;
  const layout = profile.layerLayouts.find((candidate) => candidate.layerId === primaryLayerId) ?? currentVariant.layout;
  return {
    ...rule,
    name: resolved.kind === "default" ? document.name : rule.name,
    eventType: document.eventType,
    enabled: rule.variants.some((variant, index) => index === resolved.variantIndex ? document.enabled : variant.enabled),
    conditions: document.conditions,
    collectionIds: [document.setId],
    cooldownSeconds: document.cooldownSeconds,
    priority: document.rulePriority,
    variants: rule.variants.map((variant, index) => index === resolved.variantIndex
      ? {
        ...currentVariant,
        name: resolved.kind === "variation" ? document.name : currentVariant.name,
        enabled: document.enabled,
        conditions: document.variantConditions,
        weight: document.weight,
        ...(document.priority === null ? { priority: undefined } : { priority: document.priority }),
        visualAssetId: visual?.assetId ?? null,
        audioAssetId: audio?.assetId ?? null,
        textTemplate: text?.template ?? "",
        ttsConfig: tts === undefined
          ? null
          : {
              enabled: tts.enabled,
              providerId: tts.providerId,
              voiceId: null,
              template: tts.template,
              minimumAmount: null
            },
        durationMs: document.durationMs,
        layout
      }
      : variant)
  };
}

function applyPriorityAssignments(
  rule: AlertRule,
  assignments: ReadonlyMap<string, number>
): AlertRule {
  if (assignments.size === 0) return rule;
  return {
    ...rule,
    variants: rule.variants.map((variant, index) => {
      if (index === 0) return variant;
      const priority = assignments.get(variant.id);
      return priority === undefined ? variant : { ...variant, priority };
    })
  };
}

function ruleMetadataFromDocument(document: AlertEditorDocument, ruleId: string): AlertRuleManagementMetadata {
  return {
    ruleId,
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
  switch (eventType) {
    case "follow": return builtInSamples(common, edge);
    case "subscription": return builtInSamples({ ...common, amount: 1, tier: "1000" }, { ...edge, amount: 12, tier: "3000" });
    case "resubscription": return builtInSamples({ ...common, amount: 6, tier: "1000", streakMonths: 6 }, { ...edge, amount: 48, tier: "3000", streakMonths: 48 });
    case "cheer": return builtInSamples({ ...common, amount: 500, cheerAmount: 500 }, { ...edge, amount: 25_000, cheerAmount: 25_000 });
    case "raid": return builtInSamples({ ...common, amount: 125, raidViewers: 125 }, { ...edge, amount: 5_000, raidViewers: 5_000 });
    case "channel_point_redemption": return builtInSamples(
      { ...common, rewardTitle: "Highlight my message", userInput: "Sample message" },
      { ...edge, rewardTitle: "A very long reward title for layout review", userInput: "A long sample redemption message for layout review." }
    );
    case "gift_subscription": return builtInSamples(
      {
        actor: { id: "recipient-normal", displayName: "GiftRecipient" },
        userName: "GiftRecipient",
        tier: "1000",
        recipient: { id: "recipient-normal", displayName: "GiftRecipient" },
        gifter: common.actor,
        frequency: "Per recipient gift subscription"
      },
      {
        actor: { id: "recipient-edge", displayName: "A-Very-Long-Gift-Recipient-Name" },
        userName: "A-Very-Long-Gift-Recipient-Name",
        tier: "3000",
        recipient: { id: "recipient-edge", displayName: "A-Very-Long-Gift-Recipient-Name" },
        gifter: edge.actor,
        frequency: "Per recipient gift subscription"
      },
      "Per-recipient gift subscription"
    );
    case "community_gift": return builtInSamples(
      { ...common, amount: 5, tier: "1000", cumulativeTotal: 42, frequency: "Aggregate community gift" },
      { ...edge, amount: 100, tier: "3000", cumulativeTotal: 9_999, frequency: "Aggregate community gift" },
      "Aggregate community gift"
    );
    case "hype_train_start": return builtInSamples(
      { ...common, trainId: "sample-train", level: 1, progress: 50, goal: 100, total: 50 },
      { ...edge, trainId: "sample-train-edge", level: 10, progress: 9_999, goal: 10_000, total: 9_999 }
    );
    case "hype_train_progress": return builtInSamples(
      { ...common, trainId: "sample-train", level: 2, progress: 250, goal: 500, total: 250 },
      { ...edge, trainId: "sample-train-edge", level: 10, progress: 9_999, goal: 10_000, total: 9_999 }
    );
    case "hype_train_end": return builtInSamples(
      { ...common, trainId: "sample-train", level: 3, progress: 500, goal: 500, total: 500 },
      { ...edge, trainId: "sample-train-edge", level: 10, progress: 10_000, goal: 10_000, total: 10_000 }
    );
    case "poll_start": return builtInSamples(
      { ...common, pollId: "sample-poll", title: "What should we play next?", totalVotes: 0, status: "active" },
      { ...edge, pollId: "sample-poll-edge", title: "A very long poll title for layout review", totalVotes: 9_999, status: "active" }
    );
    case "poll_progress": return builtInSamples(
      { ...common, pollId: "sample-poll", title: "What should we play next?", totalVotes: 250, status: "active" },
      { ...edge, pollId: "sample-poll-edge", title: "A very long poll title for layout review", totalVotes: 9_999, status: "active" }
    );
    case "poll_end": return builtInSamples(
      { ...common, pollId: "sample-poll", title: "What should we play next?", totalVotes: 500, status: "completed" },
      { ...edge, pollId: "sample-poll-edge", title: "A very long poll title for layout review", totalVotes: 9_999, status: "archived" }
    );
    case "prediction_start": return builtInSamples(
      { ...common, predictionId: "sample-prediction", title: "Will we win?", totalPoints: 0, totalUsers: 0, status: "active" },
      { ...edge, predictionId: "sample-prediction-edge", title: "A very long prediction title for layout review", totalPoints: 1_000_000, totalUsers: 9_999, status: "active" }
    );
    case "prediction_progress": return builtInSamples(
      { ...common, predictionId: "sample-prediction", title: "Will we win?", totalPoints: 12_000, totalUsers: 120, status: "active" },
      { ...edge, predictionId: "sample-prediction-edge", title: "A very long prediction title for layout review", totalPoints: 1_000_000, totalUsers: 9_999, status: "active" }
    );
    case "prediction_lock": return builtInSamples(
      { ...common, predictionId: "sample-prediction", title: "Will we win?", totalPoints: 12_000, totalUsers: 120, status: "locked" },
      { ...edge, predictionId: "sample-prediction-edge", title: "A very long prediction title for layout review", totalPoints: 1_000_000, totalUsers: 9_999, status: "locked" }
    );
    case "prediction_end": return builtInSamples(
      { ...common, predictionId: "sample-prediction", title: "Will we win?", totalPoints: 12_000, totalUsers: 120, status: "resolved" },
      { ...edge, predictionId: "sample-prediction-edge", title: "A very long prediction title for layout review", totalPoints: 1_000_000, totalUsers: 9_999, status: "canceled" }
    );
    case "stream_online": return builtInSamples({ ...common, streamId: "sample-stream", streamType: "live" }, { ...edge, streamId: "sample-stream-edge", streamType: "watch_party" });
    case "stream_offline": return builtInSamples({ ...common, streamId: "sample-stream", streamType: "live" }, { ...edge, streamId: "sample-stream-edge", streamType: "watch_party" });
  }
}

function builtInSamples(normal: Record<string, unknown>, edge: Record<string, unknown>, label = "Example") {
  return [
    { id: "normal", label: `Normal ${label}`, kind: "built-in" as const, payload: normal },
    { id: "edge", label: `Edge ${label}`, kind: "built-in" as const, payload: edge }
  ];
}

function createLayerInstruction(
  layer: AlertLayer,
  layout: OverlayElementLayout | undefined,
  durationMs: number,
  targetProfileId: TargetProfileId,
  context: Record<string, unknown>,
  renderedTextTemplateRenderer: TemplateRenderer,
  ttsTemplateRenderer: TemplateRenderer,
  instructionId: string,
  visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">>
): ResolvedAlert["overlayInstruction"] | null {
  const base = {
    id: instructionId,
    overlayId: "default",
    moduleId: "alerts",
    operatorTest: true as const,
    purpose: "live" as const,
    scope: "module" as const,
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
        text: renderedTextTemplateRenderer.render({ template: layer.template, values: context }),
        layout,
        textStyle: layer.textStyle,
        boxStyle: layer.boxStyle
      }
    };
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
        text: ttsTemplateRenderer.render({ template: layer.template, values: context }),
        audioAssetId: null,
        providerPayload: null
      }
    };
  }
  if (layer.type === "shape" && layout !== undefined) {
    return { ...base, shape: { fill: layer.fill, layout } };
  }
  return null;
}
