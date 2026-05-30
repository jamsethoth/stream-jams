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
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";

const temporaryDirectories: string[] = [];

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
      payload: Buffer.from([1, 2, 3])
    });

    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.json()).toEqual({
      id: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: 3,
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
    expect(fileResponse.rawPayload).toEqual(Buffer.from([1, 2, 3]));
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
      payload: Buffer.from([1, 2, 3])
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
});

async function createAppWithAssets() {
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
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });

  return {
    app,
    repository,
    authHeaders: {
      authorization: `Bearer ${session.id}`
    }
  };
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

  async list(): Promise<readonly AssetRecord[]> {
    this.listCount += 1;
    return Array.from(this.#records.values());
  }

  async delete(assetId: string): Promise<void> {
    this.#records.delete(assetId);
  }
}
