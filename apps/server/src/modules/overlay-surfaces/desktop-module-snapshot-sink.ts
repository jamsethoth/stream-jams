import type { DesktopOverlayTransport, Logger, OverlayModuleRuntime, SurfaceRepository } from "@stream-jams/core";
import type { DesktopVisualAssetResolver } from "./desktop-visual-asset-resolver.js";
import type { MusicArtworkService } from "../music/music-artwork-service.js";
import type { MusicRuntimeCoordinator } from "../music/music-runtime-coordinator.js";

export interface DesktopModuleSnapshotSinkDependencies {
  readonly transport: Pick<DesktopOverlayTransport, "syncModule">;
  readonly surfaces: Pick<SurfaceRepository, "list">;
  readonly runtime: OverlayModuleRuntime;
  readonly assets: Pick<DesktopVisualAssetResolver, "resolveTimerModule">;
  readonly music?: {
    readonly runtime: OverlayModuleRuntime;
    readonly coordinator: Pick<MusicRuntimeCoordinator, "getCurrentArtwork">;
    readonly assets: Pick<DesktopVisualAssetResolver, "resolveMusicModule" | "releaseMusicOwner">;
    readonly artwork: Pick<MusicArtworkService, "resolve" | "issueGrant" | "revokeRecipient">;
  };
  readonly logger?: Pick<Logger, "warn">;
  readonly generateReferenceId?: () => string;
}

export class DesktopModuleSnapshotSink {
  readonly #refresh: ReturnType<typeof setInterval>;
  #revision = 0;
  #musicRevision = 0;
  #musicOwner: string | null = null;
  #closed = false;
  constructor(private readonly dependencies: DesktopModuleSnapshotSinkDependencies) {
    this.#refresh = setInterval(() => { void Promise.all([this.sync(), this.syncMusic()]).catch((error: unknown) => this.dependencies.logger?.warn("Desktop module media refresh failed.", {
      module: "overlay", source: "desktop-overlay.modules.refresh-failed", correlationId: this.dependencies.generateReferenceId?.() ?? "module-refresh", processingId: null,
      metadata: { errorName: error instanceof Error ? error.name : "UnknownError" }
    })); }, 60000);
    this.#refresh.unref();
  }

  async syncMusic(): Promise<void> {
    const music = this.dependencies.music;
    if (this.#closed || music === undefined) return;
    const revision = ++this.#musicRevision;
    const surface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
    if (this.#closed || revision !== this.#musicRevision) return;
    const visible = surface?.kind === "desktop" && surface.enabled && surface.displayId !== null &&
      surface.layers.some(layer => layer.moduleId === "music" && layer.visible);
    const clear = async () => {
      music.artwork.revokeRecipient("desktop-music:desktop:primary");
      const previous = this.#musicOwner;
      this.#musicOwner = null;
      if (previous !== null) await music.assets.releaseMusicOwner(previous);
      await this.dependencies.transport.syncModule({ moduleId: "music", revision, presentation: null, assets: [], artwork: null });
    };
    if (!visible) { await clear(); return; }
    const snapshot = await music.runtime.getModuleSnapshot({ moduleId: "music", overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape" });
    if (this.#closed || revision !== this.#musicRevision) return;
    if (!snapshot.enabled || snapshot.presentation?.kind !== "music-widget") { await clear(); return; }
    const resolved = await music.assets.resolveMusicModule(snapshot.presentation);
    if (this.#closed || revision !== this.#musicRevision) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    const currentSurface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
    if (this.#closed || revision !== this.#musicRevision) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    if (currentSurface?.kind !== "desktop" || !currentSurface.enabled || currentSurface.displayId === null ||
      !currentSurface.layers.some(layer => layer.moduleId === "music" && layer.visible)) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      await clear();
      return;
    }
    let artwork: { ref: string; grant: { handle: string; expiresAt: number } } | null = null;
    const current = music.coordinator.getCurrentArtwork();
    if (current !== null && current.ref === resolved.presentation.widget.snapshot.track?.artworkRef &&
      current.owner.generation === resolved.presentation.widget.snapshot.generation) {
      const ref = await music.artwork.resolve(current.descriptor, current.owner, AbortSignal.timeout(5000));
      if (this.#closed || revision !== this.#musicRevision) {
        if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
        return;
      }
      const grantSurface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
      if (this.#closed || revision !== this.#musicRevision) {
        if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
        return;
      }
      if (grantSurface?.kind !== "desktop" || !grantSurface.enabled || grantSurface.displayId === null ||
        !grantSurface.layers.some(layer => layer.moduleId === "music" && layer.visible)) {
        if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
        await clear();
        return;
      }
      const expiresAt = Date.now() + 60_000;
      const handle = ref === null ? null : music.artwork.issueGrant(ref, current.owner, "desktop-music:desktop:primary", expiresAt);
      if (handle !== null) artwork = { ref: current.ref, grant: { handle, expiresAt } };
    }
    if (this.#closed || revision !== this.#musicRevision) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    try {
      await this.dependencies.transport.syncModule({ moduleId: "music", revision, presentation: resolved.presentation, assets: [...resolved.assets], artwork });
    } catch (error) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      throw error;
    }
    if (this.#closed || revision !== this.#musicRevision) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    const previous = this.#musicOwner;
    this.#musicOwner = resolved.ownerId;
    if (previous !== null && previous !== this.#musicOwner) await music.assets.releaseMusicOwner(previous);
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
    if (!snapshot.enabled || snapshot.presentation?.kind !== "timer-stack" || snapshot.presentation.stack.cards.length === 0) {
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
    this.dependencies.music?.artwork.revokeRecipient("desktop-music:desktop:primary");
    if (this.#musicOwner !== null) { await this.dependencies.music?.assets.releaseMusicOwner(this.#musicOwner); this.#musicOwner = null; }
    await this.dependencies.transport.syncModule({ moduleId: "timers", revision: ++this.#revision, presentation: null, assets: [] });
    if (this.dependencies.music !== undefined) await this.dependencies.transport.syncModule({ moduleId: "music", revision: ++this.#musicRevision, presentation: null, assets: [], artwork: null });
  }
}
