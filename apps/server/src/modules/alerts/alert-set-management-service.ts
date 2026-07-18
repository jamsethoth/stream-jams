import {
  alertCreateInputSchema,
  alertSetActivationImpactSchema,
  alertSetActivationResultSchema,
  alertSetDetailSchema,
  alertSetMutationInputSchema,
  alertSetOverviewSchema,
  alertStarterTemplates,
  evaluateAlertSetActivation,
  type AlertBrowserSourceView,
  type AlertCreateInput,
  type AlertInventoryRow,
  type AlertRule,
  type AlertService,
  type AlertSetActivationImpact,
  type AlertSetActivationResult,
  type AlertSetDetail,
  type AlertSetMutationInput,
  type AlertSetOverview,
  type AlertValidationIssue,
  type ProviderKind,
  type StreamEventType,
  type TargetProfileId
} from "@stream-jams/core";

export interface AlertSetMetadata {
  readonly setId: string;
  readonly starter: boolean;
  readonly starterReviewState: "pending" | "complete";
  readonly landscapeEnabled: boolean;
  readonly landscapeReviewState: "ready" | "needs-review";
  readonly verticalEnabled: boolean;
  readonly verticalReviewState: "ready" | "needs-review";
}

export interface AlertRuleManagementMetadata {
  readonly ruleId: string;
  readonly providerKind: ProviderKind;
  readonly reviewState: "ready" | "needs-review";
  readonly targetProfileIds: readonly TargetProfileId[];
}

export interface AlertSetMetadataRepository {
  findSet(setId: string): Promise<AlertSetMetadata | null>;
  saveSet(metadata: AlertSetMetadata): Promise<AlertSetMetadata>;
  deleteSet(setId: string): Promise<void>;
  findRule(ruleId: string): Promise<AlertRuleManagementMetadata | null>;
  saveRule(metadata: AlertRuleManagementMetadata): Promise<AlertRuleManagementMetadata>;
  deleteRule(ruleId: string): Promise<void>;
  activateSet(setId: string): Promise<string | null>;
}

type ManagedAlertService = Pick<
  AlertService,
  | "listCollections"
  | "createCollection"
  | "updateCollection"
  | "deleteCollection"
  | "listRules"
  | "createRule"
  | "updateRule"
  | "setRuleEnabled"
  | "deleteRule"
>;

export interface AlertSetManagementServiceOptions {
  readonly alertService: ManagedAlertService;
  readonly metadataRepository: AlertSetMetadataRepository;
  readonly listBrowserSources: () => Promise<readonly AlertBrowserSourceView[]>;
}

const starterAlertEventTypes: readonly StreamEventType[] = ["follow", "raid", "subscription", "channel_point_redemption"];
const starterAlerts = alertStarterTemplates.filter((template) => starterAlertEventTypes.includes(template.eventType));

export class AlertSetManagementService {
  readonly #alertService: ManagedAlertService;
  readonly #metadataRepository: AlertSetMetadataRepository;
  readonly #listBrowserSources: () => Promise<readonly AlertBrowserSourceView[]>;

  constructor(options: AlertSetManagementServiceOptions) {
    this.#alertService = options.alertService;
    this.#metadataRepository = options.metadataRepository;
    this.#listBrowserSources = options.listBrowserSources;
  }

  async listSets(): Promise<readonly AlertSetOverview[]> {
    await this.#ensureStarterSet();
    let collections = await this.#alertService.listCollections();
    if (!collections.some((collection) => collection.enabled) && collections[0] !== undefined) {
      await this.#metadataRepository.activateSet(collections[0].id);
      collections = await this.#alertService.listCollections();
    }
    const rules = await this.#alertService.listRules();
    const browserSources = await this.#listBrowserSources();
    return Promise.all(
      collections.map(async (collection) =>
        this.#toOverview(collection.id, rules, browserSources)
      )
    );
  }

  async getSet(setId: string): Promise<AlertSetDetail> {
    const sets = await this.listSets();
    const overview = sets.find((set) => set.id === setId);
    if (overview === undefined) {
      throw new AlertSetNotFoundError(setId);
    }
    const rules = (await this.#alertService.listRules()).filter((rule) => rule.collectionIds.includes(setId));
    const browserSources = await this.#listBrowserSources();
    return alertSetDetailSchema.parse({
      overview,
      inventory: await Promise.all(rules.map((rule) => this.#toInventoryRow(setId, rule))),
      browserSources
    });
  }

  async createSet(input: AlertSetMutationInput): Promise<AlertSetOverview> {
    const parsed = alertSetMutationInputSchema.parse(input);
    await this.#assertUniqueName(parsed.name);
    const created = await this.#alertService.createCollection({ name: parsed.name, enabled: false });
    await this.#metadataRepository.saveSet(defaultSetMetadata(created.id));
    return (await this.getSet(created.id)).overview;
  }

  async createAlert(setId: string, input: AlertCreateInput): Promise<AlertInventoryRow> {
    const parsed = alertCreateInputSchema.parse(input);
    await this.#findCollection(setId);
    const template = alertStarterTemplates.find((candidate) => candidate.eventType === parsed.eventType);
    if (template === undefined) {
      throw new Error(`No starter alert template exists for ${parsed.eventType}`);
    }
    const created = await this.#alertService.createRule(starterRuleInput(setId, template, parsed.name));
    await this.#metadataRepository.saveRule({
      ruleId: created.id,
      providerKind: "twitch",
      reviewState: "needs-review",
      targetProfileIds: ["landscape", "vertical"]
    });
    return this.#toInventoryRow(setId, created);
  }

  async renameSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview> {
    const parsed = alertSetMutationInputSchema.parse(input);
    const existing = await this.#findCollection(setId);
    await this.#assertUniqueName(parsed.name, setId);
    await this.#alertService.updateCollection(setId, { name: parsed.name, enabled: existing.enabled });
    return (await this.getSet(setId)).overview;
  }

  async duplicateSet(setId: string, input: AlertSetMutationInput): Promise<AlertSetOverview> {
    const parsed = alertSetMutationInputSchema.parse(input);
    await this.#assertUniqueName(parsed.name);
    await this.#findCollection(setId);
    const duplicate = await this.#alertService.createCollection({ name: parsed.name, enabled: false });
    await this.#metadataRepository.saveSet({
      ...defaultSetMetadata(duplicate.id),
      landscapeReviewState: "needs-review",
      verticalReviewState: "needs-review"
    });

    const sourceRules = (await this.#alertService.listRules()).filter((rule) => rule.collectionIds.includes(setId));
    for (const sourceRule of sourceRules) {
      const created = await this.#alertService.createRule({
        ...omitId(sourceRule),
        name: sourceRule.name,
        enabled: false,
        collectionIds: [duplicate.id],
        variants: sourceRule.variants.map((variant) => ({ ...omitId(variant), enabled: false }))
      });
      const sourceMetadata = await this.#ruleMetadata(sourceRule.id);
      await this.#metadataRepository.saveRule({
        ...sourceMetadata,
        ruleId: created.id,
        reviewState: "needs-review"
      });
    }

    return (await this.getSet(duplicate.id)).overview;
  }

  async markStarterReviewComplete(setId: string): Promise<AlertSetOverview> {
    await this.#findCollection(setId);
    const metadata = await this.#setMetadata(setId);
    await this.#metadataRepository.saveSet({ ...metadata, starterReviewState: "complete" });
    return (await this.getSet(setId)).overview;
  }

  async setAlertEnabled(ruleId: string, enabled: boolean): Promise<AlertSetDetail> {
    const rule = (await this.#alertService.listRules()).find((candidate) => candidate.id === ruleId);
    if (rule === undefined) {
      throw new AlertRuleForSetNotFoundError(ruleId);
    }
    if (enabled && !rule.variants.some((variant) => variant.enabled)) {
      await this.#alertService.updateRule(ruleId, {
        ...omitId(rule),
        enabled: true,
        variants: rule.variants.map((variant, index) => ({
          ...variant,
          enabled: index === 0
        }))
      });
    } else {
      await this.#alertService.setRuleEnabled(ruleId, enabled);
    }
    const metadata = await this.#ruleMetadata(ruleId);
    if (enabled && metadata.reviewState === "needs-review") {
      await this.#metadataRepository.saveRule({ ...metadata, reviewState: "ready" });
    }
    const setId = rule.collectionIds[0];
    if (setId === undefined) {
      throw new AlertRuleForSetNotFoundError(ruleId);
    }
    return this.getSet(setId);
  }

  async getActivationImpact(setId: string): Promise<AlertSetActivationImpact> {
    const detail = await this.getSet(setId);
    const activeSet = (await this.listSets()).find((set) => set.active) ?? null;
    return alertSetActivationImpactSchema.parse({
      currentActiveSetId: activeSet?.id ?? null,
      replacingActiveSetName: activeSet?.id === setId ? null : activeSet?.name ?? null,
      enabledAlertCount: detail.overview.enabledAlertCount,
      affectedTargetProfileIds: detail.overview.targetProfiles
        .filter((profile) => profile.enabled)
        .map((profile) => profile.id),
      affectedEventTypes: unique(detail.inventory.filter((row) => row.enabled).map((row) => row.eventType)),
      blockers: detail.overview.validationIssues.filter((issue) => issue.severity === "blocker"),
      warnings: detail.overview.validationIssues.filter((issue) => issue.severity === "warning")
    });
  }

  async activateSet(setId: string, confirmWarnings: boolean): Promise<AlertSetActivationResult> {
    const detail = await this.getSet(setId);
    const decision = evaluateAlertSetActivation(detail.overview);
    const impact = await this.getActivationImpact(setId);
    if (!decision.allowed) {
      throw new AlertSetActivationBlockedError(setId, impact);
    }
    if (decision.requiresConfirmation && !confirmWarnings) {
      throw new AlertSetActivationConfirmationRequiredError(setId, impact);
    }
    const replacedSetId = await this.#metadataRepository.activateSet(setId);
    return alertSetActivationResultSchema.parse({
      activeSet: (await this.getSet(setId)).overview,
      replacedSetId,
      impact
    });
  }

  async deleteSet(setId: string): Promise<void> {
    const collections = await this.#alertService.listCollections();
    const selected = collections.find((collection) => collection.id === setId);
    if (selected === undefined) {
      throw new AlertSetNotFoundError(setId);
    }
    if (selected.enabled || collections.length <= 1) {
      throw new AlertSetDeleteBlockedError(setId, selected.enabled ? "active" : "only-set");
    }

    const rules = (await this.#alertService.listRules()).filter((rule) => rule.collectionIds.includes(setId));
    for (const rule of rules) {
      if (rule.collectionIds.length === 1) {
        await this.#alertService.deleteRule(rule.id);
        await this.#metadataRepository.deleteRule(rule.id);
      } else {
        await this.#alertService.updateRule(rule.id, {
          ...rule,
          collectionIds: rule.collectionIds.filter((collectionId) => collectionId !== setId)
        });
      }
    }
    await this.#alertService.deleteCollection(setId);
    await this.#metadataRepository.deleteSet(setId);
  }

  async #ensureStarterSet(): Promise<void> {
    if ((await this.#alertService.listCollections()).length > 0) {
      return;
    }

    const starter = await this.#alertService.createCollection({ name: "Default", enabled: true });
    await this.#metadataRepository.saveSet({
      ...defaultSetMetadata(starter.id),
      starter: true,
      starterReviewState: "pending",
      landscapeReviewState: "needs-review",
      verticalReviewState: "needs-review"
    });
    for (const definition of starterAlerts) {
      const rule = await this.#alertService.createRule(starterRuleInput(starter.id, definition));
      await this.#metadataRepository.saveRule({
        ruleId: rule.id,
        providerKind: "twitch",
        reviewState: "needs-review",
        targetProfileIds: ["landscape", "vertical"]
      });
    }
  }

  async #toOverview(
    setId: string,
    allRules: readonly AlertRule[],
    browserSources: readonly AlertBrowserSourceView[]
  ): Promise<AlertSetOverview> {
    const collection = await this.#findCollection(setId);
    const metadata = await this.#setMetadata(setId);
    const rules = allRules.filter((rule) => rule.collectionIds.includes(setId));
    const enabledRules = rules.filter((rule) => rule.enabled);
    const issues: AlertValidationIssue[] = [];
    if (enabledRules.length === 0) {
      issues.push(validationIssue({
        id: `${setId}:no-enabled-alerts`,
        severity: "blocker",
        code: "NO_ENABLED_ALERTS",
        message: "This alert set has no enabled alerts.",
        nextStep: "Review and enable at least one valid alert.",
        targetProfileId: "landscape"
      }));
    }

    for (const rule of enabledRules) {
      if (!rule.variants.some((variant) => variant.enabled)) {
        issues.push(validationIssue({
          id: `${rule.id}:no-enabled-variation`,
          severity: "blocker",
          code: "NO_ENABLED_VARIATION",
          message: `${rule.name} has no enabled default or variation.`,
          nextStep: "Open the alert and enable a valid default or variation.",
          alertId: rule.id,
          eventType: rule.eventType
        }));
      }
    }

    const profileIssues = (profileId: TargetProfileId) => issues.filter(
      (issue) => issue.targetProfileId === null || issue.targetProfileId === profileId
    );
    return alertSetOverviewSchema.parse({
      id: collection.id,
      name: collection.name,
      active: collection.enabled,
      starter: metadata.starter,
      starterReviewState: metadata.starterReviewState,
      enabledAlertCount: enabledRules.length,
      targetProfiles: [
        {
          id: "landscape",
          enabled: metadata.landscapeEnabled,
          reviewState: metadata.landscapeReviewState,
          blockerCount: profileIssues("landscape").filter((issue) => issue.severity === "blocker").length,
          warningCount: profileIssues("landscape").filter((issue) => issue.severity === "warning").length
        },
        {
          id: "vertical",
          enabled: metadata.verticalEnabled,
          reviewState: metadata.verticalReviewState,
          blockerCount: profileIssues("vertical").filter((issue) => issue.severity === "blocker").length,
          warningCount: profileIssues("vertical").filter((issue) => issue.severity === "warning").length
        }
      ],
      validationIssues: issues,
      outputs: browserSources.map(({ targetProfileId, purpose, connectionState, lastConnectedAt, copyableUrlStatus }) => ({
        targetProfileId,
        purpose,
        connectionState,
        lastConnectedAt,
        copyableUrlStatus
      }))
    });
  }

  async #toInventoryRow(setId: string, rule: AlertRule): Promise<AlertInventoryRow> {
    const metadata = await this.#ruleMetadata(rule.id);
    return {
      id: rule.id,
      setId,
      providerKind: metadata.providerKind,
      eventType: rule.eventType,
      name: rule.name,
      kind: "default",
      enabled: rule.enabled,
      reviewState: metadata.reviewState,
      targetProfileIds: [...metadata.targetProfileIds],
      previewText: rule.variants[0]?.textTemplate ?? ""
    };
  }

  async #setMetadata(setId: string): Promise<AlertSetMetadata> {
    const existing = await this.#metadataRepository.findSet(setId);
    if (existing !== null) {
      return existing;
    }
    return this.#metadataRepository.saveSet(defaultSetMetadata(setId));
  }

  async #ruleMetadata(ruleId: string): Promise<AlertRuleManagementMetadata> {
    const existing = await this.#metadataRepository.findRule(ruleId);
    if (existing !== null) {
      return existing;
    }
    return this.#metadataRepository.saveRule({
      ruleId,
      providerKind: "twitch",
      reviewState: "ready",
      targetProfileIds: ["landscape", "vertical"]
    });
  }

  async #findCollection(setId: string) {
    const collection = (await this.#alertService.listCollections()).find((candidate) => candidate.id === setId);
    if (collection === undefined) {
      throw new AlertSetNotFoundError(setId);
    }
    return collection;
  }

  async #assertUniqueName(name: string, exceptSetId?: string): Promise<void> {
    const duplicate = (await this.#alertService.listCollections()).find(
      (collection) => collection.id !== exceptSetId && collection.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
    );
    if (duplicate !== undefined) {
      throw new AlertSetNameConflictError(name);
    }
  }
}

export class AlertSetNotFoundError extends Error {
  constructor(readonly setId: string) {
    super(`Alert set "${setId}" was not found`);
  }
}

export class AlertRuleForSetNotFoundError extends Error {
  constructor(readonly ruleId: string) {
    super(`Alert "${ruleId}" was not found in an alert set`);
  }
}

export class AlertSetNameConflictError extends Error {
  constructor(readonly setName: string) {
    super(`An alert set named "${setName}" already exists`);
  }
}

export class AlertSetActivationBlockedError extends Error {
  constructor(readonly setId: string, readonly impact: AlertSetActivationImpact) {
    super(`Alert set "${setId}" has activation blockers`);
  }
}

export class AlertSetActivationConfirmationRequiredError extends Error {
  constructor(readonly setId: string, readonly impact: AlertSetActivationImpact) {
    super(`Alert set "${setId}" activation requires warning confirmation`);
  }
}

export class AlertSetDeleteBlockedError extends Error {
  constructor(readonly setId: string, readonly reason: "active" | "only-set") {
    super(reason === "active" ? "Activate another alert set before deleting this one" : "At least one alert set must remain");
  }
}

function defaultSetMetadata(setId: string): AlertSetMetadata {
  return {
    setId,
    starter: false,
    starterReviewState: "complete",
    landscapeEnabled: true,
    landscapeReviewState: "ready",
    verticalEnabled: false,
    verticalReviewState: "needs-review"
  };
}

function starterRuleInput(
  setId: string,
  definition: (typeof alertStarterTemplates)[number],
  name: string = definition.defaultName
): Parameters<ManagedAlertService["createRule"]>[0] {
  return {
    name,
    eventType: definition.eventType,
    enabled: false,
    collectionIds: [setId],
    conditions: [],
    variants: [
      {
        name: "Default",
        enabled: false,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: definition.text,
        ttsConfig: null,
        durationMs: 5_000,
        layout: { x: 640, y: 760, width: 640, height: 180, zIndex: 10 }
      }
    ],
    cooldownSeconds: 0,
    priority: 0
  };
}

function validationIssue(input: {
  readonly id: string;
  readonly severity: "blocker" | "warning";
  readonly code: string;
  readonly message: string;
  readonly nextStep: string;
  readonly targetProfileId?: TargetProfileId | undefined;
  readonly providerKind?: ProviderKind | undefined;
  readonly eventType?: StreamEventType | undefined;
  readonly alertId?: string | undefined;
}): AlertValidationIssue {
  return {
    id: input.id,
    severity: input.severity,
    code: input.code,
    message: input.message,
    nextStep: input.nextStep,
    targetProfileId: input.targetProfileId ?? null,
    providerKind: input.providerKind ?? null,
    eventType: input.eventType ?? null,
    alertId: input.alertId ?? null,
    referenceId: null
  };
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function omitId<T extends { readonly id: string }>(value: T): Omit<T, "id"> {
  const { id, ...rest } = value;
  void id;
  return rest;
}
