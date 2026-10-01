import type { DesktopOverlayTransport, Logger, OverlayModuleRuntime, SurfaceRepository } from "@stream-jams/core";
import type { DesktopVisualAssetResolver } from "./desktop-visual-asset-resolver.js";

export interface DesktopModuleSnapshotSinkDependencies {
  readonly transport: Pick<DesktopOverlayTransport, "syncModule">;
  readonly surfaces: Pick<SurfaceRepository, "list">;
  readonly runtime: OverlayModuleRuntime;
  readonly assets: Pick<DesktopVisualAssetResolver, "resolveTimerModule">;
  readonly logger?: Pick<Logger, "warn">;
  readonly generateReferenceId?: () => string;
}

export class DesktopModuleSnapshotSink {
  readonly #refresh: ReturnType<typeof setInterval>;
  #revision = 0;
  #closed = false;
  constructor(private readonly dependencies: DesktopModuleSnapshotSinkDependencies) {
    this.#refresh = setInterval(() => { void this.sync().catch((error: unknown) => this.dependencies.logger?.warn("Timer desktop media refresh failed.", {
      module: "timers", source: "desktop-overlay.timer-icons.refresh-failed", correlationId: this.dependencies.generateReferenceId?.() ?? "timer-refresh", processingId: null,
      metadata: { errorName: error instanceof Error ? error.name : "UnknownError" }
    })); }, 60000);
    this.#refresh.unref();
  }

  async sync(): Promise<void> {
    if (this.#closed) return;
    const revision = ++this.#revision;
    const surface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
    if (this.#closed || revision !== this.#revision) return;
    const visible = surface?.kind === "desktop" && surface.enabled && surface.displayId !== null &&
      surface.layers.some(layer => layer.moduleId === "timers" && layer.visible);
    if (!visible) {
      await this.dependencies.transport.syncModule({ moduleId: "timers", revision, presentation: null, assets: [] });
      return;
    }
    const snapshot = await this.dependencies.runtime.getModuleSnapshot({
      moduleId: "timers", overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape"
    });
    if (this.#closed || revision !== this.#revision) return;
    if (!snapshot.enabled || snapshot.presentation === undefined || snapshot.presentation.stack.cards.length === 0) {
      await this.dependencies.transport.syncModule({ moduleId: "timers", revision, presentation: null, assets: [] });
      return;
    }
    const resolved = await this.dependencies.assets.resolveTimerModule(snapshot.presentation);
    if (this.#closed || revision !== this.#revision) return;
    if (resolved.missingAssetIds.length > 0) {
      await this.dependencies.logger?.warn("Timer icons were omitted from the desktop overlay because their assets were unavailable.", {
        module: "timers", source: "desktop-overlay.timer-icons.unavailable",
        correlationId: this.dependencies.generateReferenceId?.() ?? `timer-desktop-${revision}`, processingId: null,
        metadata: { assetIds: resolved.missingAssetIds }
      });
    }
    if (this.#closed || revision !== this.#revision) return;
    await this.dependencies.transport.syncModule({ moduleId: "timers", revision, presentation: resolved.presentation, assets: [...resolved.assets] });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#refresh);
    await this.dependencies.transport.syncModule({ moduleId: "timers", revision: ++this.#revision, presentation: null, assets: [] });
  }
}
