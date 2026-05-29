import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  constructor(options: FileConfigStoreOptions) {
    this.#configFilePath = options.configFilePath;
    this.#defaultConfig = parseAppConfig(options.defaultConfig);
  }

  async readConfig(): Promise<AppConfig> {
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

  async updateConfig(patch: AppConfigUpdate): Promise<AppConfig> {
    const current = await this.readConfig();
    const parsedPatch = appConfigUpdateSchema.parse(patch);
    const nextConfig = parseAppConfig({
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
      }
    });

    await this.#writeConfig(nextConfig);
    return nextConfig;
  }

  async #writeConfig(config: AppConfig): Promise<void> {
    await mkdir(dirname(this.#configFilePath), { recursive: true });
    await writeFile(this.#configFilePath, `${JSON.stringify(parseAppConfig(config), null, 2)}\n`, "utf8");
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
