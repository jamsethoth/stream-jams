import {
  DefaultAlertService,
  DefaultModerationService,
  streamEventTypes,
  type AlertCollection,
  type AlertEditorDocument,
  type AlertRepository,
  type AlertRule
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import {
  AlertSetActivationBlockedError,
  AlertSetDeleteBlockedError,
  AlertVariationNameConflictError,
  AlertManagedLiveImpactConfirmationRequiredError,
  AlertSetManagementService,
  type AlertRuleManagementMetadata,
  type AlertSetMetadata,
  type AlertSetMetadataRepository
} from "./alert-set-management-service.js";
import type {
  AlertAggregateMutation,
  AlertAggregateMutationStore
} from "./alert-aggregate-mutation-store.js";
import {
  AlertEditorService,
  type AlertEditorDocumentRepository
} from "./alert-editor-service.js";

describe("AlertSetManagementService", () => {
  it("auto-creates an active starter set with disabled needs-review alerts", async () => {
    const fixture = createFixture();

    const sets = await fixture.service.listSets();
    const detail = await fixture.service.getSet(sets[0]!.id);

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      name: "Default",
      active: true,
      starter: true,
      starterReviewState: "pending",
      enabledAlertCount: 0
    });
    expect(sets[0]?.validationIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "NO_ENABLED_ALERTS", severity: "blocker" })])
    );
    expect(detail.inventory).toHaveLength(4);
    expect(detail.inventory.map((alert) => alert.eventType)).toEqual([
      "follow", "subscription", "raid", "channel_point_redemption"
    ]);
    expect(detail.inventory.map((alert) => alert.name)).toEqual([
      "New follower", "New subscriber", "New raid", "Custom reward"
    ]);
    expect(detail.inventory.map((alert) => alert.previewText)).toEqual([
      "Thanks for following, {userName}!",
      "Thanks for subscribing, {userName}!",
      "Welcome raiders from {userName}!",
      "{userName} redeemed {rewardTitle}!"
    ]);
    expect(detail.inventory.every((row) => !row.enabled && row.reviewState === "needs-review")).toBe(true);
    expect(detail.browserSources.map((output) => output.targetProfileId)).toEqual(["landscape", "vertical"]);
  });

  it("bulk-loads set metadata, rule metadata, and editor documents for set detail", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const findSets = vi.spyOn(fixture.metadataRepository, "findSets");
    const findRules = vi.spyOn(fixture.metadataRepository, "findRules");
    const findDocuments = vi.spyOn(fixture.documents, "findMany");
    const findRule = vi.spyOn(fixture.metadataRepository, "findRule");
    const findDocument = vi.spyOn(fixture.documents, "find");

    await fixture.service.getSet(starter!.id);

    expect(findSets).toHaveBeenCalledOnce();
    expect(findRules).toHaveBeenCalledOnce();
    expect(findDocuments).toHaveBeenCalledOnce();
    expect(findRule).not.toHaveBeenCalled();
    expect(findDocument).not.toHaveBeenCalled();
  });

  it("marks starter review complete without silently enabling alerts", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();

    const reviewed = await fixture.service.markStarterReviewComplete(starter!.id);
    const detail = await fixture.service.getSet(starter!.id);

    expect(reviewed.starterReviewState).toBe("complete");
    expect(detail.inventory.every((row) => !row.enabled)).toBe(true);
  });

  it("creates a disabled needs-review alert from the canonical event starter template", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();

    const created = await fixture.service.createAlert(starter!.id, {
      eventType: "cheer",
      name: "Big cheer"
    });

    expect(created).toMatchObject({
      setId: starter!.id,
      providerKind: "twitch",
      eventType: "cheer",
      name: "Big cheer",
      kind: "default",
      enabled: false,
      reviewState: "needs-review",
      targetProfileIds: ["landscape", "vertical"],
      previewText: "Thanks for the cheer, {userName}!"
    });
    const persisted = await fixture.service.getSet(starter!.id);
    expect(persisted.inventory).toContainEqual(created);
    await expect(fixture.documents.find(created.id)).resolves.toMatchObject({
      targetProfiles: [
        expect.objectContaining({ id: "landscape", reviewState: "needs-review" }),
        expect.objectContaining({ id: "vertical", reviewState: "needs-review" })
      ]
    });
  });

  it("creates every canonical event without expanding the starter set", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();

    for (const eventType of streamEventTypes) {
      const created = await fixture.service.createAlert(starter!.id, {
        eventType,
        name: `Alert for ${eventType}`
      });
      expect(created).toMatchObject({ eventType, enabled: false, reviewState: "needs-review" });
    }

    expect((await fixture.service.getSet(starter!.id)).inventory).toHaveLength(streamEventTypes.length + 4);
  });

  it("keeps save and activation distinct and atomically replaces the active set", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const duplicate = await fixture.service.duplicateSet(starter!.id, { name: "Winter" });
    const duplicateDetail = await fixture.service.getSet(duplicate.id);
    await fixture.service.setAlertEnabled(duplicateDetail.inventory[0]!.id, true);

    expect((await fixture.service.getSet(duplicate.id)).overview.active).toBe(false);
    const result = await fixture.service.activateSet(duplicate.id, false);

    expect(result.replacedSetId).toBe(starter!.id);
    expect(result.activeSet.id).toBe(duplicate.id);
    expect((await fixture.service.getSet(starter!.id)).overview.active).toBe(false);
  });

  it("copies editor documents with duplicated sets and removes them with the set", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const sourceDetail = await fixture.service.getSet(starter!.id);
    const sourceAlert = sourceDetail.inventory[0]!;
    const editorDocument = await fixture.documents.find(sourceAlert.id)
      ?? await fixture.alertEditorService.getDocument(sourceAlert.id);
    await fixture.documents.save({
      ...editorDocument,
      layers: editorDocument.layers.map((layer) =>
        layer.type === "text" ? { ...layer, template: "Copied set design" } : layer
      )
    });

    const duplicate = await fixture.service.duplicateSet(starter!.id, { name: "Winter" });
    const duplicatedDetail = await fixture.service.getSet(duplicate.id);
    const copiedAlert = duplicatedDetail.inventory.find((row) => row.eventType === sourceAlert.eventType)!;

    await expect(fixture.documents.find(copiedAlert.id)).resolves.toMatchObject({
      id: copiedAlert.id,
      setId: duplicate.id,
      enabled: false,
      layers: [expect.objectContaining({ type: "text", template: "Copied set design" })],
      targetProfiles: expect.arrayContaining([expect.objectContaining({ reviewState: "needs-review" })])
    });

    await fixture.service.deleteSet(duplicate.id);
    await expect(fixture.documents.find(copiedAlert.id)).resolves.toBeNull();
  });

  it("blocks activation when a set has no enabled alerts", async () => {
    const fixture = createFixture();
    const invalid = await fixture.service.createSet({ name: "Empty" });

    await expect(fixture.service.activateSet(invalid.id, false)).rejects.toBeInstanceOf(AlertSetActivationBlockedError);
  });

  it("keeps canonical alerts compatible when Streamer.bot is the active event source", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();

    const starterDetail = await fixture.service.getSet(starter!.id);
    await fixture.service.setAlertEnabled(starterDetail.inventory[0]!.id, true);
    const seasonal = await fixture.service.duplicateSet(starter!.id, { name: "Seasonal" });
    const seasonalDetail = await fixture.service.getSet(seasonal.id);
    await fixture.service.setAlertEnabled(seasonalDetail.inventory[0]!.id, true);

    expect((await fixture.service.getSet(seasonal.id)).overview.validationIssues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "PROVIDER_KIND_MISMATCH" })])
    );
    await expect(fixture.service.activateSet(seasonal.id, false)).resolves.toMatchObject({
      activeSet: { id: seasonal.id }
    });
  });

  it("blocks deleting the active set or the only remaining set", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();

    await expect(fixture.service.deleteSet(starter!.id)).rejects.toBeInstanceOf(AlertSetDeleteBlockedError);

    const spare = await fixture.service.createSet({ name: "Spare" });
    await expect(fixture.service.deleteSet(starter!.id)).rejects.toBeInstanceOf(AlertSetDeleteBlockedError);
    await expect(fixture.service.deleteSet(spare.id)).resolves.toBeUndefined();
  });

  it("creates variations from the default and flattens them beneath it", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const initial = await fixture.service.getSet(starter!.id);
    const defaultAlert = initial.inventory[0]!;

    const variation = await fixture.service.createAlertVariation(defaultAlert.id, { name: "VIP follower" });
    const rule = (await fixture.alertRepository.listRules()).find((candidate) => candidate.id === defaultAlert.id)!;
    await fixture.alertRepository.saveRule({
      ...rule,
      conditions: [{ field: "actor.isFollower", operator: "equals", value: true }],
      variants: rule.variants.map((candidate) => candidate.id === variation.id
        ? {
            ...candidate,
            conditions: [{ field: "actor.displayName", operator: "includes", value: "VIP" }],
            weight: 4,
            priority: 7
          }
        : candidate)
    });
    const detail = await fixture.service.getSet(starter!.id);

    expect(variation).toMatchObject({
      parentAlertId: defaultAlert.id,
      kind: "variation",
      name: "VIP follower",
      enabled: false,
      reviewState: "needs-review"
    });
    const eventRows = detail.inventory.filter((row) => row.id === defaultAlert.id || row.parentAlertId === defaultAlert.id);
    expect(eventRows.map((row) => ({ id: row.id, parentAlertId: row.parentAlertId, kind: row.kind }))).toEqual([
      { id: defaultAlert.id, parentAlertId: null, kind: "default" },
      { id: variation.id, parentAlertId: defaultAlert.id, kind: "variation" }
    ]);
    expect(eventRows[0]).toMatchObject({
      conditions: [{ field: "actor.isFollower", operator: "equals", value: true }],
      weight: 1,
      priority: null
    });
    expect(eventRows[1]).toMatchObject({
      conditions: [{ field: "actor.displayName", operator: "includes", value: "VIP" }],
      weight: 4,
      priority: 7
    });
    await expect(fixture.documents.find(variation.id)).resolves.toMatchObject({
      id: variation.id,
      parentAlertId: defaultAlert.id,
      kind: "variation",
      name: "VIP follower",
      enabled: false,
      targetProfiles: [
        expect.objectContaining({ id: "landscape", enabled: false, reviewState: "needs-review" }),
        expect.objectContaining({ id: "vertical", enabled: false, reviewState: "needs-review" })
      ]
    });
  });

  it("rejects duplicate sibling variation names and generates unique copy names", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const defaultAlert = (await fixture.service.getSet(starter!.id)).inventory[0]!;
    const variation = await fixture.service.createAlertVariation(defaultAlert.id, { name: "VIP follower" });

    await expect(
      fixture.service.createAlertVariation(defaultAlert.id, { name: "vip FOLLOWER" })
    ).rejects.toBeInstanceOf(AlertVariationNameConflictError);
    const firstCopy = await fixture.service.duplicateManagedAlert(variation.id);
    const secondCopy = await fixture.service.duplicateManagedAlert(variation.id);
    expect([firstCopy.name, secondCopy.name]).toEqual(["VIP follower copy", "VIP follower copy 2"]);
  });

  it("toggles one variation and derives rule enablement from all variants", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const defaultAlert = (await fixture.service.getSet(starter!.id)).inventory[0]!;
    const variation = await fixture.service.createAlertVariation(defaultAlert.id, { name: "VIP follower" });

    await fixture.service.setAlertEnabled(variation.id, true);
    let rule = (await fixture.alertService.listRules()).find((candidate) => candidate.id === defaultAlert.id)!;
    expect(rule.enabled).toBe(true);
    expect(rule.variants.map((candidate) => candidate.enabled)).toEqual([false, true]);
    await expect(fixture.documents.find(variation.id)).resolves.toMatchObject({ enabled: true });

    await fixture.service.setAlertEnabled(variation.id, false);
    rule = (await fixture.alertService.listRules()).find((candidate) => candidate.id === defaultAlert.id)!;
    expect(rule.enabled).toBe(false);
    expect(rule.variants.map((candidate) => candidate.enabled)).toEqual([false, false]);
    await expect(fixture.documents.find(variation.id)).resolves.toMatchObject({ enabled: false });
  });

  it("duplicates defaults and variations disabled for review", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const defaultAlert = (await fixture.service.getSet(starter!.id)).inventory[0]!;
    const variation = await fixture.service.createAlertVariation(defaultAlert.id, { name: "VIP follower" });

    const variationCopy = await fixture.service.duplicateManagedAlert(variation.id);
    const defaultCopy = await fixture.service.duplicateManagedAlert(defaultAlert.id);

    expect(variationCopy).toMatchObject({
      parentAlertId: defaultAlert.id,
      kind: "variation",
      enabled: false,
      reviewState: "needs-review"
    });
    expect(defaultCopy).toMatchObject({ parentAlertId: null, kind: "default", enabled: false, reviewState: "needs-review" });
    expect(defaultCopy.id).not.toBe(defaultAlert.id);
    await expect(fixture.documents.find(variationCopy.id)).resolves.toMatchObject({
      id: variationCopy.id,
      enabled: false,
      targetProfiles: [
        expect.objectContaining({ enabled: false, reviewState: "needs-review" }),
        expect.objectContaining({ enabled: false, reviewState: "needs-review" })
      ]
    });
  });

  it("resets a variation to its default design and deletes only the selected variation", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const defaultAlert = (await fixture.service.getSet(starter!.id)).inventory[0]!;
    const variation = await fixture.service.createAlertVariation(defaultAlert.id, { name: "VIP follower" });
    const rule = (await fixture.alertService.listRules()).find((candidate) => candidate.id === defaultAlert.id)!;
    const selected = rule.variants.find((candidate) => candidate.id === variation.id)!;
    await fixture.alertService.saveVariant(rule.id, { ...selected, textTemplate: "Custom variation" });

    const reset = await fixture.service.resetManagedAlert(variation.id, false);
    expect(reset.previewText).toBe(rule.variants[0]!.textTemplate);

    await fixture.service.deleteManagedAlert(variation.id, false);
    const afterDelete = (await fixture.alertService.listRules()).find((candidate) => candidate.id === defaultAlert.id)!;
    expect(afterDelete.variants.map((candidate) => candidate.id)).toEqual([rule.variants[0]!.id]);
    await expect(fixture.documents.find(variation.id)).resolves.toBeNull();
  });

  it("requires confirmation before resetting or deleting enabled active output", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const defaultAlert = (await fixture.service.getSet(starter!.id)).inventory[0]!;
    await fixture.service.setAlertEnabled(defaultAlert.id, true);

    await expect(fixture.service.resetManagedAlert(defaultAlert.id, false)).rejects.toBeInstanceOf(
      AlertManagedLiveImpactConfirmationRequiredError
    );
    await expect(fixture.service.deleteManagedAlert(defaultAlert.id, false)).rejects.toBeInstanceOf(
      AlertManagedLiveImpactConfirmationRequiredError
    );
    await expect(fixture.service.deleteManagedAlert(defaultAlert.id, true)).resolves.toBeUndefined();
    expect((await fixture.alertService.listRules()).some((candidate) => candidate.id === defaultAlert.id)).toBe(false);
  });

  it("requires confirmation before deleting a default whose variation is live", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();
    const defaultAlert = (await fixture.service.getSet(starter!.id)).inventory[0]!;
    const variation = await fixture.service.createAlertVariation(defaultAlert.id, { name: "VIP follower" });
    await fixture.service.setAlertEnabled(variation.id, true);

    await expect(fixture.service.deleteManagedAlert(defaultAlert.id, false)).rejects.toBeInstanceOf(
      AlertManagedLiveImpactConfirmationRequiredError
    );
  });
});

function createFixture() {
  const alertRepository = new InMemoryAlertRepository();
  let nextId = 0;
  const generateId = (kind: "collection" | "rule" | "variant") => `${kind}-${(nextId += 1)}`;
  const alertService = new DefaultAlertService({
    repository: alertRepository,
    generateId
  });
  const metadataRepository = new InMemoryAlertSetMetadataRepository(alertService);
  const documents = new InMemoryAlertEditorDocumentRepository();
  const mutationStore = createInMemoryMutationStore(alertRepository, metadataRepository, documents);
  const alertEditorService = new AlertEditorService({
    documents,
    rules: alertRepository,
    metadata: metadataRepository,
    hasConnectedOutput: async () => true,
    enqueueTest: async () => undefined,
    moderationService: new DefaultModerationService(),
    generateId: () => `editor-${(nextId += 1)}`,
    generateReferenceId: () => `reference-${(nextId += 1)}`,
    saveAtomically(input) {
      mutationStore.commit({
        expectedRules: [input.expectedRule],
        saveRules: [input.rule],
        saveRuleMetadata: [input.metadata],
        saveDocuments: [input.document]
      });
      return Promise.resolve(input.document);
    }
  });
  const service = new AlertSetManagementService({
    alertService,
    metadataRepository,
    documents,
    getEditorDocument: (editorId) => alertEditorService.getDocument(editorId),
    generateId,
    mutationStore,
    listBrowserSources: async () => [
      {
        id: "module:alerts:landscape:live",
        targetProfileId: "landscape",
        purpose: "live",
        connectionState: "connected",
        lastConnectedAt: "2026-07-15T12:00:00.000Z",
        keyId: "key-landscape",
        url: "http://127.0.0.1/overlay/modules/alerts/live/ovl_landscape?profile=landscape",
        copyableUrlStatus: "available"
      },
      {
        id: "module:alerts:vertical:live",
        targetProfileId: "vertical",
        purpose: "live",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
      }
    ]
  });
  return { alertRepository, alertService, metadataRepository, documents, alertEditorService, service };
}

function createInMemoryMutationStore(
  alerts: InMemoryAlertRepository,
  metadata: InMemoryAlertSetMetadataRepository,
  documents: InMemoryAlertEditorDocumentRepository
): AlertAggregateMutationStore {
  return {
    commit(mutation: AlertAggregateMutation) {
      for (const collection of mutation.saveCollections ?? []) void alerts.saveCollection(collection);
      for (const item of mutation.saveSetMetadata ?? []) void metadata.saveSet(item);
      for (const rule of mutation.saveRules ?? []) void alerts.saveRule(rule);
      for (const item of mutation.saveRuleMetadata ?? []) void metadata.saveRule(item);
      for (const document of mutation.saveDocuments ?? []) void documents.save(document);
      for (const id of mutation.deleteDocumentIds ?? []) void documents.delete(id);
      for (const id of mutation.deleteRuleMetadataIds ?? []) void metadata.deleteRule(id);
      for (const id of mutation.deleteRuleIds ?? []) void alerts.deleteRule(id);
      for (const id of mutation.deleteSetMetadataIds ?? []) void metadata.deleteSet(id);
      for (const id of mutation.deleteCollectionIds ?? []) void alerts.deleteCollection(id);
    }
  };
}

class InMemoryAlertEditorDocumentRepository implements AlertEditorDocumentRepository {
  readonly #documents = new Map<string, AlertEditorDocument>();

  async find(editorId: string): Promise<AlertEditorDocument | null> {
    return structuredClone(this.#documents.get(editorId) ?? null);
  }

  async findMany(editorIds: readonly string[]): Promise<ReadonlyMap<string, AlertEditorDocument>> {
    return new Map(editorIds.flatMap((editorId) => {
      const document = this.#documents.get(editorId);
      return document === undefined ? [] : [[editorId, structuredClone(document)]];
    }));
  }

  async save(document: AlertEditorDocument): Promise<AlertEditorDocument> {
    this.#documents.set(document.id, structuredClone(document));
    return document;
  }

  async delete(editorId: string): Promise<void> {
    this.#documents.delete(editorId);
  }
}

class InMemoryAlertRepository implements AlertRepository {
  readonly #collections = new Map<string, AlertCollection>();
  readonly #rules = new Map<string, AlertRule>();

  async saveCollection(collection: AlertCollection): Promise<AlertCollection> {
    if (collection.enabled) {
      for (const [id, existing] of this.#collections) {
        if (id !== collection.id && existing.enabled) {
          this.#collections.set(id, { ...existing, enabled: false });
        }
      }
    }
    this.#collections.set(collection.id, structuredClone(collection));
    return collection;
  }

  async findCollectionById(collectionId: string): Promise<AlertCollection | null> {
    return this.#collections.get(collectionId) ?? null;
  }

  async listCollections(): Promise<readonly AlertCollection[]> {
    return Array.from(this.#collections.values());
  }

  async deleteCollection(collectionId: string): Promise<void> {
    this.#collections.delete(collectionId);
  }

  async saveRule(rule: AlertRule): Promise<AlertRule> {
    this.#rules.set(rule.id, structuredClone(rule));
    return rule;
  }

  async findRuleById(ruleId: string): Promise<AlertRule | null> {
    return this.#rules.get(ruleId) ?? null;
  }

  async listRules(): Promise<readonly AlertRule[]> {
    return Array.from(this.#rules.values());
  }

  async listActiveRules(input: { readonly eventType?: AlertRule["eventType"] } = {}): Promise<readonly AlertRule[]> {
    const enabledCollectionIds = new Set(
      Array.from(this.#collections.values()).filter((collection) => collection.enabled).map((collection) => collection.id)
    );
    return (await this.listRules()).filter((rule) =>
      rule.enabled &&
      (input.eventType === undefined || rule.eventType === input.eventType) &&
      rule.collectionIds.some((collectionId) => enabledCollectionIds.has(collectionId))
    );
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.#rules.delete(ruleId);
  }
}

class InMemoryAlertSetMetadataRepository implements AlertSetMetadataRepository {
  readonly #setMetadata = new Map<string, AlertSetMetadata>();
  readonly #ruleMetadata = new Map<string, AlertRuleManagementMetadata>();
  readonly #alertService: DefaultAlertService;

  constructor(alertService: DefaultAlertService) {
    this.#alertService = alertService;
  }

  async findSet(setId: string): Promise<AlertSetMetadata | null> {
    return this.#setMetadata.get(setId) ?? null;
  }

  async findSets(setIds: readonly string[]): Promise<ReadonlyMap<string, AlertSetMetadata>> {
    return new Map(setIds.flatMap((setId) => {
      const metadata = this.#setMetadata.get(setId);
      return metadata === undefined ? [] : [[setId, metadata]];
    }));
  }

  async saveSet(metadata: AlertSetMetadata): Promise<AlertSetMetadata> {
    this.#setMetadata.set(metadata.setId, metadata);
    return metadata;
  }

  async deleteSet(setId: string): Promise<void> {
    this.#setMetadata.delete(setId);
  }

  async findRule(ruleId: string): Promise<AlertRuleManagementMetadata | null> {
    return this.#ruleMetadata.get(ruleId) ?? null;
  }

  async findRules(ruleIds: readonly string[]): Promise<ReadonlyMap<string, AlertRuleManagementMetadata>> {
    return new Map(ruleIds.flatMap((ruleId) => {
      const metadata = this.#ruleMetadata.get(ruleId);
      return metadata === undefined ? [] : [[ruleId, metadata]];
    }));
  }

  async saveRule(metadata: AlertRuleManagementMetadata): Promise<AlertRuleManagementMetadata> {
    this.#ruleMetadata.set(metadata.ruleId, metadata);
    return metadata;
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.#ruleMetadata.delete(ruleId);
  }

  async activateSet(setId: string): Promise<string | null> {
    const collections = await this.#alertService.listCollections();
    const replaced = collections.find((collection) => collection.enabled)?.id ?? null;
    await this.#alertService.setCollectionEnabled(setId, true);
    return replaced === setId ? null : replaced;
  }
}
