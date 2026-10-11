import {
  applyMusicDesktopPlacement, projectMusicWidget,
  type MusicModuleConfig, type MusicSnapshot, type MusicWidgetProjection,
  type OverlayModuleRuntime, type OverlayModuleSnapshot, type OverlayModuleSnapshotRequest,
  type OverlayTargetProfileId
} from "@stream-jams/core";
import type { AssetLibraryService } from "../assets/asset-library-service.js";
import type { MusicRuntimeCoordinator } from "./music-runtime-coordinator.js";

const fixtureSnapshot: MusicSnapshot = {
  providerId: "music-fixture", generation: "fixture", revision: 1,
  track: { id: "sample-track", title: "Sample track", artists: ["Sample artist"], album: "Sample album", artworkRef: null },
  playbackState: "playing", positionMs: 0, durationMs: 180_000, observedAtEpochMs: 0, session: null
};

/** A test output has a local fixture; it never reads or starts the selected source. */
export class MusicOutputRuntime implements OverlayModuleRuntime {
  constructor(private readonly dependencies: {
    readonly runtime: Pick<MusicRuntimeCoordinator, "getProjection" | "revision">;
    readonly assets: Pick<AssetLibraryService, "resolveMusicAssets">;
    readonly getConfig: () => Promise<MusicModuleConfig>;
    readonly now?: () => number;
  }) {}

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const targetProfileId: OverlayTargetProfileId = request.targetProfileId ?? "landscape";
    const revision = this.dependencies.runtime.revision;
    const config = request.savedConfig === undefined ? await this.dependencies.getConfig() : request.savedConfig.config as MusicModuleConfig;
    const projection = request.purpose === "test" ? await this.#fixture(targetProfileId, config) : this.dependencies.runtime.getProjection(targetProfileId, config);
    if (projection === null) return { moduleId: "music", enabled: true, instructions: [] };
    const placed = request.recipientKind === "desktop"
      ? applyMusicDesktopPlacement(projection, config) : projection;
    const { assets } = await this.dependencies.assets.resolveMusicAssets(config, targetProfileId);
    if (request.purpose === "live" && this.dependencies.runtime.revision !== revision) {
      return { moduleId: "music", enabled: true, instructions: [] };
    }
    return { moduleId: "music", enabled: true, instructions: [], presentation: {
      kind: "music-widget", widget: { ...placed, assets: [...assets] }
    } };
  }

  async #fixture(targetProfileId: OverlayTargetProfileId, config: MusicModuleConfig): Promise<MusicWidgetProjection | null> {
    const now = (this.dependencies.now ?? Date.now)();
    return projectMusicWidget({ ...fixtureSnapshot, observedAtEpochMs: now },
      { state: "connected", stale: false, diagnosticReference: null },
      config, targetProfileId, now, now);
  }
}
