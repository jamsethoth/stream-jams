import {
  createScreenEffectDocument,
  createDefaultMusicModuleConfig,
  compatibilityAlertTextStyle,
  type AlertEditorDocument,
  screenEffectDocumentSchema,
  type AlertCollection,
  type AlertRule,
  type AssetRecord,
  type ScreenEffectDocument,
  type TimerDefinition
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { AssetLibraryInUseError, AssetLibraryService, InvalidMusicAssetReferenceError, type AssetLibraryMetadata } from "./asset-library-service.js";

describe("AssetLibraryService", () => {
  it("does not convert an English foreign-key lookalike into an in-use domain error", async () => {
    const error = new Error("foreign key constraint private failure");
    const fixture = createFixture({ rules: [], deleteError: error, rulesAfterDeleteError: [rule] });
    await expect(fixture.service.deleteAsset(asset.id)).rejects.toBe(error);
  });

  it("uses the native SQLite extended code for raced foreign-key references", async () => {
    const error = sqliteConstraint("DELETE FROM parent WHERE id = 1");
    expect(error).toMatchObject({ code: "ERR_SQLITE_ERROR", errcode: 787 });
    const fixture = createFixture({ rules: [], deleteError: error, rulesAfterDeleteError: [rule] });
    await expect(fixture.service.deleteAsset(asset.id)).rejects.toMatchObject({ impact: { canDelete: false }, cause: error });
  });

  it("does not convert unrelated native SQLite constraints into in-use failures", async () => {
    const error = sqliteConstraint("INSERT INTO parent VALUES (1)");
    const fixture = createFixture({ rules: [], deleteError: error, rulesAfterDeleteError: [rule] });
    await expect(fixture.service.deleteAsset(asset.id)).rejects.toBe(error);
  });
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

  it("reports module-qualified Screen Effect owners and blocks deletion", async () => {
    const effect = imageEffect();
    const fixture = createFixture({ rules: [], effects: [effect] });

    await expect(fixture.service.getChangeImpact("asset-image-1")).resolves.toMatchObject({
      canDelete: false,
      owners: [{
        moduleId: "screen-effects",
        ownerId: effect.id,
        ownerName: effect.name,
        variantId: effect.variants[0]!.id
      }],
      warnings: ["1 Screen Effect usage will update everywhere."]
    });
    await expect(fixture.service.deleteAsset("asset-image-1")).rejects.toMatchObject({
      impact: {
        canDelete: false,
        owners: [expect.objectContaining({ moduleId: "screen-effects", ownerId: effect.id })]
      }
    });
  });

  it("reports every Timer asset role separately and blocks deletion", async () => {
    const timer = timerDefinition();
    const fixture = createFixture({ rules: [], timers: [timer] });

    await expect(fixture.service.getChangeImpact("asset-image-1")).resolves.toMatchObject({
      canDelete: false,
      owners: [
        { moduleId: "timers", ownerId: timer.id, ownerName: timer.label, variantId: null, usageRole: "icon" },
        { moduleId: "timers", ownerId: timer.id, ownerName: timer.label, variantId: null, usageRole: "start-audio" },
        { moduleId: "timers", ownerId: timer.id, ownerName: timer.label, variantId: null, usageRole: "end-audio" }
      ],
      warnings: ["3 Timer usages will update everywhere."]
    });
    await expect(fixture.service.deleteAsset("asset-image-1")).rejects.toBeInstanceOf(AssetLibraryInUseError);
  });

  it("reports each Music view and font owner and blocks deletion even when compact is hidden", async () => {
    const music = createDefaultMusicModuleConfig();
    for (const profile of ["landscape", "vertical"] as const) for (const view of ["full", "compact"] as const) {
      music.profiles[profile].views[view].branding.assetId = asset.id;
    }
    music.profiles.landscape.views.compact.titleFont.fontAssetId = asset.id;
    music.profiles.landscape.views.compact.detailsFont.fontAssetId = asset.id;
    const fixture = createFixture({ rules: [], music });
    const impact = await fixture.service.getChangeImpact(asset.id);
    expect(impact.canDelete).toBe(false);
    expect(impact.owners).toHaveLength(6);
    expect(impact.owners).toEqual(expect.arrayContaining([
      { moduleId: "music", ownerId: "vertical", ownerName: "Music vertical", variantId: "compact", usageRole: "branding" },
      { moduleId: "music", ownerId: "landscape", ownerName: "Music landscape", variantId: "compact", usageRole: "title-font" },
      { moduleId: "music", ownerId: "landscape", ownerName: "Music landscape", variantId: "compact", usageRole: "details-font" }
    ]));
    await expect(fixture.service.deleteAsset(asset.id)).rejects.toBeInstanceOf(AssetLibraryInUseError);
  });

  it("rejects missing, unavailable and incompatible Music references before save", async () => {
    const music = createDefaultMusicModuleConfig();
    music.profiles.vertical.views.compact.branding.assetId = asset.id;
    const fixture = createFixture({ rules: [] });
    await expect(fixture.service.validateMusicAssetReferences(music)).resolves.toBeUndefined();
    fixture.store.health = "missing";
    await expect(fixture.service.validateMusicAssetReferences(music)).rejects.toBeInstanceOf(InvalidMusicAssetReferenceError);
    fixture.store.health = "available";
    fixture.assets.records[0] = { ...asset, mimeType: "image/gif", mediaType: "gif" };
    await expect(fixture.service.validateMusicAssetReferences(music)).rejects.toBeInstanceOf(InvalidMusicAssetReferenceError);
    fixture.assets.records.splice(0);
    await expect(fixture.service.validateMusicAssetReferences(music)).rejects.toBeInstanceOf(InvalidMusicAssetReferenceError);
  });

  it("rejects image assets in Music font roles and converts inspect failure into an invalid save", async () => {
    const music = createDefaultMusicModuleConfig();
    music.profiles.landscape.views.full.titleFont.fontAssetId = asset.id;
    const fixture = createFixture({ rules: [] });
    await expect(fixture.service.validateMusicAssetReferences(music)).rejects.toMatchObject({ reason: "incompatible" });
    music.profiles.landscape.views.full.titleFont.fontAssetId = null;
    music.profiles.landscape.views.full.branding.assetId = asset.id;
    fixture.store.health = "broken";
    await expect(fixture.service.validateMusicAssetReferences(music)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("resolves current versioned Music assets and reports references lost after load", async () => {
    const music = createDefaultMusicModuleConfig();
    music.profiles.landscape.views.full.branding.assetId = asset.id;
    music.profiles.landscape.views.compact.branding.assetId = asset.id;
    music.profiles.vertical.views.full.branding.assetId = "other";
    const fixture = createFixture({ rules: [] });
    const first = await fixture.service.resolveMusicAssets(music, "landscape");
    expect(first.assets).toEqual([expect.objectContaining({ assetId: asset.id, mimeType: "image/png", version: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(first.missingAssetIds).toEqual([]);
    fixture.assets.records[0] = { ...asset, checksum: "sha256:new", storagePath: "image/new.png" };
    const second = await fixture.service.resolveMusicAssets(music, "landscape");
    expect(second.assets[0]?.version).not.toBe(first.assets[0]?.version);
    fixture.store.health = "missing";
    expect(await fixture.service.resolveMusicAssets(music, "landscape")).toEqual({ assets: [], missingAssetIds: [asset.id] });
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

  it("translates a raced database asset reference into the existing in-use error", async () => {
    const fixture = createFixture({
      rules: [],
      rulesAfterDeleteError: [rule],
      deleteError: sqliteConstraint("DELETE FROM parent WHERE id = 1")
    });

    await expect(fixture.service.deleteAsset("asset-image-1")).rejects.toBeInstanceOf(AssetLibraryInUseError);
    expect(fixture.store.rolledBack).toEqual([asset.storagePath]);
  });

  it("repairs missing timed-media duration with bounded bytes and refreshes the catalog", async () => {
    const timedAsset: AssetRecord = {
      ...asset,
      id: "asset-video",
      originalFileName: "clip.mp4",
      mediaType: "video",
      mimeType: "video/mp4",
      storagePath: "video/asset-video.mp4"
    };
    const repository = new MemoryAssetRepository([timedAsset]);
    const store = new MemoryStore();
    const catalog = { getMany: vi.fn(), store: vi.fn(), invalidate: vi.fn() };
    const probe = { inspect: vi.fn(async () => ({ durationMs: 7_500 })) };
    const service = new AssetLibraryService({
      assetRepository: repository,
      metadataRepository: new MemoryMetadataRepository(),
      assetStore: store,
      alertRepository: { async listCollections() { return []; }, async listRules() { return []; } },
      ruleMetadataRepository: { async findRule() { return null; } },
      durationCatalog: catalog,
      metadataProbe: probe
    });

    await expect(service.repairDuration(timedAsset.id)).resolves.toMatchObject({ durationMs: 7_500 });
    expect(store.reads).toEqual([[timedAsset.storagePath, timedAsset.sizeBytes]]);
    expect(probe.inspect).toHaveBeenCalledWith(expect.objectContaining({ sizeBytes: 4 }));
    expect(catalog.store).toHaveBeenCalledWith(expect.objectContaining({ id: timedAsset.id, durationMs: 7_500 }));
  });
});

function sqliteConstraint(statement: string): Error {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO parent VALUES (1); INSERT INTO child VALUES (1)");
    try { database.exec(statement); } catch (error) { if (error instanceof Error) return error; throw error; }
    throw new Error("Expected a native constraint failure");
  } finally { database.close(); }
}

function createFixture(options: {
  readonly rules?: readonly AlertRule[];
  readonly targetProfileIds?: readonly ("landscape" | "vertical")[];
  readonly deleteError?: Error;
  readonly rulesAfterDeleteError?: readonly AlertRule[];
  readonly effects?: readonly ScreenEffectDocument[];
  readonly timers?: readonly TimerDefinition[];
  readonly documents?: ReadonlyMap<string, AlertEditorDocument>;
  readonly music?: ReturnType<typeof createDefaultMusicModuleConfig>;
} = {}) {
  const assets = new MemoryAssetRepository([asset], options.deleteError);
  const metadata = new MemoryMetadataRepository();
  const store = new MemoryStore();
  const service = new AssetLibraryService({
    assetRepository: assets,
    findEditorDocuments: async () => options.documents ?? new Map(),
    metadataRepository: metadata,
    assetStore: store,
    alertRepository: {
      async listCollections() { return collections; },
      async listRules() {
        return assets.deleteAttempted && options.rulesAfterDeleteError !== undefined
          ? options.rulesAfterDeleteError
          : options.rules ?? [rule];
      }
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
    effectRepository: {
      async list() { return options.effects ?? []; }
    },
    timerRepository: {
      list() { return options.timers ?? []; }
    },
    getMusicConfig: async () => options.music ?? null,
    clock: () => new Date("2026-07-15T08:00:00.000Z")
  });
  return { service, assets, metadata, store };
}

class MemoryAssetRepository {
  deleteAttempted = false;
  constructor(readonly records: AssetRecord[], readonly deleteError?: Error) {}
  async list() { return this.records; }
  async findById(assetId: string) { return this.records.find((record) => record.id === assetId) ?? null; }
  async save(record: AssetRecord) { this.records.splice(0, this.records.length, ...this.records.filter((item) => item.id !== record.id), record); return record; }
  async delete(assetId: string) {
    this.deleteAttempted = true;
    if (this.deleteError !== undefined) throw this.deleteError;
    this.records.splice(0, this.records.length, ...this.records.filter((record) => record.id !== assetId));
  }
}

class MemoryMetadataRepository {
  readonly records = new Map<string, AssetLibraryMetadata>();
  async find(assetId: string) { return this.records.get(assetId) ?? null; }
  async save(metadata: AssetLibraryMetadata) { this.records.set(metadata.assetId, metadata); return metadata; }
  async delete(assetId: string) { this.records.delete(assetId); }
}

class MemoryStore {
  health: "available" | "missing" | "broken" = "available";
  readonly deleted: string[] = [];
  readonly staged: string[] = [];
  readonly committed: string[] = [];
  readonly rolledBack: string[] = [];
  readonly reads: [string, number][] = [];
  async inspect() { return this.health; }
  async delete(storagePath: string) { this.deleted.push(storagePath); }
  async readBounded(storagePath: string, maxBytes: number) { this.reads.push([storagePath, maxBytes]); return new Uint8Array([1, 2, 3, 4]); }
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
  storagePath: "image/asset-image-1.png",
  durationMs: null
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

function imageEffect(): ScreenEffectDocument {
  const draft = createScreenEffectDocument({
    id: "effect-image-owner",
    name: "Image owner",
    defaultVariantId: "variant-image-owner"
  });
  return screenEffectDocumentSchema.parse({
    ...draft,
    variants: [{
      ...draft.variants[0]!,
      visual: {
        mediaType: "image",
        assetId: asset.id,
        layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }
      },
      visualOutputs: { browserSource: true, desktop: false }
    }]
  });
}

function timerDefinition(): TimerDefinition {
  return {
    id: "timer-mitts",
    label: "Wear oven mitts",
    durationMs: 60_000,
    iconAssetId: asset.id,
    startAudioAssetId: asset.id,
    endAudioAssetId: asset.id,
    outputs: { browserSource: true, deviceRouteIds: [] },
    createdAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z"
  };
}

it("protects font references in saved secondary text documents", async () => {
  const document = { layers: [{ type: "text", textStyle: { ...compatibilityAlertTextStyle, fontAssetId: "asset-image-1" } }] } as unknown as AlertEditorDocument;
  const fixture = createFixture({ rules: [{ ...rule, variants: [{ ...rule.variants[0]!, visualAssetId: null }] }], documents: new Map([["variant-follow", document]]) });
  fixture.assets.records[0] = { ...asset, mediaType: "font", mimeType: "font/ttf" };
  expect((await fixture.service.getChangeImpact(asset.id)).owners).toEqual([expect.objectContaining({ moduleId: "alerts", ownerId: rule.id })]);
  await expect(fixture.service.deleteAsset(asset.id)).rejects.toBeInstanceOf(AssetLibraryInUseError);
});
