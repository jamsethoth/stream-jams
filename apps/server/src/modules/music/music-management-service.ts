import { NamedError } from "@stream-jams/core";
import {
  musicManagementStatusSchema,
  musicModuleConfigSchema,
  type MusicManagementStatus,
  type MusicModuleConfig
} from "@stream-jams/core";
import type { AssetLibraryService } from "../assets/asset-library-service.js";
import type { SqliteProviderRegistrationRepository } from "../providers/sqlite-provider-registration-repository.js";
import type { MusicRuntimeCoordinator } from "./music-runtime-coordinator.js";

export interface MusicManagementServiceOptions {
  readonly providers: Pick<SqliteProviderRegistrationRepository, "findActive" | "findById">;
  readonly runtime: Pick<MusicRuntimeCoordinator, "getStatus" | "reconcile">;
  readonly getConfig: () => Promise<{ readonly enabled: boolean; readonly config: unknown }>;
  readonly assets: Pick<AssetLibraryService, "resolveMusicAssets">;
}

export class MusicManagementService {
  constructor(private readonly options: MusicManagementServiceOptions) {}

  async getStatus(): Promise<MusicManagementStatus> {
    const [settings, active] = await Promise.all([
      this.options.getConfig(),
      this.options.providers.findActive("music-source")
    ]);
    const config: MusicModuleConfig = musicModuleConfigSchema.parse(settings.config);
    const [landscape, vertical] = await Promise.all([
      this.options.assets.resolveMusicAssets(config, "landscape"),
      this.options.assets.resolveMusicAssets(config, "vertical")
    ]);
    return musicManagementStatusSchema.parse({
      enabled: settings.enabled,
      selectedProviderId: active?.provider.id ?? null,
      status: this.options.runtime.getStatus(),
      missingAssetIds: {
        landscape: landscape.missingAssetIds,
        vertical: vertical.missingAssetIds
      }
    });
  }

  async reconnect(providerId: string): Promise<MusicManagementStatus> {
    const provider = await this.options.providers.findById(providerId);
    if (provider?.provider.capability !== "music-source") {
      throw new MusicSourceNotFoundError();
    }
    if (provider.provider.active) await this.options.runtime.reconcile();
    return this.getStatus();
  }
}

export class MusicSourceNotFoundError extends NamedError {
  constructor() { super("MusicSourceNotFoundError", "Music source was not found"); }
}
