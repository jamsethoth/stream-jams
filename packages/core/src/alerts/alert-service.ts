import { z } from "zod";
import type { AlertRepository } from "./repository.js";
import type { AlertActivationState, AlertCollection, AlertRule, AlertVariant } from "./types.js";
import type { StreamEventType } from "../events/types.js";
import { alertCollectionSchema, alertRuleSchema, alertVariantSchema } from "./schemas.js";

export const createAlertCollectionInputSchema = z.object({
  name: alertCollectionSchema.shape.name,
  enabled: z.boolean().default(true)
});

export const updateAlertCollectionInputSchema = alertCollectionSchema.omit({
  id: true
});

export const createAlertVariantInputSchema = alertVariantSchema.omit({
  id: true
});

export const updateAlertVariantInputSchema = createAlertVariantInputSchema;

export const createAlertRuleInputSchema = alertRuleSchema.omit({
  id: true,
  variants: true
}).extend({
  variants: z.array(createAlertVariantInputSchema).min(1)
});

export const updateAlertRuleInputSchema = alertRuleSchema.omit({
  id: true
});

export interface CreateAlertCollectionInput {
  readonly name: string;
  readonly enabled?: boolean;
}

export type UpdateAlertCollectionInput = Omit<AlertCollection, "id">;
export type CreateAlertVariantInput = Omit<AlertVariant, "id">;
export type UpdateAlertVariantInput = Omit<AlertVariant, "id">;
export interface CreateAlertRuleInput extends Omit<AlertRule, "id" | "variants"> {
  readonly variants: readonly CreateAlertVariantInput[];
}
export type UpdateAlertRuleInput = Omit<AlertRule, "id">;

export type AlertConfigurationIdKind = "collection" | "rule" | "variant";

export interface ListActiveAlertRulesInput {
  readonly eventType?: StreamEventType;
}

export interface AlertService {
  listCollections(): Promise<readonly AlertCollection[]>;
  createCollection(input: CreateAlertCollectionInput): Promise<AlertCollection>;
  updateCollection(collectionId: string, input: UpdateAlertCollectionInput): Promise<AlertCollection>;
  setCollectionEnabled(collectionId: string, enabled: boolean): Promise<AlertCollection>;
  deleteCollection(collectionId: string): Promise<void>;
  listRules(): Promise<readonly AlertRule[]>;
  createRule(input: CreateAlertRuleInput): Promise<AlertRule>;
  updateRule(ruleId: string, input: UpdateAlertRuleInput): Promise<AlertRule>;
  setRuleEnabled(ruleId: string, enabled: boolean): Promise<AlertRule>;
  deleteRule(ruleId: string): Promise<void>;
  createVariant(ruleId: string, input: CreateAlertVariantInput): Promise<AlertRule>;
  saveVariant(ruleId: string, variant: AlertVariant): Promise<AlertRule>;
  deleteVariant(ruleId: string, variantId: string): Promise<AlertRule>;
  getActivationState(): Promise<AlertActivationState>;
  listActiveRules(input?: ListActiveAlertRulesInput): Promise<readonly AlertRule[]>;
}

export interface AlertServiceDependencies {
  readonly repository: AlertRepository;
  readonly generateId: (kind: AlertConfigurationIdKind) => string;
}

export class AlertCollectionNotFoundError extends Error {
  constructor(readonly collectionId: string) {
    super(`Alert collection "${collectionId}" was not found`);
    this.name = "AlertCollectionNotFoundError";
  }
}

export class AlertRuleNotFoundError extends Error {
  constructor(readonly ruleId: string) {
    super(`Alert rule "${ruleId}" was not found`);
    this.name = "AlertRuleNotFoundError";
  }
}

export class AlertVariantNotFoundError extends Error {
  constructor(
    readonly ruleId: string,
    readonly variantId: string
  ) {
    super(`Alert variant "${variantId}" was not found on rule "${ruleId}"`);
    this.name = "AlertVariantNotFoundError";
  }
}

export class LastAlertVariantError extends Error {
  constructor(readonly ruleId: string) {
    super(`Alert rule "${ruleId}" must keep at least one variant`);
    this.name = "LastAlertVariantError";
  }
}

export class AlertVariantIdConflictError extends Error {
  constructor(
    readonly variantId: string,
    readonly ownerRuleId: string | null = null
  ) {
    super(
      ownerRuleId === null
        ? `Alert variant id "${variantId}" is duplicated`
        : `Alert variant "${variantId}" already belongs to rule "${ownerRuleId}"`
    );
    this.name = "AlertVariantIdConflictError";
  }
}

export class DefaultAlertService implements AlertService {
  readonly #repository: AlertRepository;
  readonly #generateId: (kind: AlertConfigurationIdKind) => string;

  constructor(dependencies: AlertServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#generateId = dependencies.generateId;
  }

  async listCollections(): Promise<readonly AlertCollection[]> {
    return this.#repository.listCollections();
  }

  async createCollection(input: CreateAlertCollectionInput): Promise<AlertCollection> {
    const parsed = createAlertCollectionInputSchema.parse(input);
    return this.#repository.saveCollection(
      alertCollectionSchema.parse({
        id: this.#generateId("collection"),
        ...parsed
      })
    );
  }

  async updateCollection(collectionId: string, input: UpdateAlertCollectionInput): Promise<AlertCollection> {
    await this.#requireCollection(collectionId);
    const parsed = updateAlertCollectionInputSchema.parse(input);
    return this.#repository.saveCollection(
      alertCollectionSchema.parse({
        id: collectionId,
        ...parsed
      })
    );
  }

  async setCollectionEnabled(collectionId: string, enabled: boolean): Promise<AlertCollection> {
    const collection = await this.#requireCollection(collectionId);
    return this.#repository.saveCollection({
      ...collection,
      enabled
    });
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.#requireCollection(collectionId);
    await this.#repository.deleteCollection(collectionId);
  }

  async listRules(): Promise<readonly AlertRule[]> {
    return this.#repository.listRules();
  }

  async createRule(input: CreateAlertRuleInput): Promise<AlertRule> {
    const parsed = createAlertRuleInputSchema.parse(input);
    const collectionIds = dedupeIds(parsed.collectionIds);
    await this.#requireCollections(collectionIds);
    const ruleId = this.#generateId("rule");
    const variants = parsed.variants.map((variant) => ({
      id: this.#generateId("variant"),
      ...variant
    }));
    assertUniqueVariantIds(variants);
    await this.#requireVariantIdsAvailable(ruleId, variants);

    return this.#repository.saveRule(
      alertRuleSchema.parse({
        ...parsed,
        id: ruleId,
        collectionIds,
        variants
      })
    );
  }

  async updateRule(ruleId: string, input: UpdateAlertRuleInput): Promise<AlertRule> {
    await this.#requireRule(ruleId);
    const parsed = updateAlertRuleInputSchema.parse(input);
    const collectionIds = dedupeIds(parsed.collectionIds);
    await this.#requireCollections(collectionIds);
    assertUniqueVariantIds(parsed.variants);
    await this.#requireVariantIdsAvailable(ruleId, parsed.variants);

    return this.#repository.saveRule(
      alertRuleSchema.parse({
        ...parsed,
        id: ruleId,
        collectionIds
      })
    );
  }

  async setRuleEnabled(ruleId: string, enabled: boolean): Promise<AlertRule> {
    const rule = await this.#requireRule(ruleId);
    return this.#repository.saveRule({
      ...rule,
      enabled
    });
  }

  async deleteRule(ruleId: string): Promise<void> {
    await this.#requireRule(ruleId);
    await this.#repository.deleteRule(ruleId);
  }

  async createVariant(ruleId: string, input: CreateAlertVariantInput): Promise<AlertRule> {
    const rule = await this.#requireRule(ruleId);
    const variant = alertVariantSchema.parse({
      id: this.#generateId("variant"),
      ...createAlertVariantInputSchema.parse(input)
    });
    const variants = [...rule.variants, variant];
    assertUniqueVariantIds(variants);
    await this.#requireVariantIdsAvailable(ruleId, variants);

    return this.#repository.saveRule({
      ...rule,
      variants
    });
  }

  async saveVariant(ruleId: string, variant: AlertVariant): Promise<AlertRule> {
    const rule = await this.#requireRule(ruleId);
    const parsedVariant = alertVariantSchema.parse(variant);
    const existingIndex = rule.variants.findIndex((candidate) => candidate.id === parsedVariant.id);
    const variants =
      existingIndex >= 0
        ? rule.variants.map((candidate) => (candidate.id === parsedVariant.id ? parsedVariant : candidate))
        : [...rule.variants, parsedVariant];
    assertUniqueVariantIds(variants);
    await this.#requireVariantIdsAvailable(ruleId, variants);

    return this.#repository.saveRule(
      alertRuleSchema.parse({
        ...rule,
        variants
      })
    );
  }

  async deleteVariant(ruleId: string, variantId: string): Promise<AlertRule> {
    const rule = await this.#requireRule(ruleId);
    if (!rule.variants.some((variant) => variant.id === variantId)) {
      throw new AlertVariantNotFoundError(ruleId, variantId);
    }

    if (rule.variants.length <= 1) {
      throw new LastAlertVariantError(ruleId);
    }

    return this.#repository.saveRule({
      ...rule,
      variants: rule.variants.filter((variant) => variant.id !== variantId)
    });
  }

  async getActivationState(): Promise<AlertActivationState> {
    const [collections, rules] = await Promise.all([this.#repository.listCollections(), this.#repository.listRules()]);
    return {
      enabledCollectionIds: collections.filter((collection) => collection.enabled).map((collection) => collection.id),
      disabledRuleIds: rules.filter((rule) => !rule.enabled).map((rule) => rule.id)
    };
  }

  async listActiveRules(input: ListActiveAlertRulesInput = {}): Promise<readonly AlertRule[]> {
    const [collections, rules] = await Promise.all([this.#repository.listCollections(), this.#repository.listRules()]);
    const enabledCollectionIds = new Set(
      collections.filter((collection) => collection.enabled).map((collection) => collection.id)
    );
    const activeRules: AlertRule[] = [];
    const seenRuleIds = new Set<string>();

    for (const rule of rules) {
      if (
        !rule.enabled ||
        seenRuleIds.has(rule.id) ||
        (input.eventType !== undefined && rule.eventType !== input.eventType) ||
        !rule.collectionIds.some((collectionId) => enabledCollectionIds.has(collectionId))
      ) {
        continue;
      }

      seenRuleIds.add(rule.id);
      activeRules.push(rule);
    }

    return activeRules;
  }

  async #requireCollection(collectionId: string): Promise<AlertCollection> {
    const collection = await this.#repository.findCollectionById(collectionId);
    if (collection === null) {
      throw new AlertCollectionNotFoundError(collectionId);
    }

    return collection;
  }

  async #requireCollections(collectionIds: readonly string[]): Promise<void> {
    await Promise.all(collectionIds.map((collectionId) => this.#requireCollection(collectionId)));
  }

  async #requireRule(ruleId: string): Promise<AlertRule> {
    const rule = await this.#repository.findRuleById(ruleId);
    if (rule === null) {
      throw new AlertRuleNotFoundError(ruleId);
    }

    return rule;
  }

  async #requireVariantIdsAvailable(ruleId: string, variants: readonly Pick<AlertVariant, "id">[]): Promise<void> {
    const variantIds = new Set(variants.map((variant) => variant.id));
    const rules = await this.#repository.listRules();
    for (const rule of rules) {
      if (rule.id === ruleId) {
        continue;
      }

      for (const variant of rule.variants) {
        if (variantIds.has(variant.id)) {
          throw new AlertVariantIdConflictError(variant.id, rule.id);
        }
      }
    }
  }
}

function assertUniqueVariantIds(variants: readonly Pick<AlertVariant, "id">[]): void {
  const seenVariantIds = new Set<string>();
  for (const variant of variants) {
    if (seenVariantIds.has(variant.id)) {
      throw new AlertVariantIdConflictError(variant.id);
    }

    seenVariantIds.add(variant.id);
  }
}

function dedupeIds(ids: readonly string[]): readonly string[] {
  return Array.from(new Set(ids));
}
