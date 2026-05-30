import type { ModuleOutputRequest, OverlayComposition, OverlayScope, UnifiedOutputRequest } from "../overlays/types.js";
import type { OverlayModuleConfigService } from "./module-config-service.js";
import type { OverlayModuleSnapshot } from "./types.js";

export interface OverlayModuleSnapshotRequest {
  readonly moduleId: string;
  readonly overlayId: string;
  readonly purpose: "live" | "test";
  readonly scope: OverlayScope;
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
}

export class DefaultOverlayCompositionService implements OverlayCompositionService {
  readonly #configService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly #runtime: OverlayModuleRuntime;

  constructor(dependencies: OverlayCompositionServiceDependencies) {
    this.#configService = dependencies.configService;
    this.#runtime = dependencies.runtime;
  }

  async resolveModuleOutput(request: ModuleOutputRequest): Promise<OverlayComposition> {
    const snapshot = await this.#resolveEnabledSnapshot({ ...request, scope: "module" });

    return {
      overlayId: request.overlayId,
      purpose: request.purpose,
      scope: "module",
      modules: snapshot === null ? [] : [snapshot]
    };
  }

  async resolveUnifiedOutput(request: UnifiedOutputRequest): Promise<OverlayComposition> {
    const modules: OverlayModuleSnapshot[] = [];

    for (const moduleId of request.enabledModuleIds) {
      const snapshot = await this.#resolveEnabledSnapshot({
        moduleId,
        overlayId: request.overlayId,
        purpose: request.purpose,
        scope: "unified"
      });

      if (snapshot !== null) {
        modules.push(snapshot);
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
    if (snapshot.moduleId !== request.moduleId) {
      throw new InvalidOverlayModuleSnapshotError(request.moduleId, snapshot.moduleId);
    }

    return {
      ...snapshot,
      enabled: moduleConfig.enabled
    };
  }
}
