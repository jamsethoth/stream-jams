import { mkdtemp, rm } from "node:fs/promises";
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
});

async function createTemporaryAssetDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}
