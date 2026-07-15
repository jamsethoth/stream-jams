import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AssetFileNotFoundError, AssetPathTraversalError, LocalAssetStore } from "./local-asset-store.js";

const temporaryDirectories: string[] = [];

describe("LocalAssetStore", () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
  });

  it("writes imported bytes under generated media-type paths", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });

    const result = await store.write({
      assetId: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      normalizedExtension: ".png",
      bytes: new Uint8Array([1, 2, 3])
    });

    expect(result).toEqual({ storagePath: "image/asset_1.png" });
    await expect(store.read("image/asset_1.png")).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("rejects path traversal and absolute paths before reading", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });

    await expect(store.read("../secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
    await expect(store.read("/tmp/secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
    await expect(store.read("image\\..\\secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
  });

  it("reports missing files without leaking arbitrary filesystem access", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });

    await expect(store.read("image/missing.png")).rejects.toBeInstanceOf(AssetFileNotFoundError);
  });

  it("inspects available, missing, and broken storage paths", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });
    await store.write({
      assetId: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      normalizedExtension: ".png",
      bytes: new Uint8Array([1, 2, 3])
    });
    await mkdir(join(assetDirectory, "broken"));

    await expect(store.inspect("image/asset_1.png")).resolves.toBe("available");
    await expect(store.inspect("image/asset_1.png", 4)).resolves.toBe("broken");
    await expect(store.inspect("image/missing.png")).resolves.toBe("missing");
    await expect(store.inspect("broken")).resolves.toBe("broken");
  });

  it("uses a versioned storage path for stable-ID replacement writes", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });

    await expect(store.write({
      assetId: "asset_1",
      originalFileName: "Replacement.PNG",
      mediaType: "image",
      normalizedExtension: ".png",
      storageVersion: "sha256:replacement",
      bytes: new Uint8Array([9, 8, 7])
    })).resolves.toEqual({ storagePath: "image/asset_1-sha256_replacement.png" });
  });

  it("deletes stored files and treats missing files as success", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });
    const { storagePath } = await store.write({
      assetId: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      normalizedExtension: ".png",
      bytes: new Uint8Array([1, 2, 3])
    });

    await expect(store.delete(storagePath)).resolves.toBeUndefined();
    await expect(store.inspect(storagePath)).resolves.toBe("missing");
    await expect(store.delete(storagePath)).resolves.toBeUndefined();
  });

  it("stages destructive deletion so callers can commit or roll back", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });
    const { storagePath } = await store.write({
      assetId: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      normalizedExtension: ".png",
      bytes: new Uint8Array([1, 2, 3])
    });

    const rollbackDeletion = await store.stageDelete(storagePath);
    await expect(store.inspect(storagePath)).resolves.toBe("missing");
    await rollbackDeletion.rollback();
    await expect(store.inspect(storagePath)).resolves.toBe("available");

    const committedDeletion = await store.stageDelete(storagePath);
    await committedDeletion.commit();
    await expect(store.inspect(storagePath)).resolves.toBe("missing");
  });

  it("rejects path traversal before inspection or deletion", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });

    await expect(store.inspect("../secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
    await expect(store.delete("../secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
  });
});

async function createTemporaryAssetDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}
