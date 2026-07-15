import {
  assetLibraryItemSchema,
  assetMetadataUpdateInputSchema,
  normalizeAssetTags,
  type AlertCollection,
  type AlertRepository,
  type AlertRule,
  type AssetChangeImpact,
  type AssetLibraryItem,
  type AssetMediaType,
  type AssetMetadataUpdateInput,
  type AssetRecord,
  type AssetRepository,
  type TargetProfileId
} from "@stream-jams/core";
import type { AlertSetMetadataRepository } from "../alerts/alert-set-management-service.js";

export interface AssetLibraryMetadata {
  readonly assetId: string;
  readonly displayName: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetLibraryMetadataRepository {
  find(assetId: string): Promise<AssetLibraryMetadata | null>;
  save(metadata: AssetLibraryMetadata): Promise<AssetLibraryMetadata>;
  delete(assetId: string): Promise<void>;
}

export interface AssetLibraryStore {
  inspect(storagePath: string, expectedSizeBytes?: number): Promise<"available" | "missing" | "broken">;
  delete(storagePath: string): Promise<void>;
  stageDelete(storagePath: string): Promise<{
    readonly commit: () => Promise<void>;
    readonly rollback: () => Promise<void>;
  }>;
}

export interface AssetLibraryServiceOptions {
  readonly assetRepository: Pick<AssetRepository, "list" | "findById" | "save" | "delete">;
  readonly metadataRepository: AssetLibraryMetadataRepository;
  readonly assetStore: AssetLibraryStore;
  readonly alertRepository: Pick<AlertRepository, "listCollections" | "listRules">;
  readonly ruleMetadataRepository: Pick<AlertSetMetadataRepository, "findRule">;
  readonly clock?: () => Date;
}

export class AssetLibraryNotFoundError extends Error {
  constructor(readonly assetId: string) {
    super(`Asset "${assetId}" was not found`);
    this.name = "AssetLibraryNotFoundError";
  }
}

export class AssetLibraryInUseError extends Error {
  constructor(readonly impact: AssetChangeImpact) {
    super(`Asset "${impact.assetId}" is used by ${impact.usage.totalUsageCount} alert contexts`);
    this.name = "AssetLibraryInUseError";
  }
}

export class AssetLibraryService {
  readonly #options: AssetLibraryServiceOptions;
  readonly #clock: () => Date;

  constructor(options: AssetLibraryServiceOptions) {
    this.#options = options;
    this.#clock = options.clock ?? (() => new Date());
  }

  async listItems(): Promise<readonly AssetLibraryItem[]> {
    const [records, collections, rules] = await Promise.all([
      this.#options.assetRepository.list(),
      this.#options.alertRepository.listCollections(),
      this.#options.alertRepository.listRules()
    ]);
    const usages = await this.#deriveUsage(collections, rules);
    return Promise.all(records.map((record) => this.#toItem(record, usages.get(record.id) ?? [])));
  }

  async getItem(assetId: string): Promise<AssetLibraryItem> {
    const item = (await this.listItems()).find((candidate) => candidate.id === assetId);
    if (item === undefined) throw new AssetLibraryNotFoundError(assetId);
    return item;
  }

  async updateMetadata(assetId: string, input: AssetMetadataUpdateInput): Promise<AssetLibraryItem> {
    const parsed = assetMetadataUpdateInputSchema.parse(input);
    const record = await this.#findRecord(assetId);
    const existing = await this.#metadata(record);
    await this.#options.metadataRepository.save({
      ...existing,
      displayName: parsed.displayName,
      tags: normalizeAssetTags(parsed.tags),
      updatedAt: this.#clock().toISOString()
    });
    return this.getItem(assetId);
  }

  async registerAsset(record: AssetRecord, input?: Partial<AssetMetadataUpdateInput>): Promise<AssetLibraryMetadata> {
    const timestamp = this.#clock().toISOString();
    return this.#options.metadataRepository.save({
      assetId: record.id,
      displayName: input?.displayName?.trim() || record.originalFileName,
      tags: normalizeAssetTags(input?.tags ?? []),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async getChangeImpact(assetId: string, candidateMediaType?: AssetMediaType): Promise<AssetChangeImpact> {
    const item = await this.getItem(assetId);
    const warnings: string[] = [];
    if (item.usage.totalUsageCount > 0) {
      warnings.push(`${item.usage.totalUsageCount} alert usage${item.usage.totalUsageCount === 1 ? "" : "s"} will update everywhere.`);
    }
    if (candidateMediaType !== undefined && candidateMediaType !== item.mediaType) {
      warnings.push(`Media type changes from ${item.mediaType} to ${candidateMediaType}; review every affected layer.`);
    }
    return {
      assetId,
      usage: item.usage,
      canDelete: item.usage.totalUsageCount === 0,
      requiresConfirmation: warnings.length > 0,
      warnings
    };
  }

  async deleteAsset(assetId: string): Promise<void> {
    const impact = await this.getChangeImpact(assetId);
    if (!impact.canDelete) throw new AssetLibraryInUseError(impact);
    const record = await this.#findRecord(assetId);
    const metadata = await this.#options.metadataRepository.find(assetId);
    const stagedDeletion = await this.#options.assetStore.stageDelete(record.storagePath);
    try {
      await this.#options.metadataRepository.delete(assetId);
      await this.#options.assetRepository.delete(assetId);
      await stagedDeletion.commit();
    } catch (error) {
      const recovery = await Promise.allSettled([
        this.#options.assetRepository.save(record),
        metadata === null ? Promise.resolve() : this.#options.metadataRepository.save(metadata),
        stagedDeletion.rollback()
      ]);
      const recoveryErrors = recovery
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason);
      if (recoveryErrors.length > 0) {
        throw new AggregateError(
          recoveryErrors,
          "Asset deletion failed and could not be fully rolled back",
          { cause: error }
        );
      }
      throw error;
    }
  }

  async completeReplacement(previous: AssetRecord, replacement: AssetRecord): Promise<AssetLibraryItem> {
    if (previous.id !== replacement.id) {
      throw new TypeError("Asset replacement must preserve the asset ID");
    }
    if (previous.storagePath !== replacement.storagePath) {
      await this.#options.assetStore.delete(previous.storagePath);
    }
    const metadata = await this.#metadata(replacement);
    await this.#options.metadataRepository.save({ ...metadata, updatedAt: this.#clock().toISOString() });
    return this.getItem(replacement.id);
  }

  async #findRecord(assetId: string): Promise<AssetRecord> {
    const record = await this.#options.assetRepository.findById(assetId);
    if (record === null) throw new AssetLibraryNotFoundError(assetId);
    return record;
  }

  async #metadata(record: AssetRecord): Promise<AssetLibraryMetadata> {
    const existing = await this.#options.metadataRepository.find(record.id);
    if (existing !== null) return existing;
    const timestamp = this.#clock().toISOString();
    return {
      assetId: record.id,
      displayName: record.originalFileName,
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  async #toItem(record: AssetRecord, usages: AssetLibraryItem["usage"]["usages"]): Promise<AssetLibraryItem> {
    const [metadata, health] = await Promise.all([
      this.#metadata(record),
      this.#options.assetStore.inspect(record.storagePath, record.sizeBytes)
    ]);
    return assetLibraryItemSchema.parse({
      id: record.id,
      displayName: metadata.displayName,
      originalFileName: record.originalFileName,
      mediaType: record.mediaType,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      width: null,
      height: null,
      durationMs: null,
      health,
      tags: metadata.tags,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      usage: { assetId: record.id, totalUsageCount: usages.length, usages }
    });
  }

  async #deriveUsage(collections: readonly AlertCollection[], rules: readonly AlertRule[]) {
    const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
    const usage = new Map<string, AssetLibraryItem["usage"]["usages"]>();
    for (const rule of rules) {
      const referencedAssetIds = new Set(
        rule.variants.flatMap((variant) => [variant.visualAssetId, variant.audioAssetId]).filter((id): id is string => id !== null)
      );
      if (referencedAssetIds.size === 0) continue;
      const metadata = await this.#options.ruleMetadataRepository.findRule(rule.id);
      const targetProfileIds: readonly TargetProfileId[] = metadata?.targetProfileIds ?? [];
      for (const assetId of referencedAssetIds) {
        const current: AssetLibraryItem["usage"]["usages"] = usage.get(assetId) ?? [];
        const setIds: readonly (string | null)[] = rule.collectionIds.length > 0 ? rule.collectionIds : [null];
        const links: AssetLibraryItem["usage"]["usages"] = setIds.map((setId) => ({
          setId,
          setName: setId === null ? null : (collectionNames.get(setId) ?? setId),
          eventType: rule.eventType,
          alertId: rule.id,
          alertName: rule.name,
          targetProfileIds: [...targetProfileIds]
        }));
        usage.set(assetId, [...current, ...links]);
      }
    }
    return usage;
  }
}
