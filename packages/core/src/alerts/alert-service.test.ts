import type { AlertRepository } from "./repository.js";
import type { AlertCollection, AlertRule } from "./types.js";
import { describe, expect, it } from "vitest";
import {
  AlertCollectionNotFoundError,
  AlertRuleNotFoundError,
  AlertVariantIdConflictError,
  LastAlertVariantError,
  DefaultAlertService
} from "./alert-service.js";

describe("DefaultAlertService", () => {
  it("creates, updates, toggles, and deletes collections and rules through the repository", async () => {
    const repository = new InMemoryAlertRepository();
    const service = createService(repository);

    const collection = await service.createCollection({
      name: "Main Alerts",
      enabled: true
    });
    const rule = await service.createRule(createRuleInput([collection.id]));

    await expect(service.listCollections()).resolves.toEqual([collection]);
    await expect(service.listRules()).resolves.toEqual([rule]);

    await expect(
      service.updateCollection(collection.id, {
        name: "Main Show Alerts",
        enabled: false
      })
    ).resolves.toMatchObject({
      id: collection.id,
      name: "Main Show Alerts",
      enabled: false
    });
    await expect(service.setCollectionEnabled(collection.id, true)).resolves.toMatchObject({
      id: collection.id,
      enabled: true
    });
    await expect(
      service.updateRule(rule.id, {
        ...rule,
        name: "Follow Celebration"
      })
    ).resolves.toMatchObject({
      id: rule.id,
      name: "Follow Celebration"
    });
    await expect(service.setRuleEnabled(rule.id, false)).resolves.toMatchObject({
      id: rule.id,
      enabled: false
    });

    await service.deleteRule(rule.id);
    await service.deleteCollection(collection.id);

    await expect(service.listRules()).resolves.toEqual([]);
    await expect(service.listCollections()).resolves.toEqual([]);
  });

  it("treats multiple enabled collections as active while applying individual rule disable precedence", async () => {
    const repository = new InMemoryAlertRepository();
    const service = createService(repository);
    const mainCollection = await service.createCollection({ name: "Main", enabled: true });
    const bonusCollection = await service.createCollection({ name: "Bonus", enabled: false });
    const disabledCollection = await service.createCollection({ name: "Disabled", enabled: false });
    await service.setCollectionEnabled(bonusCollection.id, true);
    const multiCollectionRule = await service.createRule(
      createRuleInput([mainCollection.id, bonusCollection.id], {
        name: "Shared Follow Alert"
      })
    );
    const disabledRule = await service.createRule(
      createRuleInput([mainCollection.id], {
        name: "Disabled Rule",
        enabled: false
      })
    );
    await service.createRule(
      createRuleInput([disabledCollection.id], {
        name: "Inactive Collection Rule"
      })
    );

    await expect(service.getActivationState()).resolves.toEqual({
      enabledCollectionIds: [mainCollection.id, bonusCollection.id],
      disabledRuleIds: [disabledRule.id]
    });
    await expect(service.listActiveRules({ eventType: "follow" })).resolves.toEqual([multiCollectionRule]);
  });

  it("upserts and deletes variants without allowing a rule to lose its final variant", async () => {
    const repository = new InMemoryAlertRepository();
    const service = createService(repository);
    const collection = await service.createCollection({ name: "Main", enabled: true });
    const rule = await service.createRule(createRuleInput([collection.id]));
    const originalVariant = rule.variants[0];
    if (originalVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    const updatedRule = await service.saveVariant(rule.id, {
      ...originalVariant,
      name: "VIP Follow",
      weight: 3
    });
    expect(updatedRule.variants).toMatchObject([
      {
        id: originalVariant.id,
        name: "VIP Follow",
        weight: 3
      }
    ]);

    await service.saveVariant(rule.id, {
      ...originalVariant,
      id: "variant_bonus",
      name: "Bonus",
      weight: 1
    });
    await expect(service.deleteVariant(rule.id, "variant_bonus")).resolves.toMatchObject({
      variants: [
        {
          id: originalVariant.id
        }
      ]
    });
    await expect(service.deleteVariant(rule.id, originalVariant.id)).rejects.toEqual(
      new LastAlertVariantError(rule.id)
    );
  });

  it("creates variants with service-generated IDs", async () => {
    const repository = new InMemoryAlertRepository();
    const service = createService(repository);
    const collection = await service.createCollection({ name: "Main", enabled: true });
    const rule = await service.createRule(createRuleInput([collection.id]));
    const sourceVariant = rule.variants[0];
    if (sourceVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    await expect(
      service.createVariant(rule.id, {
        ...sourceVariant,
        name: "VIP Follow"
      })
    ).resolves.toMatchObject({
      variants: [
        { id: sourceVariant.id },
        { id: "variant_4", name: "VIP Follow" }
      ]
    });
  });

  it("rejects generated variant IDs that already exist", async () => {
    const repository = new InMemoryAlertRepository();
    const service = new DefaultAlertService({
      repository,
      generateId: (kind) => (kind === "collection" ? "collection_main" : "shared_id")
    });
    const collection = await service.createCollection({ name: "Main", enabled: true });
    const rule = await service.createRule(createRuleInput([collection.id]));
    const sourceVariant = rule.variants[0];
    if (sourceVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    await expect(service.createVariant(rule.id, sourceVariant)).rejects.toEqual(
      new AlertVariantIdConflictError(sourceVariant.id)
    );
  });

  it("rejects variant creation for a missing rule", async () => {
    const service = createService(new InMemoryAlertRepository());

    await expect(
      service.createVariant("missing_rule", {
        name: "VIP Follow",
        enabled: false,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: "Welcome!",
        ttsConfig: null,
        durationMs: 5000,
        layout: { x: 0, y: 0, width: 640, height: 360, zIndex: 1 }
      })
    ).rejects.toEqual(new AlertRuleNotFoundError("missing_rule"));
  });

  it("rejects duplicate variant IDs before repository persistence", async () => {
    const repository = new InMemoryAlertRepository();
    const service = createService(repository);
    const collection = await service.createCollection({ name: "Main", enabled: true });
    const rule = await service.createRule(createRuleInput([collection.id]));
    const originalVariant = rule.variants[0];
    if (originalVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    await expect(
      service.updateRule(rule.id, {
        ...rule,
        variants: [originalVariant, originalVariant]
      })
    ).rejects.toEqual(new AlertVariantIdConflictError(originalVariant.id));
  });

  it("rejects variant IDs already owned by another rule", async () => {
    const repository = new InMemoryAlertRepository();
    const service = createService(repository);
    const collection = await service.createCollection({ name: "Main", enabled: true });
    const firstRule = await service.createRule(createRuleInput([collection.id], { name: "First" }));
    const secondRule = await service.createRule(createRuleInput([collection.id], { name: "Second" }));
    const firstVariant = firstRule.variants[0];
    const secondVariant = secondRule.variants[0];
    if (firstVariant === undefined || secondVariant === undefined) {
      throw new Error("Missing variant fixture");
    }

    await expect(
      service.saveVariant(secondRule.id, {
        ...secondVariant,
        id: firstVariant.id
      })
    ).rejects.toEqual(new AlertVariantIdConflictError(firstVariant.id, firstRule.id));
  });

  it("returns typed not-found errors for missing alert configuration records", async () => {
    const service = createService(new InMemoryAlertRepository());

    await expect(service.setCollectionEnabled("missing_collection", true)).rejects.toEqual(
      new AlertCollectionNotFoundError("missing_collection")
    );
    await expect(service.setRuleEnabled("missing_rule", true)).rejects.toEqual(
      new AlertRuleNotFoundError("missing_rule")
    );
  });
});

function createService(repository: AlertRepository): DefaultAlertService {
  let nextId = 0;
  return new DefaultAlertService({
    repository,
    generateId: (kind) => `${kind}_${(nextId += 1)}`
  });
}

function createRuleInput(
  collectionIds: readonly string[],
  overrides: Partial<Parameters<DefaultAlertService["createRule"]>[0]> = {}
): Parameters<DefaultAlertService["createRule"]>[0] {
  return {
    name: "Follow Alert",
    eventType: "follow",
    enabled: true,
    collectionIds,
    conditions: [],
    variants: [
      {
        name: "Default",
        enabled: true,
        weight: 1,
        visualAssetId: null,
        audioAssetId: null,
        textTemplate: "Thanks {actor.displayName}!",
        ttsConfig: null,
        durationMs: 5000,
        layout: {
          x: 100,
          y: 200,
          width: 640,
          height: 360,
          zIndex: 1
        }
      }
    ],
    cooldownSeconds: 30,
    priority: 10,
    ...overrides
  };
}

class InMemoryAlertRepository implements AlertRepository {
  readonly #collections = new Map<string, AlertCollection>();
  readonly #rules = new Map<string, AlertRule>();
  async saveCollection(collection: AlertCollection): Promise<AlertCollection> {
    this.#collections.set(collection.id, collection);
    return collection;
  }

  async findCollectionById(collectionId: string): Promise<AlertCollection | null> {
    return this.#collections.get(collectionId) ?? null;
  }

  async listCollections(): Promise<readonly AlertCollection[]> {
    return Array.from(this.#collections.values()).sort((left, right) => left.id.localeCompare(right.id));
  }

  async deleteCollection(collectionId: string): Promise<void> {
    this.#collections.delete(collectionId);
  }

  async saveRule(rule: AlertRule): Promise<AlertRule> {
    this.#rules.set(rule.id, rule);
    return rule;
  }

  async findRuleById(ruleId: string): Promise<AlertRule | null> {
    return this.#rules.get(ruleId) ?? null;
  }

  async listRules(): Promise<readonly AlertRule[]> {
    return Array.from(this.#rules.values()).sort((left, right) => left.id.localeCompare(right.id));
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.#rules.delete(ruleId);
  }
}
