import {
  DefaultAlertService,
  type AlertCollection,
  type AlertRepository,
  type AlertRule
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  AlertSetActivationBlockedError,
  AlertSetDeleteBlockedError,
  AlertSetManagementService,
  type AlertRuleManagementMetadata,
  type AlertSetMetadata,
  type AlertSetMetadataRepository
} from "./alert-set-management-service.js";

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
    expect(detail.inventory.every((row) => !row.enabled && row.reviewState === "needs-review")).toBe(true);
    expect(detail.browserSources.map((output) => output.targetProfileId)).toEqual(["landscape", "vertical"]);
  });

  it("marks starter review complete without silently enabling alerts", async () => {
    const fixture = createFixture();
    const [starter] = await fixture.service.listSets();

    const reviewed = await fixture.service.markStarterReviewComplete(starter!.id);
    const detail = await fixture.service.getSet(starter!.id);

    expect(reviewed.starterReviewState).toBe("complete");
    expect(detail.inventory.every((row) => !row.enabled)).toBe(true);
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
});

function createFixture() {
  const alertRepository = new InMemoryAlertRepository();
  let nextId = 0;
  const alertService = new DefaultAlertService({
    repository: alertRepository,
    generateId: (kind) => `${kind}-${(nextId += 1)}`
  });
  const metadataRepository = new InMemoryAlertSetMetadataRepository(alertService);
  const service = new AlertSetManagementService({
    alertService,
    metadataRepository,
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
  return { alertService, metadataRepository, service };
}

class InMemoryAlertRepository implements AlertRepository {
  readonly #collections = new Map<string, AlertCollection>();
  readonly #rules = new Map<string, AlertRule>();

  async saveCollection(collection: AlertCollection): Promise<AlertCollection> {
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
    for (const collection of collections) {
      await this.#alertService.setCollectionEnabled(collection.id, collection.id === setId);
    }
    return replaced === setId ? null : replaced;
  }
}
