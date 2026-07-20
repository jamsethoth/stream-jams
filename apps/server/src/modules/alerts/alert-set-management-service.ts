import {
  alertCreateInputSchema,
  alertCollectionSchema,
  alertRuleSchema,
  alertVariantSchema,
  alertVariationCreateInputSchema,
  alertSetActivationImpactSchema,
  alertSetActivationResultSchema,
  alertSetDetailSchema,
  alertSetMutationInputSchema,
  alertSetOverviewSchema,
  alertStarterTemplates,
  evaluateAlertSetActivation,
  type AlertBrowserSourceView,
  type AlertCollection,
  type AlertConfigurationIdKind,
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
import type { AlertAggregateMutationStore } from "./alert-aggregate-mutation-store.js";
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
  findSets(setIds: readonly string[]): Promise<ReadonlyMap<string, AlertSetMetadata>>;
  saveSet(metadata: AlertSetMetadata): Promise<AlertSetMetadata>;
  deleteSet(setId: string): Promise<void>;
  findRule(ruleId: string): Promise<AlertRuleManagementMetadata | null>;
  findRules(ruleIds: readonly string[]): Promise<ReadonlyMap<string, AlertRuleManagementMetadata>>;
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
  readonly generateId: (kind: AlertConfigurationIdKind) => string;
  readonly mutationStore: AlertAggregateMutationStore;
  readonly listBrowserSources: () => Promise<readonly AlertBrowserSourceView[]>;
}

const starterAlertEventTypes: readonly StreamEventType[] = ["follow", "raid", "subscription", "channel_point_redemption"];
const starterAlerts = alertStarterTemplates.filter((template) => starterAlertEventTypes.includes(template.eventType));

export class AlertSetManagementService {
  readonly #alertService: ManagedAlertService;
  readonly #metadataRepository: AlertSetMetadataRepository;
  readonly #documents: AlertEditorDocumentRepository;
  readonly #getEditorDocument: (editorId: string) => Promise<AlertEditorDocument>;
  readonly #generateId: (kind: AlertConfigurationIdKind) => string;
  readonly #mutationStore: AlertAggregateMutationStore;
  readonly #listBrowserSources: () => Promise<readonly AlertBrowserSourceView[]>;

  constructor(options: AlertSetManagementServiceOptions) {
    this.#alertService = options.alertService;
    this.#metadataRepository = options.metadataRepository;
    this.#documents = options.documents;
    this.#getEditorDocument = options.getEditorDocument;
    this.#generateId = options.generateId;
    this.#mutationStore = options.mutationStore;
    this.#listBrowserSources = options.listBrowserSources;
  }

  async listSets(): Promise<readonly AlertSetOverview[]> {
    await this.#ensureStarterSet();
    const collections = await this.#alertService.listCollections();
    const rules = await this.#alertService.listRules();
    const browserSources = await this.#listBrowserSources();
    const metadata = await this.#setMetadataByIds(collections.map((collection) => collection.id));
    return collections.map((collection) =>
      this.#toOverview(collection, metadata.get(collection.id)!, rules, browserSources)
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
    const metadata = await this.#ruleMetadataByIds(rules.map((rule) => rule.id));
    const documents = await this.#documents.findMany(rules.flatMap((rule) => [
      rule.id,
      ...rule.variants.slice(1).map((variant) => variant.id)
    ]));
    return alertSetDetailSchema.parse({
      overview,
      inventory: rules.flatMap((rule) =>
        this.#mapInventoryRows(setId, rule, metadata.get(rule.id)!, documents)
      ),
      browserSources
    });
  }

  async createSet(input: AlertSetMutationInput): Promise<AlertSetOverview> {
    const parsed = alertSetMutationInputSchema.parse(input);
    await this.#assertUniqueName(parsed.name);
    const created = alertCollectionSchema.parse({
      id: this.#generateId("collection"),
      name: parsed.name,
      enabled: false
    });
    this.#mutationStore.commit({
      missingCollectionIds: [created.id],
      saveCollections: [created],
      saveSetMetadata: [defaultSetMetadata(created.id)]
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
    const created = this.#materializeRule(starterRuleInput(setId, template, parsed.name));
    const metadata = {
      ruleId: created.id,
      providerKind: "twitch" as const,
      reviewState: "needs-review" as const,
      targetProfileIds: ["landscape", "vertical"] as const
    };
    this.#mutationStore.commit({
      expectedCollections: [await this.#findCollection(setId)],
      missingRuleIds: [created.id],
      saveRules: [created],
      saveRuleMetadata: [metadata],
      saveDocuments: [createAlertEditorDocumentFromRule(created, 0, metadata)]
    });
    return (await this.#toInventoryRows(setId, created))[0]!;
  }

  async createAlertVariation(alertId: string, input: AlertVariationCreateInput): Promise<AlertInventoryRow> {
    const parsed = alertVariationCreateInputSchema.parse(input);
    const resolved = await this.#resolveManagedAlert(alertId);
    this.#assertUniqueVariationName(resolved.rule, parsed.name);
    const defaultVariant = resolved.rule.variants[0]!;
    const sourceDocument = await this.#getEditorDocument(resolved.rule.id);
    const variant = alertVariantSchema.parse({
      id: this.#generateId("variant"),
      ...omitId(defaultVariant),
      name: parsed.name,
      enabled: false,
      conditions: [],
      weight: 1,
      priority: undefined
    });
    const updatedRule = alertRuleSchema.parse({
      ...resolved.rule,
      variants: [...resolved.rule.variants, variant]
    });
    this.#mutationStore.commit({
      expectedRules: [resolved.rule],
      saveRules: [updatedRule],
      saveDocuments: [copyEditorDocument(sourceDocument, {
        id: variant.id,
        parentAlertId: updatedRule.id,
        kind: "variation",
        name: variant.name,
        enabled: false,
        variantConditions: [],
        weight: 1,
        priority: null
      })]
    });
    return (await this.#toInventoryRows(updatedRule.collectionIds[0]!, updatedRule))
      .find((row) => row.id === variant.id)!;
  }

  async duplicateManagedAlert(alertId: string): Promise<AlertInventoryRow> {
    const resolved = await this.#resolveManagedAlert(alertId);
    const setId = resolved.rule.collectionIds[0];
    if (setId === undefined) throw new AlertRuleForSetNotFoundError(alertId);

    if (resolved.kind === "variation") {
      const sourceDocument = await this.#getEditorDocument(resolved.editorId);
      const copyName = this.#nextVariationName(resolved.rule, `${resolved.variant.name} copy`);
      const variant = alertVariantSchema.parse({
        id: this.#generateId("variant"),
        ...omitId(resolved.variant),
        name: copyName,
        enabled: false
      });
      const updatedRule = alertRuleSchema.parse({
        ...resolved.rule,
        variants: [...resolved.rule.variants, variant]
      });
      this.#mutationStore.commit({
        expectedRules: [resolved.rule],
        saveRules: [updatedRule],
        saveDocuments: [copyEditorDocument(sourceDocument, {
          id: variant.id,
          parentAlertId: updatedRule.id,
          kind: "variation",
          name: variant.name,
          enabled: false
        })]
      });
      return (await this.#toInventoryRows(setId, updatedRule)).find((row) => row.id === variant.id)!;
    }

    const sourceDocuments = await Promise.all(resolved.rule.variants.map((_, index) =>
      this.#getEditorDocument(index === 0 ? resolved.rule.id : resolved.rule.variants[index]!.id)
    ));
    const sourceMetadata = await this.#ruleMetadata(resolved.rule.id);
    const createdRule = this.#materializeRule({
      ...omitId(resolved.rule),
      name: `${resolved.rule.name} copy`,
      enabled: false,
      variants: resolved.rule.variants.map((variant) => ({ ...omitId(variant), enabled: false }))
    });
    const documents = sourceDocuments.map((document, index) => {
      const variant = createdRule.variants[index]!;
      return copyEditorDocument(document, {
          id: index === 0 ? createdRule.id : variant.id,
          parentAlertId: index === 0 ? null : createdRule.id,
          kind: index === 0 ? "default" : "variation",
          name: index === 0 ? createdRule.name : variant.name,
          enabled: false
      });
    });
    this.#mutationStore.commit({
      expectedCollections: [await this.#findCollection(setId)],
      missingRuleIds: [createdRule.id],
      saveRules: [createdRule],
      saveRuleMetadata: [{ ...sourceMetadata, ruleId: createdRule.id, reviewState: "needs-review" }],
      saveDocuments: documents
    });
    return (await this.#toInventoryRows(setId, createdRule))[0]!;
  }

  async resetManagedAlert(alertId: string, confirmLiveImpact: boolean): Promise<AlertInventoryRow> {
    const resolved = await this.#resolveManagedAlert(alertId);
    await this.#requireLiveImpactConfirmation(resolved, confirmLiveImpact);
    const metadata = await this.#ruleMetadata(resolved.rule.id);
    const setId = resolved.rule.collectionIds[0]!;
    let updatedRule: AlertRule;
    let document: AlertEditorDocument;
    let updatedMetadata: AlertRuleManagementMetadata | undefined;
    if (resolved.kind === "variation") {
      const sourceDocument = await this.#getEditorDocument(resolved.rule.id);
      const defaultVariant = resolved.rule.variants[0]!;
      const resetVariant = alertVariantSchema.parse({
        ...defaultVariant,
        id: resolved.variant.id,
        name: resolved.variant.name,
        enabled: false,
        conditions: [],
        weight: 1,
        priority: undefined
      });
      const variants = resolved.rule.variants.map((variant, index) =>
        index === resolved.variantIndex ? resetVariant : variant
      );
      updatedRule = alertRuleSchema.parse({
        ...resolved.rule,
        enabled: variants.some((variant) => variant.enabled),
        variants
      });
      document = copyEditorDocument(sourceDocument, {
          id: resolved.variant.id,
          parentAlertId: resolved.rule.id,
          kind: "variation",
          name: resolved.variant.name,
          enabled: false,
          variantConditions: [],
          weight: 1,
          priority: null
      });
    } else {
      const template = alertStarterTemplates.find((candidate) => candidate.eventType === resolved.rule.eventType)!;
      const starter = starterRuleInput(setId, template, resolved.rule.name);
      const resetVariant = { ...starter.variants[0]!, id: resolved.variant.id };
      updatedRule = alertRuleSchema.parse({
        id: resolved.rule.id,
        ...starter,
        name: resolved.rule.name,
        variants: [resetVariant, ...resolved.rule.variants.slice(1)],
        enabled: resolved.rule.variants.slice(1).some((variant) => variant.enabled)
      });
      updatedMetadata = { ...metadata, reviewState: "needs-review" };
      document = createAlertEditorDocumentFromRule(updatedRule, 0, {
        ...metadata,
        reviewState: "needs-review"
      });
    }
    this.#mutationStore.commit({
      expectedRules: [resolved.rule],
      saveRules: [updatedRule],
      ...(updatedMetadata === undefined ? {} : { saveRuleMetadata: [updatedMetadata] }),
      saveDocuments: [document]
    });
    return (await this.#toInventoryRows(setId, updatedRule)).find((row) => row.id === alertId)!;
  }

  async deleteManagedAlert(alertId: string, confirmLiveImpact: boolean): Promise<void> {
    const resolved = await this.#resolveManagedAlert(alertId);
    await this.#requireLiveImpactConfirmation(resolved, confirmLiveImpact, resolved.kind === "default");
    if (resolved.kind === "default") {
      this.#mutationStore.commit({
        expectedRules: [resolved.rule],
        deleteDocumentIds: [resolved.rule.id, ...resolved.rule.variants.slice(1).map((variant) => variant.id)],
        deleteRuleMetadataIds: [resolved.rule.id],
        deleteRuleIds: [resolved.rule.id]
      });
      return;
    }
    const variants = resolved.rule.variants.filter((variant) => variant.id !== resolved.variant.id);
    const updatedRule = alertRuleSchema.parse({
      ...resolved.rule,
      enabled: variants.some((variant) => variant.enabled),
      variants
    });
    this.#mutationStore.commit({
      expectedRules: [resolved.rule],
      saveRules: [updatedRule],
      deleteDocumentIds: [resolved.variant.id]
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
    const sourceMetadata = await Promise.all(sourceRules.map((rule) => this.#ruleMetadata(rule.id)));
    const duplicate = alertCollectionSchema.parse({
      id: this.#generateId("collection"),
      name: parsed.name,
      enabled: false
    });
    const createdRules = sourceRules.map((sourceRule) => this.#materializeRule({
          ...omitId(sourceRule),
          name: sourceRule.name,
          enabled: false,
          collectionIds: [duplicate.id],
          variants: sourceRule.variants.map((variant) => ({ ...omitId(variant), enabled: false }))
    }));
    const createdMetadata = createdRules.map((created, index) => ({
          ...sourceMetadata[index]!,
          ruleId: created.id,
          reviewState: "needs-review" as const
    }));
    const createdDocuments = createdRules.flatMap((created, ruleIndex) =>
      sourceDocuments[ruleIndex]!.map((sourceDocument, variantIndex) => {
          const variant = created.variants[variantIndex]!;
          return copyEditorDocument(sourceDocument, {
            id: variantIndex === 0 ? created.id : variant.id,
            setId: duplicate.id,
            parentAlertId: variantIndex === 0 ? null : created.id,
            kind: variantIndex === 0 ? "default" : "variation",
            name: variantIndex === 0 ? created.name : variant.name,
            enabled: false
          });
      })
    );
    this.#mutationStore.commit({
      expectedCollections: [await this.#findCollection(setId)],
      expectedRules: sourceRules,
      missingCollectionIds: [duplicate.id],
      missingRuleIds: createdRules.map((rule) => rule.id),
      saveCollections: [duplicate],
      saveSetMetadata: [{
        ...defaultSetMetadata(duplicate.id),
        landscapeReviewState: "needs-review",
        verticalReviewState: "needs-review"
      }],
      saveRules: createdRules,
      saveRuleMetadata: createdMetadata,
      saveDocuments: createdDocuments
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
    const updatedRule = alertRuleSchema.parse({
      ...resolved.rule,
      enabled: variants.some((variant) => variant.enabled),
      variants
    });
    this.#mutationStore.commit({
      expectedRules: [resolved.rule],
      saveRules: [updatedRule],
      saveDocuments: [{ ...document, enabled }],
      ...(enabled && metadata.reviewState === "needs-review"
        ? { saveRuleMetadata: [{ ...metadata, reviewState: "ready" as const }] }
        : {})
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

    const rules = (await this.#alertService.listRules()).filter((rule) => rule.collectionIds.includes(setId));
    const deletedRules = rules.filter((rule) => rule.collectionIds.length === 1);
    const updatedRules = rules
      .filter((rule) => rule.collectionIds.length > 1)
      .map((rule) => alertRuleSchema.parse({
        ...rule,
        collectionIds: rule.collectionIds.filter((collectionId) => collectionId !== setId)
      }));
    this.#mutationStore.commit({
      expectedCollections: [selected],
      expectedRules: rules,
      saveRules: updatedRules,
      deleteDocumentIds: deletedRules.flatMap((rule) => [
        rule.id,
        ...rule.variants.slice(1).map((variant) => variant.id)
      ]),
      deleteRuleMetadataIds: deletedRules.map((rule) => rule.id),
      deleteRuleIds: deletedRules.map((rule) => rule.id),
      deleteSetMetadataIds: [setId],
      deleteCollectionIds: [setId]
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

  #toOverview(
    collection: AlertCollection,
    metadata: AlertSetMetadata,
    allRules: readonly AlertRule[],
    browserSources: readonly AlertBrowserSourceView[]
  ): AlertSetOverview {
    const rules = allRules.filter((rule) => rule.collectionIds.includes(collection.id));
    const enabledRules = rules.filter((rule) => rule.enabled);
    const issues: AlertValidationIssue[] = [];
    if (enabledRules.length === 0) {
      issues.push(validationIssue({
        id: `${collection.id}:no-enabled-alerts`,
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
    const documents = await this.#documents.findMany([
      rule.id,
      ...rule.variants.slice(1).map((variant) => variant.id)
    ]);
    return this.#mapInventoryRows(setId, rule, metadata, documents);
  }

  #mapInventoryRows(
    setId: string,
    rule: AlertRule,
    metadata: AlertRuleManagementMetadata,
    documents: ReadonlyMap<string, AlertEditorDocument>
  ): readonly AlertInventoryRow[] {
    return rule.variants.map((variant, index) => {
      const editorId = index === 0 ? rule.id : variant.id;
      const document = documents.get(editorId);
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
    });
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

  #materializeRule(input: Parameters<ManagedAlertService["createRule"]>[0]): AlertRule {
    return alertRuleSchema.parse({
      ...input,
      id: this.#generateId("rule"),
      collectionIds: Array.from(new Set(input.collectionIds)),
      variants: input.variants.map((variant) => alertVariantSchema.parse({
        ...variant,
        id: this.#generateId("variant")
      }))
    });
  }

  async #setMetadata(setId: string): Promise<AlertSetMetadata> {
    const existing = await this.#metadataRepository.findSet(setId);
    if (existing !== null) {
      return existing;
    }
    return this.#metadataRepository.saveSet(defaultSetMetadata(setId));
  }

  async #setMetadataByIds(setIds: readonly string[]): Promise<ReadonlyMap<string, AlertSetMetadata>> {
    const metadata = new Map(await this.#metadataRepository.findSets(setIds));
    for (const setId of setIds) {
      if (!metadata.has(setId)) {
        metadata.set(setId, await this.#metadataRepository.saveSet(defaultSetMetadata(setId)));
      }
    }
    return metadata;
  }

  async #ruleMetadata(ruleId: string): Promise<AlertRuleManagementMetadata> {
    const existing = await this.#metadataRepository.findRule(ruleId);
    if (existing !== null) {
      return existing;
    }
    return this.#metadataRepository.saveRule(defaultRuleMetadata(ruleId));
  }

  async #ruleMetadataByIds(ruleIds: readonly string[]): Promise<ReadonlyMap<string, AlertRuleManagementMetadata>> {
    const metadata = new Map(await this.#metadataRepository.findRules(ruleIds));
    for (const ruleId of ruleIds) {
      if (!metadata.has(ruleId)) {
        metadata.set(ruleId, await this.#metadataRepository.saveRule(defaultRuleMetadata(ruleId)));
      }
    }
    return metadata;
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

function defaultRuleMetadata(ruleId: string): AlertRuleManagementMetadata {
  return {
    ruleId,
    providerKind: "twitch",
    reviewState: "ready",
    targetProfileIds: ["landscape", "vertical"]
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
    targetProfiles: source.targetProfiles.map((profile) => ({ ...profile, enabled: false, reviewState: "needs-review" }))
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
