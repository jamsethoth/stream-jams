import {
  alertCreateInputSchema,
  alertVariationCreateInputSchema,
  alertSetActivationImpactSchema,
  alertSetActivationResultSchema,
  alertSetDetailSchema,
  alertSetMutationInputSchema,
  alertSetOverviewSchema,
  alertStarterTemplates,
  evaluateAlertSetActivation,
  type AlertBrowserSourceView,
  type AlertCreateInput,
  type AlertEditorDocument,
  type AlertInventoryRow,
  type AlertRule,
  type AlertService,
  type AlertSetActivationImpact,
  type AlertSetActivationResult,
  type AlertSetDetail,
  type AlertSetMutationInput,
  type AlertSetOverview,
  type AlertVariationCreateInput,
  type AlertValidationIssue,
  type ProviderKind,
  type StreamEventType,
  type TargetProfileId
} from "@stream-jams/core";
import {
  createAlertEditorDocumentFromRule,
  type AlertEditorDocumentRepository
} from "./alert-editor-service.js";

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
  | "createVariant"
  | "saveVariant"
  | "deleteVariant"
>;

export interface AlertSetManagementServiceOptions {
  readonly alertService: ManagedAlertService;
  readonly metadataRepository: AlertSetMetadataRepository;
  readonly documents: AlertEditorDocumentRepository;
  readonly getEditorDocument: (editorId: string) => Promise<AlertEditorDocument>;
  readonly runAtomically?: <T>(work: () => Promise<T>) => Promise<T>;
  readonly listBrowserSources: () => Promise<readonly AlertBrowserSourceView[]>;
}

const starterAlertEventTypes: readonly StreamEventType[] = ["follow", "raid", "subscription", "channel_point_redemption"];
const starterAlerts = alertStarterTemplates.filter((template) => starterAlertEventTypes.includes(template.eventType));

export class AlertSetManagementService {
  readonly #alertService: ManagedAlertService;
  readonly #metadataRepository: AlertSetMetadataRepository;
  readonly #documents: AlertEditorDocumentRepository;
  readonly #getEditorDocument: (editorId: string) => Promise<AlertEditorDocument>;
  readonly #runAtomically: <T>(work: () => Promise<T>) => Promise<T>;
  readonly #listBrowserSources: () => Promise<readonly AlertBrowserSourceView[]>;

  constructor(options: AlertSetManagementServiceOptions) {
    this.#alertService = options.alertService;
    this.#metadataRepository = options.metadataRepository;
    this.#documents = options.documents;
    this.#getEditorDocument = options.getEditorDocument;
    this.#runAtomically = options.runAtomically ?? (async (work) => work());
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
      inventory: (await Promise.all(rules.map((rule) => this.#toInventoryRows(setId, rule)))).flat(),
      browserSources
    });
  }

  async createSet(input: AlertSetMutationInput): Promise<AlertSetOverview> {
    const parsed = alertSetMutationInputSchema.parse(input);
    await this.#assertUniqueName(parsed.name);
    const created = await this.#runAtomically(async () => {
      const collection = await this.#alertService.createCollection({ name: parsed.name, enabled: false });
      await this.#metadataRepository.saveSet(defaultSetMetadata(collection.id));
      return collection;
    });
    return (await this.getSet(created.id)).overview;
  }

  async createAlert(setId: string, input: AlertCreateInput): Promise<AlertInventoryRow> {
    const parsed = alertCreateInputSchema.parse(input);
    await this.#findCollection(setId);
    const template = alertStarterTemplates.find((candidate) => candidate.eventType === parsed.eventType);
    if (template === undefined) {
      throw new Error(`No starter alert template exists for ${parsed.eventType}`);
    }
    const created = await this.#runAtomically(async () => {
      const rule = await this.#alertService.createRule(starterRuleInput(setId, template, parsed.name));
      const metadata = {
        ruleId: rule.id,
        providerKind: "twitch" as const,
        reviewState: "needs-review" as const,
        targetProfileIds: ["landscape", "vertical"] as const
      };
      await this.#metadataRepository.saveRule(metadata);
      await this.#documents.save(createAlertEditorDocumentFromRule(rule, 0, metadata));
      return rule;
    });
    return (await this.#toInventoryRows(setId, created))[0]!;
  }

  async createAlertVariation(alertId: string, input: AlertVariationCreateInput): Promise<AlertInventoryRow> {
    const parsed = alertVariationCreateInputSchema.parse(input);
    const resolved = await this.#resolveManagedAlert(alertId);
    this.#assertUniqueVariationName(resolved.rule, parsed.name);
    const defaultVariant = resolved.rule.variants[0]!;
    const sourceDocument = await this.#getEditorDocument(resolved.rule.id);
    const created = await this.#runAtomically(async () => {
      const updatedRule = await this.#alertService.createVariant(resolved.rule.id, {
        ...omitId(defaultVariant),
        name: parsed.name,
        enabled: false,
        conditions: [],
        weight: 1,
        priority: undefined
      });
      const variant = updatedRule.variants.at(-1)!;
      await this.#documents.save(copyEditorDocument(sourceDocument, {
        id: variant.id,
        parentAlertId: updatedRule.id,
        kind: "variation",
        name: variant.name,
        enabled: false,
        variantConditions: [],
        weight: 1,
        priority: null
      }));
      return { rule: updatedRule, variantId: variant.id };
    });
    return (await this.#toInventoryRows(created.rule.collectionIds[0]!, created.rule))
      .find((row) => row.id === created.variantId)!;
  }

  async duplicateManagedAlert(alertId: string): Promise<AlertInventoryRow> {
    const resolved = await this.#resolveManagedAlert(alertId);
    const setId = resolved.rule.collectionIds[0];
    if (setId === undefined) throw new AlertRuleForSetNotFoundError(alertId);

    if (resolved.kind === "variation") {
      const sourceDocument = await this.#getEditorDocument(resolved.editorId);
      const copyName = this.#nextVariationName(resolved.rule, `${resolved.variant.name} copy`);
      const created = await this.#runAtomically(async () => {
        const updatedRule = await this.#alertService.createVariant(resolved.rule.id, {
          ...omitId(resolved.variant),
          name: copyName,
          enabled: false
        });
        const variant = updatedRule.variants.at(-1)!;
        await this.#documents.save(copyEditorDocument(sourceDocument, {
          id: variant.id,
          parentAlertId: updatedRule.id,
          kind: "variation",
          name: variant.name,
          enabled: false
        }));
        return { rule: updatedRule, variantId: variant.id };
      });
      return (await this.#toInventoryRows(setId, created.rule)).find((row) => row.id === created.variantId)!;
    }

    const sourceDocuments = await Promise.all(resolved.rule.variants.map((_, index) =>
      this.#getEditorDocument(index === 0 ? resolved.rule.id : resolved.rule.variants[index]!.id)
    ));
    const createdRule = await this.#runAtomically(async () => {
      const created = await this.#alertService.createRule({
        ...omitId(resolved.rule),
        name: `${resolved.rule.name} copy`,
        enabled: false,
        variants: resolved.rule.variants.map((variant) => ({ ...omitId(variant), enabled: false }))
      });
      const sourceMetadata = await this.#ruleMetadata(resolved.rule.id);
      await this.#metadataRepository.saveRule({ ...sourceMetadata, ruleId: created.id, reviewState: "needs-review" });
      for (const [index, document] of sourceDocuments.entries()) {
        const variant = created.variants[index]!;
        await this.#documents.save(copyEditorDocument(document, {
          id: index === 0 ? created.id : variant.id,
          parentAlertId: index === 0 ? null : created.id,
          kind: index === 0 ? "default" : "variation",
          name: index === 0 ? created.name : variant.name,
          enabled: false
        }));
      }
      return created;
    });
    return (await this.#toInventoryRows(setId, createdRule))[0]!;
  }

  async resetManagedAlert(alertId: string, confirmLiveImpact: boolean): Promise<AlertInventoryRow> {
    const resolved = await this.#resolveManagedAlert(alertId);
    await this.#requireLiveImpactConfirmation(resolved, confirmLiveImpact);
    const metadata = await this.#ruleMetadata(resolved.rule.id);
    const setId = resolved.rule.collectionIds[0]!;
    const updatedRule = await this.#runAtomically(async () => {
      if (resolved.kind === "variation") {
        const sourceDocument = await this.#getEditorDocument(resolved.rule.id);
        const defaultVariant = resolved.rule.variants[0]!;
        const updated = await this.#alertService.saveVariant(resolved.rule.id, {
          ...defaultVariant,
          id: resolved.variant.id,
          name: resolved.variant.name,
          enabled: false,
          conditions: [],
          weight: 1,
          priority: undefined
        });
        await this.#documents.save(copyEditorDocument(sourceDocument, {
          id: resolved.variant.id,
          parentAlertId: resolved.rule.id,
          kind: "variation",
          name: resolved.variant.name,
          enabled: false,
          variantConditions: [],
          weight: 1,
          priority: null
        }));
        return this.#deriveRuleEnabled(updated);
      }

      const template = alertStarterTemplates.find((candidate) => candidate.eventType === resolved.rule.eventType)!;
      const starter = starterRuleInput(setId, template, resolved.rule.name);
      const resetVariant = { ...starter.variants[0]!, id: resolved.variant.id };
      const updated = await this.#alertService.updateRule(resolved.rule.id, {
        ...starter,
        name: resolved.rule.name,
        variants: [resetVariant, ...resolved.rule.variants.slice(1)],
        enabled: resolved.rule.variants.slice(1).some((variant) => variant.enabled)
      });
      await this.#metadataRepository.saveRule({ ...metadata, reviewState: "needs-review" });
      await this.#documents.save(createAlertEditorDocumentFromRule(updated, 0, {
        ...metadata,
        reviewState: "needs-review"
      }));
      return updated;
    });
    return (await this.#toInventoryRows(setId, updatedRule)).find((row) => row.id === alertId)!;
  }

  async deleteManagedAlert(alertId: string, confirmLiveImpact: boolean): Promise<void> {
    const resolved = await this.#resolveManagedAlert(alertId);
    await this.#requireLiveImpactConfirmation(resolved, confirmLiveImpact, resolved.kind === "default");
    await this.#runAtomically(async () => {
      if (resolved.kind === "default") {
        for (const editorId of [resolved.rule.id, ...resolved.rule.variants.slice(1).map((variant) => variant.id)]) {
          await this.#documents.delete(editorId);
        }
        await this.#alertService.deleteRule(resolved.rule.id);
        await this.#metadataRepository.deleteRule(resolved.rule.id);
        return;
      }
      const updated = await this.#alertService.deleteVariant(resolved.rule.id, resolved.variant.id);
      await this.#alertService.updateRule(updated.id, {
        ...omitId(updated),
        enabled: updated.variants.some((variant) => variant.enabled)
      });
      await this.#documents.delete(resolved.variant.id);
    });
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
    const sourceRules = (await this.#alertService.listRules()).filter((rule) => rule.collectionIds.includes(setId));
    const sourceDocuments = await Promise.all(sourceRules.map((rule) => Promise.all(rule.variants.map((variant, index) =>
      this.#getEditorDocument(index === 0 ? rule.id : variant.id)
    ))));
    const duplicate = await this.#runAtomically(async () => {
      const collection = await this.#alertService.createCollection({ name: parsed.name, enabled: false });
      await this.#metadataRepository.saveSet({
        ...defaultSetMetadata(collection.id),
        landscapeReviewState: "needs-review",
        verticalReviewState: "needs-review"
      });
      for (const [ruleIndex, sourceRule] of sourceRules.entries()) {
        const created = await this.#alertService.createRule({
          ...omitId(sourceRule),
          name: sourceRule.name,
          enabled: false,
          collectionIds: [collection.id],
          variants: sourceRule.variants.map((variant) => ({ ...omitId(variant), enabled: false }))
        });
        const sourceMetadata = await this.#ruleMetadata(sourceRule.id);
        await this.#metadataRepository.saveRule({
          ...sourceMetadata,
          ruleId: created.id,
          reviewState: "needs-review"
        });
        for (const [variantIndex, sourceDocument] of sourceDocuments[ruleIndex]!.entries()) {
          const variant = created.variants[variantIndex]!;
          await this.#documents.save(copyEditorDocument(sourceDocument, {
            id: variantIndex === 0 ? created.id : variant.id,
            setId: collection.id,
            parentAlertId: variantIndex === 0 ? null : created.id,
            kind: variantIndex === 0 ? "default" : "variation",
            name: variantIndex === 0 ? created.name : variant.name,
            enabled: false
          }));
        }
      }
      return collection;
    });

    return (await this.getSet(duplicate.id)).overview;
  }

  async markStarterReviewComplete(setId: string): Promise<AlertSetOverview> {
    await this.#findCollection(setId);
    const metadata = await this.#setMetadata(setId);
    await this.#metadataRepository.saveSet({ ...metadata, starterReviewState: "complete" });
    return (await this.getSet(setId)).overview;
  }

  async setAlertEnabled(ruleId: string, enabled: boolean): Promise<AlertSetDetail> {
    const resolved = await this.#resolveManagedAlert(ruleId);
    const document = await this.#getEditorDocument(resolved.editorId);
    const metadata = await this.#ruleMetadata(resolved.rule.id);
    const variants = resolved.rule.variants.map((variant, index) =>
      index === resolved.variantIndex ? { ...variant, enabled } : variant
    );
    await this.#runAtomically(async () => {
      await this.#alertService.updateRule(resolved.rule.id, {
        ...omitId(resolved.rule),
        enabled: variants.some((variant) => variant.enabled),
        variants
      });
      await this.#documents.save({ ...document, enabled });
      if (enabled && metadata.reviewState === "needs-review") {
        await this.#metadataRepository.saveRule({ ...metadata, reviewState: "ready" });
      }
    });
    const setId = resolved.rule.collectionIds[0];
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

    await this.#runAtomically(async () => {
      const rules = (await this.#alertService.listRules()).filter((rule) => rule.collectionIds.includes(setId));
      for (const rule of rules) {
        if (rule.collectionIds.length === 1) {
          for (const editorId of [rule.id, ...rule.variants.slice(1).map((variant) => variant.id)]) {
            await this.#documents.delete(editorId);
          }
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
    });
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

  async #toInventoryRows(setId: string, rule: AlertRule): Promise<readonly AlertInventoryRow[]> {
    const metadata = await this.#ruleMetadata(rule.id);
    return Promise.all(rule.variants.map(async (variant, index) => {
      const editorId = index === 0 ? rule.id : variant.id;
      const document = await this.#documents.find(editorId);
      const targetProfileIds = document?.targetProfiles.filter((profile) => profile.enabled).map((profile) => profile.id)
        ?? [...metadata.targetProfileIds];
      const reviewState = document?.targetProfiles.some((profile) => profile.reviewState === "needs-review") === true
        ? "needs-review" as const
        : metadata.reviewState;
      return {
        id: editorId,
        parentAlertId: index === 0 ? null : rule.id,
        setId,
        providerKind: metadata.providerKind,
        eventType: rule.eventType,
        name: index === 0 ? rule.name : variant.name,
        kind: index === 0 ? "default" as const : "variation" as const,
        enabled: variant.enabled,
        reviewState,
        targetProfileIds,
        previewText: variant.textTemplate
      };
    }));
  }

  async #resolveManagedAlert(editorId: string): Promise<ManagedAlertResolution> {
    for (const rule of await this.#alertService.listRules()) {
      if (rule.id === editorId) {
        const variant = rule.variants[0];
        if (variant !== undefined) return { rule, variant, variantIndex: 0, editorId, kind: "default" };
      }
      const variantIndex = rule.variants.findIndex((variant, index) => index > 0 && variant.id === editorId);
      if (variantIndex >= 0) {
        return { rule, variant: rule.variants[variantIndex]!, variantIndex, editorId, kind: "variation" };
      }
    }
    throw new AlertRuleForSetNotFoundError(editorId);
  }

  async #requireLiveImpactConfirmation(
    resolved: ManagedAlertResolution,
    confirmed: boolean,
    affectsEntireRule = false
  ): Promise<void> {
    if (confirmed || !(affectsEntireRule ? resolved.rule.enabled : resolved.variant.enabled)) return;
    const activeSetIds = new Set((await this.#alertService.listCollections())
      .filter((collection) => collection.enabled)
      .map((collection) => collection.id));
    if (resolved.rule.collectionIds.some((setId) => activeSetIds.has(setId))) {
      throw new AlertManagedLiveImpactConfirmationRequiredError(resolved.editorId);
    }
  }

  async #deriveRuleEnabled(rule: AlertRule): Promise<AlertRule> {
    const enabled = rule.variants.some((variant) => variant.enabled);
    return enabled === rule.enabled ? rule : this.#alertService.setRuleEnabled(rule.id, enabled);
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

  #assertUniqueVariationName(rule: AlertRule, name: string): void {
    const duplicate = rule.variants.slice(1).some((variant) => namesMatch(variant.name, name));
    if (duplicate) throw new AlertVariationNameConflictError(rule.id, name);
  }

  #nextVariationName(rule: AlertRule, baseName: string): string {
    const existingNames = rule.variants.slice(1).map((variant) => variant.name);
    if (!existingNames.some((name) => namesMatch(name, baseName))) return baseName;
    let suffix = 2;
    while (existingNames.some((name) => namesMatch(name, `${baseName} ${suffix}`))) suffix += 1;
    return `${baseName} ${suffix}`;
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

export class AlertManagedLiveImpactConfirmationRequiredError extends Error {
  readonly code = "ALERT_LIVE_IMPACT_CONFIRMATION_REQUIRED";

  constructor(readonly alertId: string) {
    super(`Changing alert "${alertId}" can affect active live output. Review the impact and confirm before continuing.`);
    this.name = "AlertManagedLiveImpactConfirmationRequiredError";
  }
}

export class AlertSetNameConflictError extends Error {
  constructor(readonly setName: string) {
    super(`An alert set named "${setName}" already exists`);
  }
}

export class AlertVariationNameConflictError extends Error {
  constructor(readonly ruleId: string, readonly variationName: string) {
    super(`An alert variation named "${variationName}" already exists for alert "${ruleId}"`);
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

interface ManagedAlertResolution {
  readonly rule: AlertRule;
  readonly variant: AlertRule["variants"][number];
  readonly variantIndex: number;
  readonly editorId: string;
  readonly kind: "default" | "variation";
}

function copyEditorDocument(
  source: AlertEditorDocument,
  identity: Pick<AlertEditorDocument, "id" | "parentAlertId" | "kind" | "name" | "enabled">
    & Partial<Pick<AlertEditorDocument, "setId">>
    & Partial<Pick<AlertEditorDocument, "variantConditions" | "weight" | "priority">>
): AlertEditorDocument {
  return {
    ...structuredClone(source),
    ...identity,
    targetProfiles: source.targetProfiles.map((profile) => ({ ...profile, reviewState: "needs-review" }))
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

function namesMatch(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function omitId<T extends { readonly id: string }>(value: T): Omit<T, "id"> {
  const { id, ...rest } = value;
  void id;
  return rest;
}
