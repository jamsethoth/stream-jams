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
  readonly configService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly runtime: OverlayModuleRuntime;
  readonly surfaceRepository?: Pick<SurfaceRepository, "list">;
}

export class DefaultOverlayCompositionService implements OverlayCompositionService {
  readonly #configService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly #runtime: OverlayModuleRuntime;
  readonly #surfaceRepository: Pick<SurfaceRepository, "list"> | undefined;

  constructor(dependencies: OverlayCompositionServiceDependencies) {
    this.#configService = dependencies.configService;
    this.#runtime = dependencies.runtime;
    this.#surfaceRepository = dependencies.surfaceRepository;
  }

  async resolveModuleOutput(request: ModuleOutputRequest): Promise<OverlayComposition> {
    const snapshot = await this.#resolveEnabledSnapshot({ ...request, scope: "module" });

    return {
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "module",
      ...(request.targetProfileId === undefined ? {} : { targetProfileId: request.targetProfileId }),
      modules: snapshot === null ? [] : [snapshot]
    };
  }

  async resolveUnifiedOutput(request: UnifiedOutputRequest): Promise<OverlayComposition> {
    const modules: OverlayModuleSnapshot[] = [];
    const surface = (await this.#surfaceRepository?.list())?.find(candidate =>
      candidate.kind === "unified-browser" && candidate.overlayId === request.overlayId);
    const layers = surface === undefined
      ? request.enabledModuleIds.map(moduleId => ({ moduleId, visible: true }))
      : reconcileSurfaceLayers(surface.layers, request.enabledModuleIds).reverse();

    for (const [zIndex, { moduleId, visible }] of layers.entries()) {
      const snapshot = await this.#resolveEnabledSnapshot({
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
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "unified",
      modules
    };
  }

  async #resolveEnabledSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot | null> {
    const moduleConfig = await this.#configService.getModuleConfig(request.moduleId);
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
