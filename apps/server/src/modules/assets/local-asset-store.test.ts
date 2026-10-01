import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AssetFileNotFoundError,
  AssetPathTraversalError,
  AssetReadLimitExceededError,
  LocalAssetStore
} from "./local-asset-store.js";

const temporaryDirectories: string[] = [];

describe("LocalAssetStore", () => {
  it("keeps an inspected file open across a path replacement", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });
    await writeFile(join(assetDirectory, "original"), "original");
    const opened = await store.openRead("original", 8);
    try {
      await rename(join(assetDirectory, "original"), join(assetDirectory, "retired"));
      await writeFile(join(assetDirectory, "original"), "replaced");
      const chunks = [];
      for await (const chunk of opened.handle.createReadStream({ start: 2, end: 4, highWaterMark: 65536 })) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe("igi");
    } finally {
      await opened.close();
    }
    expect(store.activeReaders).toBe(0);
  });

  it("rejects a junction outside the asset root and mismatched file sizes", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const outside = await createTemporaryAssetDirectory();
    await writeFile(join(outside, "secret"), "secret");
    await symlink(outside, join(assetDirectory, "escape"), "junction");
    const store = new LocalAssetStore({ assetDirectory });
    await expect(store.openRead("escape/secret", 6)).rejects.toBeInstanceOf(AssetPathTraversalError);
    await expect(store.delete("escape/secret")).rejects.toBeInstanceOf(AssetPathTraversalError);
    expect(await new LocalAssetStore({ assetDirectory: outside }).read("secret")).toEqual(Buffer.from("secret"));
    await writeFile(join(assetDirectory, "changed"), "changed");
    await expect(store.openRead("changed", 2)).rejects.toThrow("changed");
    expect(store.activeReaders).toBe(0);
  });

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
    await expect(store.readBounded("../secret.txt", 1)).rejects.toBeInstanceOf(AssetPathTraversalError);
    await expect(store.read("/tmp/secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
    await expect(store.read("image\\..\\secret.txt")).rejects.toBeInstanceOf(AssetPathTraversalError);
  });

  it("reports missing files without leaking arbitrary filesystem access", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });

    await expect(store.read("image/missing.png")).rejects.toBeInstanceOf(AssetFileNotFoundError);
  });

  it("reads through an explicit byte limit without allocating an oversized file", async () => {
    const assetDirectory = await createTemporaryAssetDirectory();
    const store = new LocalAssetStore({ assetDirectory });
    await store.write({
      assetId: "tone",
      originalFileName: "tone.mp3",
      mediaType: "audio",
      normalizedExtension: ".mp3",
      bytes: new Uint8Array([1, 2, 3, 4])
    });

    await expect(store.readBounded("audio/tone.mp3", 3)).rejects.toBeInstanceOf(AssetReadLimitExceededError);
    await expect(store.readBounded("audio/tone.mp3", 4)).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
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

it("refuses an in-root retirement junction instead of deleting its current or unrelated target", async () => {
  const assetDirectory = await mkdtemp(join(tmpdir(), "stream-jams-retirement-alias-"));
  const store = new LocalAssetStore({ assetDirectory });
  try {
    await mkdir(join(assetDirectory, "current"));
    await writeFile(join(assetDirectory, "current", "protected.webm"), "current bytes");
    await symlink(join(assetDirectory, "current"), join(assetDirectory, "retired"), "junction");
    await expect(store.delete("retired/protected.webm")).rejects.toBeInstanceOf(AssetPathTraversalError);
    expect(await store.read("current/protected.webm")).toEqual(Buffer.from("current bytes"));
    expect(await store.inspect("retired/protected.webm")).toBe("available");
  } finally { await rm(assetDirectory, { recursive: true, force: true }); }
});
