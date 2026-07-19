import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { posix } from "node:path";
import type { AssetStorageWrite, MediaAssetStore } from "@stream-jams/core";

export interface LocalAssetStoreOptions {
  readonly assetDirectory: string;
}

export class AssetPathTraversalError extends Error {
  readonly storagePath: string;

  constructor(storagePath: string) {
    super(`Asset storage path is not contained in the asset directory: ${storagePath}`);
    this.name = "AssetPathTraversalError";
    this.storagePath = storagePath;
  }
}

export class AssetFileNotFoundError extends Error {
  readonly storagePath: string;

  constructor(storagePath: string) {
    super(`Asset file not found: ${storagePath}`);
    this.name = "AssetFileNotFoundError";
    this.storagePath = storagePath;
  }
}

export class LocalAssetStore implements MediaAssetStore {
  readonly #assetDirectory: string;

  constructor(options: LocalAssetStoreOptions) {
    this.#assetDirectory = resolve(options.assetDirectory);
  }

  async write(input: AssetStorageWrite): Promise<{ readonly storagePath: string }> {
    const version = input.storageVersion === undefined ? "" : `-${sanitizeFileNamePart(input.storageVersion)}`;
    const storagePath = posix.join(
      input.mediaType,
      `${sanitizeFileNamePart(input.assetId)}${version}${input.normalizedExtension}`
    );
    const absolutePath = this.#resolveStoragePath(storagePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes);
    return { storagePath };
  }

  async read(storagePath: string): Promise<Buffer> {
    const absolutePath = this.#resolveStoragePath(storagePath);
    try {
      return await readFile(absolutePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new AssetFileNotFoundError(storagePath);
      }

      throw error;
    }
  }

  async inspect(storagePath: string, expectedSizeBytes?: number): Promise<"available" | "missing" | "broken"> {
    const absolutePath = this.#resolveStoragePath(storagePath);
    try {
      const file = await stat(absolutePath);
      return file.isFile() && (expectedSizeBytes === undefined || file.size === expectedSizeBytes) ? "available" : "broken";
    } catch (error) {
      return isNodeError(error) && error.code === "ENOENT" ? "missing" : "broken";
    }
  }

  async delete(storagePath: string): Promise<void> {
    await rm(this.#resolveStoragePath(storagePath), { force: true });
  }

  async stageDelete(storagePath: string): Promise<{ readonly commit: () => Promise<void>; readonly rollback: () => Promise<void> }> {
    const originalPath = this.#resolveStoragePath(storagePath);
    const stagedStoragePath = posix.join(".trash", `${randomUUID()}-${posix.basename(storagePath)}`);
    const stagedPath = this.#resolveStoragePath(stagedStoragePath);
    await mkdir(dirname(stagedPath), { recursive: true });
    try {
      await rename(originalPath, stagedPath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return noOpStagedDeletion;
      throw error;
    }

    let pending = true;
    return {
      commit: async () => {
        if (!pending) return;
        await rm(stagedPath, { force: true });
        pending = false;
      },
      rollback: async () => {
        if (!pending) return;
        await mkdir(dirname(originalPath), { recursive: true });
        await rename(stagedPath, originalPath);
        pending = false;
      }
    };
  }

  #resolveStoragePath(storagePath: string): string {
    if (storagePath.includes("\\") || isAbsolute(storagePath) || posix.isAbsolute(storagePath)) {
      throw new AssetPathTraversalError(storagePath);
    }

    const normalized = posix.normalize(storagePath);
    if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
      throw new AssetPathTraversalError(storagePath);
    }

    const absolutePath = resolve(this.#assetDirectory, ...normalized.split(posix.sep));
    if (!isPathInsideDirectory(absolutePath, this.#assetDirectory)) {
      throw new AssetPathTraversalError(storagePath);
    }

    return absolutePath;
  }
}

const noOpStagedDeletion = {
  commit: async () => undefined,
  rollback: async () => undefined
} as const;

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function isPathInsideDirectory(candidate: string, directory: string): boolean {
  return candidate === directory || candidate.startsWith(`${directory}${sep}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
