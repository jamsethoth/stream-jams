import type { AlertCollection, AlertRule, AssetRecord } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { AssetLibraryInUseError, AssetLibraryService, type AssetLibraryMetadata } from "./asset-library-service.js";

describe("AssetLibraryService", () => {
  it("builds searchable metadata, health, and set/event/profile usage summaries", async () => {
    const fixture = createFixture();

    await expect(fixture.service.listItems()).resolves.toEqual([
      expect.objectContaining({
        id: "asset-image-1",
        displayName: "follow.png",
        health: "available",
        tags: [],
        usage: {
          assetId: "asset-image-1",
          totalUsageCount: 1,
          usages: [{
            setId: "set-default",
            setName: "Default",
            eventType: "follow",
            alertId: "alert-follow",
            alertName: "New follower",
            targetProfileIds: ["landscape", "vertical"]
          }]
        }
      })
    ]);
  });

  it("normalizes editable tags and preserves the original creation time", async () => {
    const fixture = createFixture();
    await fixture.service.listItems();

    const updated = await fixture.service.updateMetadata("asset-image-1", {
      displayName: "Seasonal follow",
      tags: [" Seasonal ", "FOLLOW", "seasonal"]
    });

    expect(updated).toEqual(expect.objectContaining({ displayName: "Seasonal follow", tags: ["seasonal", "follow"] }));
    expect(fixture.metadata.records.get("asset-image-1")?.createdAt).toBe("2026-07-15T08:00:00.000Z");
  });

  it("reports replacement impact and blocks deleting an in-use asset", async () => {
    const fixture = createFixture();

    await expect(fixture.service.getChangeImpact("asset-image-1", "audio")).resolves.toEqual(expect.objectContaining({
      canDelete: false,
      requiresConfirmation: true,
      warnings: [
        "1 alert usage will update everywhere.",
        "Media type changes from image to audio; review every affected layer."
      ]
    }));
    await expect(fixture.service.deleteAsset("asset-image-1")).rejects.toBeInstanceOf(AssetLibraryInUseError);
  });

  it("keeps unassigned rules with no target profiles visible to deletion guards", async () => {
    const unassignedRule = { ...rule, collectionIds: [] };
    const fixture = createFixture({ rules: [unassignedRule], targetProfileIds: [] });

    const impact = await fixture.service.getChangeImpact("asset-image-1");

    expect(impact.canDelete).toBe(false);
    expect(impact.usage.usages).toEqual([expect.objectContaining({
      setId: null,
      setName: null,
      targetProfileIds: []
    })]);
  });

  it("deletes an explicitly requested unused asset and its file", async () => {
    const fixture = createFixture({ rules: [] });

    await fixture.service.deleteAsset("asset-image-1");

    expect(fixture.store.staged).toEqual([asset.storagePath]);
    expect(fixture.store.committed).toEqual([asset.storagePath]);
    expect(fixture.assets.records).toEqual([]);
  });

  it("restores staged files and metadata when repository deletion fails", async () => {
    const fixture = createFixture({ rules: [], deleteError: new Error("database unavailable") });
    await fixture.service.registerAsset(asset, { displayName: "Follower art", tags: ["follow"] });

    await expect(fixture.service.deleteAsset("asset-image-1")).rejects.toThrow("database unavailable");

    expect(fixture.store.rolledBack).toEqual([asset.storagePath]);
    expect(fixture.assets.records).toContainEqual(asset);
    expect(fixture.metadata.records.get(asset.id)).toMatchObject({ displayName: "Follower art" });
  });
});

function createFixture(options: {
  readonly rules?: readonly AlertRule[];
  readonly targetProfileIds?: readonly ("landscape" | "vertical")[];
  readonly deleteError?: Error;
} = {}) {
  const assets = new MemoryAssetRepository([asset], options.deleteError);
  const metadata = new MemoryMetadataRepository();
  const store = new MemoryStore();
  const service = new AssetLibraryService({
    assetRepository: assets,
    metadataRepository: metadata,
    assetStore: store,
    alertRepository: {
      async listCollections() { return collections; },
      async listRules() { return options.rules ?? [rule]; }
    },
    ruleMetadataRepository: {
      async findRule() {
        return {
          ruleId: rule.id,
          providerKind: "twitch",
          reviewState: "ready",
          targetProfileIds: options.targetProfileIds ?? ["landscape", "vertical"]
        };
      }
    },
    clock: () => new Date("2026-07-15T08:00:00.000Z")
  });
  return { service, assets, metadata, store };
}

class MemoryAssetRepository {
  constructor(readonly records: AssetRecord[], readonly deleteError?: Error) {}
  async list() { return this.records; }
  async findById(assetId: string) { return this.records.find((record) => record.id === assetId) ?? null; }
  async save(record: AssetRecord) { this.records.splice(0, this.records.length, ...this.records.filter((item) => item.id !== record.id), record); return record; }
  async delete(assetId: string) { if (this.deleteError !== undefined) throw this.deleteError; this.records.splice(0, this.records.length, ...this.records.filter((record) => record.id !== assetId)); }
}

class MemoryMetadataRepository {
  readonly records = new Map<string, AssetLibraryMetadata>();
  async find(assetId: string) { return this.records.get(assetId) ?? null; }
  async save(metadata: AssetLibraryMetadata) { this.records.set(metadata.assetId, metadata); return metadata; }
  async delete(assetId: string) { this.records.delete(assetId); }
}

class MemoryStore {
  readonly deleted: string[] = [];
  readonly staged: string[] = [];
  readonly committed: string[] = [];
  readonly rolledBack: string[] = [];
  async inspect() { return "available" as const; }
  async delete(storagePath: string) { this.deleted.push(storagePath); }
  async stageDelete(storagePath: string) {
    this.staged.push(storagePath);
    return {
      commit: async () => { this.committed.push(storagePath); },
      rollback: async () => { this.rolledBack.push(storagePath); }
    };
  }
}

const asset: AssetRecord = {
  id: "asset-image-1",
  originalFileName: "follow.png",
  mediaType: "image",
  mimeType: "image/png",
  sizeBytes: 1024,
  checksum: "sha256:asset",
  storagePath: "image/asset-image-1.png"
};

const collections: readonly AlertCollection[] = [{ id: "set-default", name: "Default", enabled: true }];

const rule: AlertRule = {
  id: "alert-follow",
  name: "New follower",
  eventType: "follow",
  enabled: true,
  collectionIds: ["set-default"],
  conditions: [],
  variants: [{
    id: "variant-follow",
    name: "Default",
    enabled: true,
    weight: 1,
    visualAssetId: "asset-image-1",
    audioAssetId: null,
    textTemplate: "Welcome {actor.displayName}",
    ttsConfig: null,
    durationMs: 5000,
    layout: { x: 0, y: 0, width: 640, height: 360, zIndex: 1 }
  }],
  cooldownSeconds: 0,
  priority: 0
};
