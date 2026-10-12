import {
  applyMusicContentGeometry, applyMusicDesktopPlacement, isOrdinaryOverlayOutput, resolveMusicOutputGeometry,
  type MusicOutputGeometry,
  type MusicModuleConfig,
  type OverlayModuleRuntime, type OverlayModuleSnapshot, type OverlayModuleSnapshotRequest,
  type OverlayTargetProfileId
} from "@stream-jams/core";
import type { AssetLibraryService } from "../assets/asset-library-service.js";
import type { MusicRuntimeCoordinator } from "./music-runtime-coordinator.js";

/** Ordinary browser profiles and trusted private desktop projections share saved appearance. */
export class MusicOutputRuntime implements OverlayModuleRuntime {
  readonly #geometry = new WeakMap<MusicModuleConfig, Partial<Record<OverlayTargetProfileId, MusicOutputGeometry>>>();
  constructor(private readonly dependencies: {
    readonly runtime: Pick<MusicRuntimeCoordinator, "getProjection" | "revision">;
    readonly assets: Pick<AssetLibraryService, "resolveMusicAssets">;
    readonly getConfig: () => Promise<MusicModuleConfig>;
  }) {}

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    if (request.recipientKind === "browser" && !isOrdinaryOverlayOutput(request, true)) return { moduleId: "music", enabled: true, instructions: [] };
    const targetProfileId: OverlayTargetProfileId = request.targetProfileId ?? "landscape";
    const revision = this.dependencies.runtime.revision;
    const config = request.savedConfig === undefined ? await this.dependencies.getConfig() : request.savedConfig.config as MusicModuleConfig;
    const projection = this.dependencies.runtime.getProjection(targetProfileId, config);
    if (projection === null) return { moduleId: "music", enabled: true, instructions: [] };
    let placed = request.recipientKind === "desktop" ? applyMusicDesktopPlacement(projection, config) : projection;
    if (request.recipientKind === "browser" && request.scope === "module") {
      const profiles = this.#geometry.get(config) ?? {};
      const geometry = profiles[targetProfileId] ??= resolveMusicOutputGeometry(config, targetProfileId);
      this.#geometry.set(config, profiles);
      placed = applyMusicContentGeometry(projection, geometry);
    }
    const { assets } = await this.dependencies.assets.resolveMusicAssets(config, targetProfileId);
    if (request.purpose === "live" && this.dependencies.runtime.revision !== revision) {
      return { moduleId: "music", enabled: true, instructions: [] };
    }
    return { moduleId: "music", enabled: true, instructions: [], presentation: {
      kind: "music-widget", widget: { ...placed, assets: [...assets] }
    } };
  }

}
