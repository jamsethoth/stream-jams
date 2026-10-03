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
  type ModuleMediaReference,
  type ScreenEffectRepository,
  type TimerDefinitionRepository,
  type TargetProfileId
} from "@stream-jams/core";
import type { AlertSetMetadataRepository } from "../alerts/alert-set-management-service.js";
import type { MediaMetadataProbe } from "@stream-jams/core";
import type { AssetDurationCatalog } from "./asset-duration-catalog.js";

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
  readBounded?(storagePath: string, maxBytes: number): Promise<Uint8Array>;
}

export interface AssetLibraryServiceOptions {
  readonly assetRepository: Pick<AssetRepository, "list" | "findById" | "save" | "delete">;
  readonly metadataRepository: AssetLibraryMetadataRepository;
  readonly assetStore: AssetLibraryStore;
  readonly alertRepository: Pick<AlertRepository, "listCollections" | "listRules">;
  readonly ruleMetadataRepository: Pick<AlertSetMetadataRepository, "findRule">;
  readonly effectRepository?: Pick<ScreenEffectRepository, "list"> | undefined;
  readonly timerRepository?: Pick<TimerDefinitionRepository, "list"> | undefined;
  readonly deletePersistedAsset?: ((assetId: string) => void) | undefined;
  readonly findEditorDocuments?: (ids: readonly string[]) => Promise<ReadonlyMap<string, import("@stream-jams/core").AlertEditorDocument>>;
  readonly clock?: () => Date;
  readonly durationCatalog?: AssetDurationCatalog | undefined;
  readonly metadataProbe?: MediaMetadataProbe | undefined;
  /** Runtime retirement is committed atomically with asset metadata; never rename pinned files. */
  readonly mediaLifetime?: { readonly mutate: <T>(work: () => Promise<T>) => Promise<T> };
}

export class AssetLibraryNotFoundError extends Error {
  constructor(readonly assetId: string) {
    super(`Asset "${assetId}" was not found`);
    this.name = "AssetLibraryNotFoundError";
  }
}

export class AssetLibraryInUseError extends Error {
  constructor(readonly impact: AssetChangeImpact, options?: ErrorOptions) {
    super(`Asset "${impact.assetId}" is used by ${impact.owners.length} saved playback contexts`, options);
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
    const [usages, moduleUsages] = await Promise.all([
      this.#deriveUsage(collections, rules),
      this.#deriveModuleUsages()
    ]);
    return Promise.all(records.map((record) => this.#toItem(
      record,
      usages.get(record.id) ?? [],
      moduleUsages.get(record.id) ?? []
    )));
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
    const metadata = await this.#options.metadataRepository.save({
      assetId: record.id,
      displayName: input?.displayName?.trim() || record.originalFileName,
      tags: normalizeAssetTags(input?.tags ?? []),
      createdAt: timestamp,
      updatedAt: timestamp
    });
    this.#options.durationCatalog?.store(record);
    return metadata;
  }

  async getChangeImpact(assetId: string, candidateMediaType?: AssetMediaType): Promise<AssetChangeImpact> {
    const item = await this.getItem(assetId);
    const alertOwners = item.usage.usages.map((usage): ModuleMediaReference => ({
      moduleId: "alerts",
      ownerId: usage.alertId,
      ownerName: usage.alertName,
      variantId: null
    }));
    const moduleOwners = item.moduleUsages ?? [];
    const owners = uniqueOwners([...alertOwners, ...moduleOwners]);
    const warnings: string[] = [];
    if (item.usage.totalUsageCount > 0) {
      warnings.push(`${item.usage.totalUsageCount} alert usage${item.usage.totalUsageCount === 1 ? "" : "s"} will update everywhere.`);
    }
    const effectOwners = moduleOwners.filter((owner) => owner.moduleId === "screen-effects");
    if (effectOwners.length > 0) {
      warnings.push(`${effectOwners.length} Screen Effect usage${effectOwners.length === 1 ? "" : "s"} will update everywhere.`);
    }
    const timerOwners = moduleOwners.filter((owner) => owner.moduleId === "timers");
    if (timerOwners.length > 0) {
      warnings.push(`${timerOwners.length} Timer usage${timerOwners.length === 1 ? "" : "s"} will update everywhere.`);
    }
    if (candidateMediaType !== undefined && candidateMediaType !== item.mediaType) {
      warnings.push(`Media type changes from ${item.mediaType} to ${candidateMediaType}; review every affected layer.`);
    }
    return {
      assetId,
      usage: item.usage,
      owners,
      canDelete: owners.length === 0,
      requiresConfirmation: warnings.length > 0,
      warnings
    };
  }

  async deleteAsset(assetId: string): Promise<void> {
    if (this.#options.mediaLifetime !== undefined) {
      return this.#options.mediaLifetime.mutate(async () => {
        const impact = await this.getChangeImpact(assetId);
        if (!impact.canDelete) throw new AssetLibraryInUseError(impact);
        await this.#findRecord(assetId);
        if (this.#options.deletePersistedAsset === undefined) {
          throw new Error("Deferred asset deletion requires an atomic metadata mutation");
        }
        this.#options.deletePersistedAsset(assetId);
        this.#options.durationCatalog?.invalidate(assetId);
      });
    }
    const impact = await this.getChangeImpact(assetId);
    if (!impact.canDelete) throw new AssetLibraryInUseError(impact);
    const record = await this.#findRecord(assetId);
    const metadata = await this.#options.metadataRepository.find(assetId);
    const stagedDeletion = await this.#options.assetStore.stageDelete(record.storagePath);
    try {
      if (this.#options.deletePersistedAsset === undefined) {
        await this.#options.metadataRepository.delete(assetId);
        await this.#options.assetRepository.delete(assetId);
      } else {
        this.#options.deletePersistedAsset(assetId);
      }
      await stagedDeletion.commit();
      this.#options.durationCatalog?.invalidate(assetId);
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
      if (isForeignKeyConstraintError(error)) {
        const currentImpact = await this.getChangeImpact(assetId);
        if (!currentImpact.canDelete) throw new AssetLibraryInUseError(currentImpact, { cause: error });
      }
      throw error;
    }
  }

  async completeReplacement(previous: AssetRecord, replacement: AssetRecord): Promise<AssetLibraryItem> {
    if (previous.id !== replacement.id) {
      throw new TypeError("Asset replacement must preserve the asset ID");
    }
    if (this.#options.mediaLifetime === undefined && previous.storagePath !== replacement.storagePath) {
      await this.#options.assetStore.delete(previous.storagePath);
    }
    const metadata = await this.#metadata(replacement);
    await this.#options.metadataRepository.save({ ...metadata, updatedAt: this.#clock().toISOString() });
    this.#options.durationCatalog?.store(replacement);
    return this.getItem(replacement.id);
  }

  async repairDuration(assetId: string): Promise<AssetLibraryItem> {
    const record = await this.#findRecord(assetId);
    if ((record.mediaType !== "audio" && record.mediaType !== "video") || record.durationMs !== null) {
      return this.getItem(assetId);
    }
    if (this.#options.assetStore.readBounded === undefined || this.#options.metadataProbe === undefined) {
      return this.getItem(assetId);
    }
    try {
      const bytes = await this.#options.assetStore.readBounded(record.storagePath, record.sizeBytes);
      const result = await this.#options.metadataProbe.inspect({
        mediaType: record.mediaType,
        mimeType: record.mimeType,
        sizeBytes: bytes.byteLength,
        bytes
      });
      if (result.durationMs !== null) {
        const updated = await this.#options.assetRepository.save({ ...record, durationMs: result.durationMs });
        this.#options.durationCatalog?.store(updated);
      }
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      // A valid legacy asset remains usable; automatic timing displays its documented fallback.
    }
    return this.getItem(assetId);
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

  async #toItem(
    record: AssetRecord,
    usages: AssetLibraryItem["usage"]["usages"],
    moduleUsages: readonly ModuleMediaReference[]
  ): Promise<AssetLibraryItem> {
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
      durationMs: record.durationMs,
      health,
      tags: metadata.tags,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      usage: { assetId: record.id, totalUsageCount: usages.length, usages },
      moduleUsages
    });
  }

  async #deriveUsage(collections: readonly AlertCollection[], rules: readonly AlertRule[]) {
    const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
    const usage = new Map<string, AssetLibraryItem["usage"]["usages"]>();
    const documents = await this.#options.findEditorDocuments?.(rules.flatMap(rule => [rule.id, ...rule.variants.map(variant => variant.id)])) ?? new Map();
    for (const rule of rules) {
      const referencedAssetIds = new Set(
        rule.variants.flatMap((variant) => [variant.visualAssetId, variant.audioAssetId]).filter((id): id is string => id !== null)
      );
      for (const editorId of [rule.id, ...rule.variants.map(variant => variant.id)]) {
        for (const layer of documents.get(editorId)?.layers ?? []) {
          if (layer.type === "text" && layer.textStyle.fontAssetId) referencedAssetIds.add(layer.textStyle.fontAssetId);
          if (layer.type === "image" || layer.type === "video" || layer.type === "audio") referencedAssetIds.add(layer.assetId);
        }
      }
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

  async #deriveModuleUsages(): Promise<ReadonlyMap<string, readonly ModuleMediaReference[]>> {
    const [effects, timers] = await Promise.all([
      this.#options.effectRepository?.list() ?? [],
      this.#options.timerRepository?.list() ?? []
    ]);
    const usages = new Map<string, ModuleMediaReference[]>();
    const add = (assetId: string | null, usage: ModuleMediaReference) => {
      if (assetId === null) return;
      usages.set(assetId, [...(usages.get(assetId) ?? []), usage]);
    };
    for (const effect of effects) {
      for (const variant of effect.variants) {
        const usage = {
          moduleId: "screen-effects",
          ownerId: effect.id,
          ownerName: effect.name,
          variantId: variant.id
        } satisfies ModuleMediaReference;
        add(variant.visual?.assetId ?? null, usage);
        add(variant.sound?.assetId ?? null, usage);
      }
    }
    for (const timer of timers) {
      const base = { moduleId: "timers", ownerId: timer.id, ownerName: timer.label, variantId: null } as const;
      add(timer.iconAssetId, { ...base, usageRole: "icon" });
      add(timer.startAudioAssetId, { ...base, usageRole: "start-audio" });
      add(timer.endAudioAssetId, { ...base, usageRole: "end-audio" });
    }
    return usages;
  }
}

function uniqueOwners(owners: readonly ModuleMediaReference[]): ModuleMediaReference[] {
  return [...new Map(owners.map((owner) => [
    `${owner.moduleId}:${owner.ownerId}:${owner.variantId ?? ""}:${owner.usageRole ?? ""}`,
    owner
  ])).values()];
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && /foreign key constraint/iu.test(error.message);
}
