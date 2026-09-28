import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  appConfigSchema,
  appConfigUpdateSchema,
  type AppConfig,
  type AppConfigUpdate,
  type ConfigStore
} from "@stream-jams/core";

export interface FileConfigStoreOptions {
  readonly configFilePath: string;
  readonly defaultConfig: AppConfig;
}

/** Persists non-secret app configuration as validated JSON on the local filesystem. */
export class FileConfigStore implements ConfigStore {
  readonly #configFilePath: string;
  readonly #defaultConfig: AppConfig;
  #pending: Promise<unknown> = Promise.resolve();

  constructor(options: FileConfigStoreOptions) {
    this.#configFilePath = options.configFilePath;
    this.#defaultConfig = parseAppConfig(options.defaultConfig);
  }

  readConfig(): Promise<AppConfig> {
    return this.#serialize(() => this.#readConfig());
  }

  async #readConfig(): Promise<AppConfig> {
    try {
      const rawConfig = await readFile(this.#configFilePath, "utf8");
      return parseAppConfig(JSON.parse(rawConfig));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await this.#writeConfig(this.#defaultConfig);
        return this.#defaultConfig;
      }

      if (error instanceof SyntaxError || isInvalidAppConfigError(error)) {
        throw new Error("Invalid app config", { cause: error });
      }

      throw error;
    }
  }

  updateConfig(patch: AppConfigUpdate): Promise<AppConfig> {
    return this.#serialize(() => this.#updateConfig(patch));
  }

  #serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(work);
    this.#pending = result.catch(
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    () => undefined);
    return result;
  }

  async #updateConfig(patch: AppConfigUpdate): Promise<AppConfig> {
    const current = await this.#readConfig();
    const parsedPatch = appConfigUpdateSchema.parse(patch);
    const nextConfig = parseAppConfig({
      desktop: { ...current.desktop, ...parsedPatch.desktop },
      server: {
        ...current.server,
        ...parsedPatch.server
      },
      storage: {
        ...current.storage,
        ...parsedPatch.storage
      },
      logging: {
        ...current.logging,
        ...parsedPatch.logging
      },
      playback: {
        ...current.playback,
        ...parsedPatch.playback
      }
    });

    await this.#writeConfig(nextConfig);
    return nextConfig;
  }

  async #writeConfig(config: AppConfig): Promise<void> {
    await mkdir(dirname(this.#configFilePath), { recursive: true });
    const temporaryPath = `${this.#configFilePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(parseAppConfig(config), null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.#configFilePath);
    } catch (error) {
      try { await rm(temporaryPath, { force: true }); }
      catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Config write and temporary-file cleanup failed",
          // eslint-disable-next-line preserve-caught-error -- the outer write failure stays primary; cleanup remains secondary in errors
          { cause: error }
        );
      }
      throw error;
    }
  }
}

function parseAppConfig(value: unknown): AppConfig {
  const result = appConfigSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Invalid app config", { cause: result.error });
  }

  return result.data;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isInvalidAppConfigError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid app config";
}
