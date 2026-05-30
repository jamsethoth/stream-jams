import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    const storagePath = posix.join(input.mediaType, `${sanitizeFileNamePart(input.assetId)}${input.normalizedExtension}`);
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

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function isPathInsideDirectory(candidate: string, directory: string): boolean {
  return candidate === directory || candidate.startsWith(`${directory}${sep}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
