import { overlayModuleConfigSchema } from "./schemas.js";
import type { OverlayModuleRegistry } from "./module-registry.js";
import type { OverlayModuleConfig, OverlayModuleDefinition } from "./types.js";

export interface SaveOverlayModuleConfigInput {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: unknown;
}

export interface OverlayModuleConfigRepository {
  getModuleConfig(moduleId: string): Promise<OverlayModuleConfig | null>;
  saveModuleConfig(config: OverlayModuleConfig): Promise<void>;
}

export interface OverlayModuleConfigService {
  getModuleConfig(moduleId: string): Promise<OverlayModuleConfig>;
  saveModuleConfig(input: SaveOverlayModuleConfigInput): Promise<OverlayModuleConfig>;
  setModuleEnabled(moduleId: string, enabled: boolean): Promise<OverlayModuleConfig>;
}

export class UnknownOverlayModuleError extends Error {
  constructor(readonly moduleId: string) {
    super(`Unknown overlay module "${moduleId}"`);
    this.name = "UnknownOverlayModuleError";
  }
}

export class InvalidOverlayModuleConfigError extends Error {
  constructor(readonly moduleId: string) {
    super(`Invalid overlay module config for "${moduleId}"`);
    this.name = "InvalidOverlayModuleConfigError";
  }
}

export interface OverlayModuleConfigServiceDependencies {
  readonly registry: OverlayModuleRegistry;
  readonly repository: OverlayModuleConfigRepository;
  readonly clock?: () => Date;
}

export class DefaultOverlayModuleConfigService implements OverlayModuleConfigService {
  readonly #registry: OverlayModuleRegistry;
  readonly #repository: OverlayModuleConfigRepository;
  readonly #clock: () => Date;

  constructor(dependencies: OverlayModuleConfigServiceDependencies) {
    this.#registry = dependencies.registry;
    this.#repository = dependencies.repository;
    this.#clock = dependencies.clock ?? (() => new Date());
  }

  async getModuleConfig(moduleId: string): Promise<OverlayModuleConfig> {
    const moduleDefinition = this.#getModuleDefinition(moduleId);
    const savedConfig = await this.#repository.getModuleConfig(moduleId);

    if (savedConfig === null) {
      return {
        moduleId,
        enabled: moduleDefinition.defaultEnabled,
        config: cloneConfig(moduleDefinition.defaultConfig),
        updatedAt: this.#clock().toISOString()
      };
    }

    return this.#parseConfig(moduleDefinition, savedConfig);
  }

  async saveModuleConfig(input: SaveOverlayModuleConfigInput): Promise<OverlayModuleConfig> {
    const moduleDefinition = this.#getModuleDefinition(input.moduleId);
    const config = this.#parseConfig(moduleDefinition, {
      moduleId: input.moduleId,
      enabled: input.enabled,
      config: validateModuleConfig(moduleDefinition, input.config),
      updatedAt: this.#clock().toISOString()
    });

    await this.#repository.saveModuleConfig(config);
    return config;
  }

  async setModuleEnabled(moduleId: string, enabled: boolean): Promise<OverlayModuleConfig> {
    const currentConfig = await this.getModuleConfig(moduleId);
    const nextConfig = this.#parseConfig(this.#getModuleDefinition(moduleId), {
      ...currentConfig,
      enabled,
      updatedAt: this.#clock().toISOString()
    });

    await this.#repository.saveModuleConfig(nextConfig);
    return nextConfig;
  }

  #getModuleDefinition(moduleId: string) {
    const moduleDefinition = this.#registry.getModule(moduleId);
    if (moduleDefinition === null) {
      throw new UnknownOverlayModuleError(moduleId);
    }

    return moduleDefinition;
  }

  #parseConfig(moduleDefinition: OverlayModuleDefinition, config: OverlayModuleConfig): OverlayModuleConfig {
    const result = overlayModuleConfigSchema.safeParse(config);
    if (!result.success) {
      throw new InvalidOverlayModuleConfigError(config.moduleId);
    }

    validateModuleConfig(moduleDefinition, result.data.config);
    return result.data;
  }
}

export class InMemoryOverlayModuleConfigRepository implements OverlayModuleConfigRepository {
  readonly #configsByModuleId = new Map<string, OverlayModuleConfig>();

  constructor(configs: readonly OverlayModuleConfig[] = []) {
    for (const config of configs) {
      this.#configsByModuleId.set(config.moduleId, config);
    }
  }

  async getModuleConfig(moduleId: string): Promise<OverlayModuleConfig | null> {
    return this.#configsByModuleId.get(moduleId) ?? null;
  }

  async saveModuleConfig(config: OverlayModuleConfig): Promise<void> {
    this.#configsByModuleId.set(config.moduleId, config);
  }
}

function cloneConfig<TConfig>(config: TConfig): TConfig {
  return structuredClone(config);
}

function validateModuleConfig(moduleDefinition: OverlayModuleDefinition, config: unknown): unknown {
  if (moduleDefinition.configSchema === undefined) {
    return cloneConfig(config);
  }

  const result = moduleDefinition.configSchema.safeParse(config);
  if (!result.success) {
    throw new InvalidOverlayModuleConfigError(moduleDefinition.id);
  }

  return cloneConfig(result.data);
}
