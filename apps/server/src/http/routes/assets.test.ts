import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DefaultAssetValidator,
  DefaultMediaImportPipeline,
  type AssetRecord,
  type AssetRepository
} from "@stream-jams/core";
import { afterEach, describe, expect, it } from "vitest";
import { createAssetRouteTestApp as createServerApp } from "./test-support/route-test-app.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";
import { LocalAssetStore } from "../../modules/assets/local-asset-store.js";
import { LocalMediaService, mediaVersion } from "../../modules/assets/local-media-service.js";
import { LocalOverlayAccessService } from "../../modules/overlays/overlay-access-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createTestManagementSecurity, managementTestHeaders } from "../test-support/management-security-fixture.js";

const temporaryDirectories: string[] = [];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBytes = Buffer.concat([pngSignature, Buffer.from([1, 2, 3])]);
const invalidBytes = Buffer.from("not a png", "utf8");
const replacementPngBytes = Buffer.concat([pngSignature, Buffer.from([9, 8, 7])]);

describe("asset routes", () => {
  it("serves scoped grants and exact owned overlay versions without granting management access", async () => {
    const access = createOverlayAccessService(["ovl_versions"]);
    const key = await access.createKey({ overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module" });
    const { app, authHeaders, store, repository, media } = await createAppWithAssets({ enableMedia: true, overlayAccessService: access });
    try {
      await app.inject({ method: "POST", url: "/assets/import", headers: { ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-file-name": "test.png", "x-stream-jams-mime-type": "image/png" }, payload: pngBytes });
      const owner = JSON.stringify(["alerts", "occurrence"]);
      const original = (await media!.acquire(owner, ["asset_1"])).get("asset_1")!;
      const grant = media!.issue(owner, "asset_1", "trusted-recipient", Date.now() + 60000);
      const capability = await app.inject({ url: `/media/${grant.handle}`, headers: { range: "bytes=8-" } });
      expect(capability.statusCode).toBe(206);
      expect(capability.rawPayload).toEqual(pngBytes.subarray(8));
      expect(capability.headers["referrer-policy"]).toBe("no-referrer");
      const management = await app.inject({ url: "/assets", headers: { authorization: `Bearer ${grant.handle}` } });
      expect(management.statusCode).toBe(401);
      const newer = await store.write({ assetId: "asset_1", mediaType: "image", originalFileName: "new.png", normalizedExtension: ".png", storageVersion: "new", bytes: replacementPngBytes });
      await media!.mutate(() => repository.save({ ...original, ...newer }));
      const overlayUrl = `/overlay/modules/alerts/live/${key.rawKey}/assets/asset_1`;
      const pinned = await app.inject({ url: `${overlayUrl}?version=${mediaVersion(original)}` });
      expect(pinned.rawPayload).toEqual(pngBytes);
      const invalid = await app.inject({ url: `${overlayUrl}?version=invalid` });
      expect(invalid.statusCode).toBe(404);
      expect(invalid.headers["content-range"]).toBeUndefined();
      await media!.release(owner);
      expect((await app.inject({ url: `/media/${grant.handle}` })).statusCode).toBe(404);
      expect((await app.inject({ url: `${overlayUrl}?version=${mediaVersion(original)}` })).statusCode).toBe(404);
      expect((await app.inject({ url: overlayUrl })).rawPayload).toEqual(replacementPngBytes);
      await expect.poll(() => store.activeReaders).toBe(0);
      await expect.poll(() => media!.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
    } finally { await app.close(); await media?.close(); }
  });
  it("validates checksum ETags before opening body streams and rejects weak If-Range", async () => {
    const { app, authHeaders, store } = await createAppWithAssets();
    try {
      await app.inject({ method: "POST", url: "/assets/import", headers: { ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-file-name": "test.png", "x-stream-jams-mime-type": "image/png" }, payload: pngBytes });
      // Any fallback to complete-body reads would fail this route.
      store.read = async () => { throw new Error("Whole-file playback read"); };
      const url = "/assets/asset_1/file";
      const initial = await app.inject({ url, headers: authHeaders });
      expect(initial.statusCode).toBe(200);
      expect(initial.headers["cache-control"]).toBe("no-store");
      const etag = initial.headers.etag as string;
      expect(etag).toMatch(/^"[^"]+"$/);
      for (const condition of [etag, `W/${etag}`, `"other", ${etag}`]) {
        const response = await app.inject({ url, headers: { ...authHeaders, "if-none-match": condition } });
        expect(response.statusCode).toBe(304);
        expect(response.body).toBe("");
      }
      for (const condition of [etag, `W/${etag}`, "Wed, 30 Sep 2026 00:00:00 GMT"]) {
        const response = await app.inject({ url, headers: { ...authHeaders, range: "bytes=1-3", "if-range": condition } });
        expect(response.statusCode).toBe(condition === etag ? 206 : 200);
      }
      const failed = await app.inject({ url, headers: { ...authHeaders, "if-match": '"other"', "if-none-match": etag } });
      expect(failed.statusCode).toBe(412);
      expect(store.activeReaders).toBe(0);
    } finally {
      await app.close();
    }
  });
  it.each(["management", "module", "unified"] as const)("serves authorized %s asset ranges and HEAD without widening access", async kind => {
    const access = createOverlayAccessService(["ovl_ranges"]);
    const key = await access.createKey({ overlayId: "default", moduleId: kind === "unified" ? null : "alerts", purpose: "live", scope: kind === "unified" ? "unified" : "module" });
    const { app, authHeaders } = await createAppWithAssets({ overlayAccessService: access });
    await app.inject({ method: "POST", url: "/assets/import", headers: { ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-file-name": "test.png", "x-stream-jams-mime-type": "image/png" }, payload: pngBytes });
    const url = kind === "management" ? "/assets/asset_1/file" : kind === "module"
      ? `/overlay/modules/alerts/live/${key.rawKey}/assets/asset_1` : `/overlay/unified/live/${key.rawKey}/assets/asset_1`;
    const headers = kind === "management" ? authHeaders : {};
    for (const [range, start, end] of [["bytes=1-3", 1, 3], ["bytes=8-", 8, 10], ["bytes=-3", 8, 10], ["bytes=8-99", 8, 10], ["bytes=-99", 0, 10]] as const) {
      const response = await app.inject({ method: "GET", url, headers: { ...headers, range } });
      expect(response.statusCode).toBe(206);
      expect(response.headers["accept-ranges"]).toBe("bytes");
      expect(response.headers["content-range"]).toBe(`bytes ${start}-${end}/11`);
      expect(response.headers["content-length"]).toBe(String(end - start + 1));
      expect(response.rawPayload).toEqual(pngBytes.subarray(start, end + 1));
    }
    for (const range of ["bytes=11-", "bytes=-0", "bytes=99999999999999999999-"]) {
      const response = await app.inject({ method: "GET", url, headers: { ...headers, range } });
      expect(response.statusCode).toBe(416);
      expect(response.headers["content-range"]).toBe("bytes */11");
      expect(response.rawPayload.length).toBe(0);
    }
    for (const range of ["items=1-3", "bytes=bad", "bytes=4-2", "bytes=0-1,3-4", "bytes=-"]) {
      const response = await app.inject({ method: "GET", url, headers: { ...headers, range } });
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(pngBytes);
    }
    const conditional = await app.inject({ method: "GET", url, headers: { ...headers, range: "bytes=1-3", "if-range": '"old"' } });
    expect(conditional.statusCode).toBe(200);
    expect(conditional.rawPayload).toEqual(pngBytes);
    const head = await app.inject({ method: "HEAD", url, headers: { ...headers, range: "bytes=1-3" } });
    expect(head.statusCode).toBe(200);
    expect(head.headers["content-length"]).toBe("11");
    expect(head.headers["accept-ranges"]).toBe("bytes");
    expect(head.rawPayload.length).toBe(0);
    if (kind !== "management") await access.revokeKey(key.record.id);
    const unauthorized = await app.inject({ method: "GET", url, headers: { range: "bytes=1-3" } });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["content-range"]).toBeUndefined();
    await app.close();
  });
  it.each(["icon", "start-audio", "end-audio"] as const)("rejects incompatible confirmed timer %s replacements without changing the original", async role => {
    const { app, authHeaders, repository } = await createAppWithAssets({ timerRole: role });
    const originalBytes = role === "icon" ? pngBytes : Buffer.from("ID3original");
    const original = await app.inject({ method: "POST", url: "/assets/import", headers: {
      ...authHeaders, "content-type": "application/octet-stream",
      "x-stream-jams-file-name": role === "icon" ? "Original.PNG" : "original.mp3",
      "x-stream-jams-mime-type": role === "icon" ? "image/png" : "audio/mpeg"
    }, payload: originalBytes });
    expect(original.statusCode).toBe(201);
    const record = original.json();
    const response = await app.inject({ method: "POST", url: "/assets/asset_1/replace", headers: {
      ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-confirm-impact": "true",
      "x-stream-jams-file-name": role === "icon" ? "cue.mp3" : "Replacement.PNG",
      "x-stream-jams-mime-type": role === "icon" ? "audio/mpeg" : "image/png"
    }, payload: role === "icon" ? Buffer.from("ID3audio") : replacementPngBytes });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_ASSET_REPLACEMENT", message: expect.stringContaining("incompatible") } });
    expect(await repository.findById("asset_1")).toEqual(record);
    expect((await app.inject({ method: "GET", url: "/assets/asset_1/file", headers: authHeaders })).rawPayload).toEqual(originalBytes);
  });
  it("rejects GIF replacement for a Music brand before changing stored bytes", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets({ musicRole: "branding" });
    const imported = await app.inject({ method: "POST", url: "/assets/import", headers: {
      ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-file-name": "brand.png", "x-stream-jams-mime-type": "image/png"
    }, payload: pngBytes });
    expect(imported.statusCode).toBe(201);
    const original = await repository.findById("asset_1");
    const response = await app.inject({ method: "POST", url: "/assets/asset_1/replace", headers: {
      ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-confirm-impact": "true",
      "x-stream-jams-file-name": "brand.gif", "x-stream-jams-mime-type": "image/gif"
    }, payload: Buffer.from("GIF89aexample") });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_ASSET_REPLACEMENT" } });
    expect(await repository.findById("asset_1")).toEqual(original);
    expect((await app.inject({ method: "GET", url: "/assets/asset_1/file", headers: authHeaders })).rawPayload).toEqual(pngBytes);
  });
  it("invalidates strict Music previews after a compatible asset replacement", async () => {
    const invalidated: string[] = [];
    const { app, authHeaders } = await createAppWithAssets({ musicRole: "branding", onAssetInvalidated: async id => { invalidated.push(id); } });
    await app.inject({ method: "POST", url: "/assets/import", headers: {
      ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-file-name": "brand.png", "x-stream-jams-mime-type": "image/png"
    }, payload: pngBytes });
    const replacement = await app.inject({ method: "POST", url: "/assets/asset_1/replace", headers: {
      ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-confirm-impact": "true",
      "x-stream-jams-file-name": "brand.png", "x-stream-jams-mime-type": "image/png"
    }, payload: replacementPngBytes });
    expect(replacement.statusCode).toBe(200);
    expect(invalidated).toEqual(["asset_1"]);
  });
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
  });

  it("allows a compatible GIF replacement for a timer icon", async () => {
    const { app, authHeaders, repository } = await createAppWithAssets({ timerRole: "icon" });
    await repository.save(createAssetRecord("asset_1", "image/asset_1.png"));
    const response = await app.inject({ method: "POST", url: "/assets/asset_1/replace", headers: {
      ...authHeaders, "content-type": "application/octet-stream", "x-stream-jams-confirm-impact": "true",
      "x-stream-jams-file-name": "icon.gif", "x-stream-jams-mime-type": "image/gif"
    }, payload: Buffer.from("GIF89aexample") });
    expect(response.statusCode).toBe(200);
    expect(await repository.findById("asset_1")).toMatchObject({ mediaType: "gif", mimeType: "image/gif" });
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
      storagePath: "image/asset_1.png",
      durationMs: null
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
  readonly enableMedia?: boolean;
  readonly overlayAccessService?: LocalOverlayAccessService;
  readonly replacementRequiresConfirmation?: boolean;
  readonly timerRole?: "icon" | "start-audio" | "end-audio";
  readonly musicRole?: "branding" | "title-font" | "details-font";
  readonly onAssetInvalidated?: (assetId: string) => Promise<void>;
} = {}) {
  const assetDirectory = await createTemporaryAssetDirectory();
  const repository = new InMemoryAssetRepository();
  const store = new LocalAssetStore({ assetDirectory });
  const media = options.enableMedia ? new LocalMediaService({ assets: repository, store, retirements: { list: () => [], isCurrent: () => false, forget: () => {} } }) : undefined;
  const pipeline = new DefaultMediaImportPipeline({
    validator: new DefaultAssetValidator(),
    repository,
    store,
    probe: { inspect: async () => ({ durationMs: null }) },
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
    ...(media === undefined ? {} : { localMediaService: media }),
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
          owners: [
            ...(options.timerRole === undefined ? [] : [{ moduleId: "timers" as const, ownerId: "timer", ownerName: "Timer", variantId: null, usageRole: options.timerRole }]),
            ...(options.musicRole === undefined ? [] : [{ moduleId: "music" as const, ownerId: "landscape", ownerName: "Music landscape", variantId: "full", usageRole: options.musicRole }])
          ],
          canDelete: !requiresConfirmation,
          requiresConfirmation: requiresConfirmation || options.musicRole !== undefined,
          warnings: requiresConfirmation ? ["1 alert usage will update everywhere."] : []
        };
      },
      async completeReplacement() {
        return {} as never;
      }
    },
    ...(options.onAssetInvalidated === undefined ? {} : { mediaPreviewService: { invalidateAsset: options.onAssetInvalidated } }),
    managementAuthPreHandler: createTestManagementSecurity(managementSessionService),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    ...(options.overlayAccessService === undefined ? {} : { overlayAccessService: options.overlayAccessService })
  });

  return {
    app,
    media,
    store,
    repository,
    authHeaders: managementTestHeaders(session, "POST")
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
    storagePath,
    durationMs: null
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
