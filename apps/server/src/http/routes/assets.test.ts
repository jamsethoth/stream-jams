import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DefaultAssetValidator,
  DefaultMediaImportPipeline,
  NoopMediaTranscodingStage,
  type AssetRecord,
  type AssetRepository
} from "@stream-jams/core";
import { afterEach, describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { LocalAssetStore } from "../../modules/assets/local-asset-store.js";
import { LocalOverlayAccessService } from "../../modules/overlays/overlay-access-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

const temporaryDirectories: string[] = [];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBytes = Buffer.concat([pngSignature, Buffer.from([1, 2, 3])]);
const invalidBytes = Buffer.from("not a png", "utf8");
const replacementPngBytes = Buffer.concat([pngSignature, Buffer.from([9, 8, 7])]);

describe("asset routes", () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
  });

  it("lists imported assets for authenticated management clients", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets();
    await repository.save(createAssetRecord("asset_1", "image/asset_1.png"));

    const response = await app.inject({
      method: "GET",
      url: "/assets",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([createAssetRecord("asset_1", "image/asset_1.png")]);
  });

  it("imports and serves accepted media through asset ids", async () => {
    const { app, authHeaders } = await createAppWithAssets();

    const importResponse = await app.inject({
      method: "POST",
      url: "/assets/import",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "Alert.PNG",
        "x-stream-jams-mime-type": "image/png"
      },
      payload: pngBytes
    });

    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.json()).toEqual({
      id: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
      checksum: "sha256:test",
      storagePath: "image/asset_1.png"
    });

    const fileResponse = await app.inject({
      method: "GET",
      url: "/assets/asset_1/file",
      headers: authHeaders
    });

    expect(fileResponse.statusCode).toBe(200);
    expect(fileResponse.headers["content-type"]).toContain("image/png");
    expect(fileResponse.headers["x-content-type-options"]).toBe("nosniff");
    expect(fileResponse.rawPayload).toEqual(pngBytes);
  });

  it("accepts imports above Fastify's default body limit when they fit the asset policy", async () => {
    const { app, authHeaders } = await createAppWithAssets();
    const payload = Buffer.alloc(1_048_576 + pngSignature.byteLength + 1);
    pngSignature.copy(payload, 0);

    const response = await app.inject({
      method: "POST",
      url: "/assets/import",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "large.png",
        "x-stream-jams-mime-type": "image/png"
      },
      payload
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "asset_1",
      originalFileName: "large.png",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: payload.byteLength,
      storagePath: "image/asset_1.png"
    });
  });

  it("rejects invalid media imports before persisting metadata", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets();

    const response = await app.inject({
      method: "POST",
      url: "/assets/import",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "photo.png",
        "x-stream-jams-mime-type": "image/jpeg"
      },
      payload: pngBytes
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_ASSET_IMPORT",
        message: "File extension does not match media type"
      }
    });
    await expect(repository.list()).resolves.toEqual([]);
  });

  it("rejects media imports whose bytes do not match their declared type", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets();

    const response = await app.inject({
      method: "POST",
      url: "/assets/import",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "photo.png",
        "x-stream-jams-mime-type": "image/png"
      },
      payload: invalidBytes
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_ASSET_IMPORT",
        message: "File signature does not match media type"
      }
    });
    await expect(repository.list()).resolves.toEqual([]);
  });

  it("preserves asset identity and requires impact confirmation for in-use replacement", async () => {
    const { app, authHeaders } = await createAppWithAssets({ replacementRequiresConfirmation: true });
    await app.inject({
      method: "POST",
      url: "/assets/import",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "Alert.PNG",
        "x-stream-jams-mime-type": "image/png"
      },
      payload: pngBytes
    });

    const blocked = await app.inject({
      method: "POST",
      url: "/assets/asset_1/replace",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "Replacement.PNG",
        "x-stream-jams-mime-type": "image/png"
      },
      payload: replacementPngBytes
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: { code: "ASSET_REPLACEMENT_CONFIRMATION_REQUIRED" },
      impact: { assetId: "asset_1", requiresConfirmation: true }
    });

    const replaced = await app.inject({
      method: "POST",
      url: "/assets/asset_1/replace",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "Replacement.PNG",
        "x-stream-jams-mime-type": "image/png",
        "x-stream-jams-confirm-impact": "true"
      },
      payload: replacementPngBytes
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toMatchObject({ id: "asset_1", originalFileName: "Replacement.PNG" });

    const file = await app.inject({ method: "GET", url: "/assets/asset_1/file", headers: authHeaders });
    expect(file.rawPayload).toEqual(replacementPngBytes);
  });

  it("rejects missing management sessions before listing assets", async () => {
    const { app, repository } = await createAppWithAssets();

    const response = await app.inject({
      method: "GET",
      url: "/assets"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_SESSION_REQUIRED"
      }
    });
    expect(repository.listCount).toBe(0);
  });

  it("returns structured diagnostics for missing asset records and files", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets();

    const missingRecord = await app.inject({
      method: "GET",
      url: "/assets/missing/file",
      headers: authHeaders
    });

    expect(missingRecord.statusCode).toBe(404);
    expect(missingRecord.json()).toEqual({
      error: {
        code: "ASSET_NOT_FOUND",
        message: "Asset not found"
      }
    });

    await repository.save(createAssetRecord("asset_missing_file", "image/missing.png"));
    const missingFile = await app.inject({
      method: "GET",
      url: "/assets/asset_missing_file/file",
      headers: authHeaders
    });

    expect(missingFile.statusCode).toBe(404);
    expect(missingFile.json()).toEqual({
      error: {
        code: "ASSET_FILE_NOT_FOUND",
        message: "Asset file not found"
      }
    });
  });

  it("rejects traversal storage records before reading the filesystem", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets();
    await repository.save(createAssetRecord("asset_bad_path", "../secret.txt"));

    const response = await app.inject({
      method: "GET",
      url: "/assets/asset_bad_path/file",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "ASSET_STORAGE_PATH_INVALID",
        message: "Asset storage path is invalid"
      }
    });
  });

  it("serves overlay media only through scoped overlay route keys", async () => {
    const overlayAccessService = createOverlayAccessService([
      "ovl_moduleLive",
      "ovl_revoked",
      "ovl_unifiedLive"
    ]);
    const moduleKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape"
    });
    const revokedKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: "alerts",
      purpose: "live",
      scope: "module"
    });
    const unifiedKey = await overlayAccessService.createKey({
      overlayId: "default",
      moduleId: null,
      purpose: "live",
      scope: "unified"
    });
    await overlayAccessService.revokeKey(revokedKey.record.id);
    const { app, authHeaders, repository } = await createAppWithAssets({ overlayAccessService });

    await app.inject({
      method: "POST",
      url: "/assets/import",
      headers: {
        ...authHeaders,
        "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "Alert.PNG",
        "x-stream-jams-mime-type": "image/png"
      },
      payload: pngBytes
    });
    await repository.save(createAssetRecord("asset_bad_overlay_path", "../secret.txt"));

    const valid = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${moduleKey.rawKey}/assets/asset_1?profile=landscape`
    });
    const wrongProfile = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${moduleKey.rawKey}/assets/asset_1?profile=vertical`
    });
    const invalidKey = await app.inject({
      method: "GET",
      url: "/overlay/modules/alerts/live/ovl_wrong/assets/asset_1"
    });
    const revoked = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${revokedKey.rawKey}/assets/asset_1`
    });
    const wrongScope = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${unifiedKey.rawKey}/assets/asset_1`
    });
    const missing = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${moduleKey.rawKey}/assets/missing?profile=landscape`
    });
    const badStoragePath = await app.inject({
      method: "GET",
      url: `/overlay/modules/alerts/live/${moduleKey.rawKey}/assets/asset_bad_overlay_path?profile=landscape`
    });

    expect(valid.statusCode).toBe(200);
    expect(valid.headers["cache-control"]).toBe("no-store");
    expect(valid.headers["content-type"]).toContain("image/png");
    expect(valid.headers["x-content-type-options"]).toBe("nosniff");
    expect(valid.rawPayload).toEqual(pngBytes);
    expect(invalidKey.statusCode).toBe(401);
    expect(wrongProfile.statusCode).toBe(401);
    expect(revoked.statusCode).toBe(401);
    expect(wrongScope.statusCode).toBe(401);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: {
        code: "OVERLAY_ASSET_NOT_FOUND",
        message: "Overlay asset not found"
      }
    });
    expect(badStoragePath.statusCode).toBe(404);
    expect(JSON.stringify(badStoragePath.json())).not.toContain("../secret.txt");
  });
});

async function createAppWithAssets(options: {
  readonly overlayAccessService?: LocalOverlayAccessService;
  readonly replacementRequiresConfirmation?: boolean;
} = {}) {
  const assetDirectory = await createTemporaryAssetDirectory();
  const repository = new InMemoryAssetRepository();
  const store = new LocalAssetStore({ assetDirectory });
  const pipeline = new DefaultMediaImportPipeline({
    validator: new DefaultAssetValidator(),
    repository,
    store,
    transcoder: new NoopMediaTranscodingStage(),
    generateId: () => "asset_1",
    calculateChecksum: () => "sha256:test"
  });
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-30T06:00:00.000Z"),
    generateId: () => "mgmt_asset-route-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-30T06:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    assetRepository: repository,
    mediaImportPipeline: pipeline,
    assetStore: store,
    assetLibraryService: {
      async registerAsset() {
        return {} as never;
      },
      async getChangeImpact(assetId) {
        const requiresConfirmation = options.replacementRequiresConfirmation ?? false;
        return {
          assetId,
          usage: {
            assetId,
            totalUsageCount: requiresConfirmation ? 1 : 0,
            usages: requiresConfirmation
              ? [{
                  setId: "set-default",
                  setName: "Default",
                  eventType: "follow" as const,
                  alertId: "alert-follow",
                  alertName: "New follower",
                  targetProfileIds: ["landscape" as const]
                }]
              : []
          },
          canDelete: !requiresConfirmation,
          requiresConfirmation,
          warnings: requiresConfirmation ? ["1 alert usage will update everywhere."] : []
        };
      },
      async completeReplacement() {
        return {} as never;
      }
    },
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    ...(options.overlayAccessService === undefined ? {} : { overlayAccessService: options.overlayAccessService })
  });

  return {
    app,
    repository,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
}

function createOverlayAccessService(rawKeys: readonly string[]): LocalOverlayAccessService {
  let rawKeyIndex = 0;
  let id = 0;
  return new LocalOverlayAccessService({
    clock: () => new Date("2026-05-30T12:00:00.000Z"),
    generateId: () => {
      id += 1;
      return `key-${id}`;
    },
    generateRawKey: () => {
      const rawKey = rawKeys[rawKeyIndex];
      rawKeyIndex += 1;
      if (rawKey === undefined) {
        throw new Error("Missing raw key fixture");
      }

      return rawKey;
    }
  });
}

function createAssetRecord(id: string, storagePath: string): AssetRecord {
  return {
    id,
    originalFileName: "Alert.PNG",
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: 3,
    checksum: "sha256:test",
    storagePath
  };
}

async function createTemporaryAssetDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-route-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}

class InMemoryAssetRepository implements AssetRepository {
  readonly #records = new Map<string, AssetRecord>();
  listCount = 0;

  async save(record: AssetRecord): Promise<AssetRecord> {
    this.#records.set(record.id, record);
    return record;
  }

  async findById(assetId: string): Promise<AssetRecord | null> {
    return this.#records.get(assetId) ?? null;
  }

  async findManyByIds(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>> {
    return new Map(assetIds.flatMap((assetId) => {
      const record = this.#records.get(assetId);
      return record === undefined ? [] : [[assetId, record]];
    }));
  }

  async list(): Promise<readonly AssetRecord[]> {
    this.listCount += 1;
    return Array.from(this.#records.values());
  }

  async delete(assetId: string): Promise<void> {
    this.#records.delete(assetId);
  }
}
