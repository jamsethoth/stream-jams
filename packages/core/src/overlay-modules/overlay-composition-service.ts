import { moduleOutputCanvas, sceneOutputCanvas, type OutputCanvas } from "./output-canvas.js";
import type { OverlayModuleConfig } from "./types.js";
import type {
  ModuleOutputRequest,
  OverlayComposition,
  OverlayScope,
  OverlayTargetProfileId,
  UnifiedOutputRequest
} from "../overlays/types.js";
import type { OverlayModuleConfigService } from "./module-config-service.js";
import type { OverlayModuleSnapshot } from "./types.js";
import { reconcileSurfaceLayers, type SurfaceRepository } from "./surface-configuration.js";

export interface OverlayModuleSnapshotRequest {
  readonly recipientKind: "browser" | "desktop";
  /** One trusted saved capture for projection and its canvas; absent for direct private adapters. */
  readonly savedConfig?: OverlayModuleConfig;
  readonly moduleId: string;
  readonly overlayId: string;
  readonly purpose: "live" | "test";
  readonly scope: OverlayScope;
  readonly targetProfileId?: OverlayTargetProfileId | null;
}

export interface OverlayModuleRuntime {
  getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot>;
}

export interface OverlayCompositionService {
  resolveModuleOutput(request: ModuleOutputRequest): Promise<OverlayComposition>;
  resolveUnifiedOutput(request: UnifiedOutputRequest): Promise<OverlayComposition>;
}

export class InvalidOverlayModuleSnapshotError extends Error {
  constructor(
    readonly expectedModuleId: string,
    readonly actualModuleId: string
  ) {
    super(`Expected overlay module snapshot for "${expectedModuleId}" but received "${actualModuleId}"`);
    this.name = "InvalidOverlayModuleSnapshotError";
  }
}

export interface OverlayCompositionServiceDependencies {
  readonly configService: Pick<OverlayModuleConfigService, "getModuleConfig" | "subscribeSaved">;
  readonly runtime: OverlayModuleRuntime;
  readonly runtimeId?: string;
  readonly surfaceRepository?: Pick<SurfaceRepository, "list">;
}

export class DefaultOverlayCompositionService implements OverlayCompositionService {
  readonly runtimeId: string;
  #configRevision = 0;
  readonly #configCache = new Map<string, { config: OverlayModuleConfig; revision: number }>();
  readonly #canvasCache = new Map<string, OutputCanvas>();

  /** Call after repository replacement commits, and again after a rollback reload. Identity stays pinned. */
  resetConfigurationCache(): void {
    this.#advanceRevision();
    this.#configCache.clear();
    this.#canvasCache.clear();
  }

  committedModuleConfig(config: OverlayModuleConfig): void {
    this.#advanceRevision();
    this.#configCache.set(config.moduleId, { config: structuredClone(config), revision: this.#configRevision });
    this.#canvasCache.clear();
  }

  #advanceRevision(): void {
    if (this.#configRevision === Number.MAX_SAFE_INTEGER) throw new Error("Output configuration revision exhausted; restart the service.");
    this.#configRevision++;
  }

  async #captureConfig(moduleId: string): Promise<{ config: OverlayModuleConfig; revision: number }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cached = this.#configCache.get(moduleId);
      if (cached !== undefined) return cached;
      const revision = this.#configRevision;
      const config = await this.#configService.getModuleConfig(moduleId);
      if (revision !== this.#configRevision) continue;
      const capture = { config: structuredClone(config), revision };
      this.#configCache.set(moduleId, capture);
      return capture;
    }
    throw new Error("Output configuration changed repeatedly during capture; reconnect for current geometry.");
  }

  async getModuleOutputCanvas(request: Pick<ModuleOutputRequest, "moduleId" | "targetProfileId">): Promise<OutputCanvas> {
    const capture = await this.#captureConfig(request.moduleId);
    return this.#canvas(capture, request.targetProfileId, "browser");
  }

  #canvas(capture: { config: OverlayModuleConfig; revision: number }, profile: OverlayTargetProfileId | null | undefined, recipient: "browser" | "desktop"): OutputCanvas {
    const key = JSON.stringify([capture.config.moduleId, profile ?? null, recipient, capture.revision]);
    const cached = this.#canvasCache.get(key);
    if (cached !== undefined) return cached;
    const canvas = moduleOutputCanvas(capture.config, profile, recipient, capture.revision);
    this.#canvasCache.set(key, canvas);
    return canvas;
  }

  readonly #configService: Pick<OverlayModuleConfigService, "getModuleConfig" | "subscribeSaved">;
  readonly #runtime: OverlayModuleRuntime;
  readonly #surfaceRepository: Pick<SurfaceRepository, "list"> | undefined;

  constructor(dependencies: OverlayCompositionServiceDependencies) {
    this.runtimeId = dependencies.runtimeId ?? crypto.randomUUID();
    this.#configService = dependencies.configService;
    dependencies.configService.subscribeSaved?.(config => this.committedModuleConfig(config));
    this.#runtime = dependencies.runtime;
    this.#surfaceRepository = dependencies.surfaceRepository;
  }

  async resolveModuleOutput(request: ModuleOutputRequest): Promise<OverlayComposition> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const revision = this.#configRevision;
      const capture = await this.#captureConfig(request.moduleId);
      const canvas = this.#canvas(capture, request.targetProfileId, "browser");
      const snapshot = await this.#resolveEnabledSnapshot({ ...request, scope: "module", recipientKind: "browser", savedConfig: capture.config });
      if (revision !== this.#configRevision) continue;
      return { runtimeId: this.runtimeId, canvas, overlayId: request.overlayId, purpose: request.purpose, scope: "module",
        ...(request.targetProfileId === undefined ? {} : { targetProfileId: request.targetProfileId }), modules: snapshot === null ? [] : [snapshot] };
    }
    throw new Error("Output configuration changed repeatedly during snapshot; reconnect for current geometry.");
  }

  async resolveUnifiedOutput(request: UnifiedOutputRequest): Promise<OverlayComposition> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const revision = this.#configRevision;
      const composition = await this.#resolveUnifiedOutput(request, revision);
      if (revision === this.#configRevision) return composition;
    }
    throw new Error("Output configuration changed repeatedly during snapshot; reconnect for current geometry.");
  }

  async #resolveUnifiedOutput(request: UnifiedOutputRequest, revision: number): Promise<OverlayComposition> {
    const modules: OverlayModuleSnapshot[] = [];
    const surface = (await this.#surfaceRepository?.list())?.find(candidate =>
      candidate.kind === "unified-browser" && candidate.overlayId === request.overlayId);
    const layers = surface === undefined
      ? request.enabledModuleIds.map(moduleId => ({ moduleId, visible: true }))
      : reconcileSurfaceLayers(surface.layers, request.enabledModuleIds).reverse();

    for (const [zIndex, { moduleId, visible }] of layers.entries()) {
      const snapshot = await this.#resolveEnabledSnapshot({
        recipientKind: "browser",
        savedConfig: (await this.#captureConfig(moduleId)).config,
        moduleId,
        overlayId: request.overlayId,
        purpose: request.purpose,
        scope: "unified"
      });

      if (snapshot !== null) {
        // Retain media identity: surface membership changes presentation, not playback.
        modules.push(surface === undefined ? snapshot : { ...snapshot, surfaceLayer: { visible, zIndex } });
      }
    }

    return {
      runtimeId: this.runtimeId,
      canvas: sceneOutputCanvas(revision),
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "unified",
      modules
    };
  }

  async #resolveEnabledSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot | null> {
    const moduleConfig = request.savedConfig ?? (await this.#captureConfig(request.moduleId)).config;
    if (!moduleConfig.enabled) {
      return null;
    }

    const snapshot = await this.#runtime.getModuleSnapshot(request);
    validateSnapshotForRequest(snapshot, request);

    return {
      ...snapshot,
      enabled: moduleConfig.enabled
    };
  }
}

function validateSnapshotForRequest(snapshot: OverlayModuleSnapshot, request: OverlayModuleSnapshotRequest): void {
  if (snapshot.moduleId !== request.moduleId) {
    throw new InvalidOverlayModuleSnapshotError(request.moduleId, snapshot.moduleId);
  }

  for (const instruction of snapshot.instructions) {
    if (
      instruction.moduleId !== request.moduleId ||
      instruction.overlayId !== request.overlayId ||
      instruction.purpose !== request.purpose ||
      instruction.scope !== request.scope ||
      (instruction.targetProfileId ?? null) !== (request.targetProfileId ?? null)
    ) {
      throw new InvalidOverlayModuleSnapshotError(request.moduleId, instruction.moduleId);
    }
  }
}
