import type { DesktopModuleSync, DesktopOverlayTransport, Logger, OverlayModuleRuntime, SurfaceRepository } from "@stream-jams/core";
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
    readonly coordinator: Pick<MusicRuntimeCoordinator, "getCurrentArtwork" | "revision">;
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
  #musicRequest = 0;
  #musicFrame: { command: DesktopModuleSync; identity: string | null; sourceRevision: number } | null = null;
  #musicArtwork: { identity: string; value: NonNullable<DesktopModuleSync["artwork"]> } | null = null;
  #pendingArtwork: { identity: string; controller: AbortController } | null = null;
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
    const request = ++this.#musicRequest;
    const sourceRevision = music.coordinator.revision;
    const obsolete = () => this.#closed || request !== this.#musicRequest || sourceRevision !== music.coordinator.revision;
    const surface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
    if (obsolete()) return;
    const visible = surface?.kind === "desktop" && surface.enabled && surface.displayId !== null &&
      surface.layers.some(layer => layer.moduleId === "music" && layer.visible);
    const clear = async () => {
      this.#cancelArtwork();
      this.#musicFrame = null;
      this.#musicArtwork = null;
      music.artwork.revokeRecipient("desktop-music:desktop:primary");
      const previous = this.#musicOwner;
      this.#musicOwner = null;
      if (previous !== null) await music.assets.releaseMusicOwner(previous);
      if (obsolete()) return;
      await this.dependencies.transport.syncModule({ moduleId: "music", revision: ++this.#musicRevision, presentation: null, assets: [], artwork: null });
    };
    if (!visible) { await clear(); return; }
    const snapshot = await music.runtime.getModuleSnapshot({ moduleId: "music", overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape" });
    if (obsolete()) return;
    if (!snapshot.enabled || snapshot.presentation?.kind !== "music-widget") { await clear(); return; }
    const resolved = await music.assets.resolveMusicModule(snapshot.presentation);
    if (obsolete()) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    const currentSurface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
    if (obsolete()) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    if (currentSurface?.kind !== "desktop" || !currentSurface.enabled || currentSurface.displayId === null ||
      !currentSurface.layers.some(layer => layer.moduleId === "music" && layer.visible)) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      await clear();
      return;
    }
    const current = music.coordinator.getCurrentArtwork();
    const identity = current !== null && current.ref === resolved.presentation.widget.snapshot.track?.artworkRef &&
      current.owner.generation === resolved.presentation.widget.snapshot.generation &&
      current.owner.providerId === resolved.presentation.widget.snapshot.providerId
      ? JSON.stringify([current.owner.providerId, current.owner.generation, current.ref]) : null;
    if (this.#pendingArtwork?.identity !== identity) this.#cancelArtwork();
    if (this.#musicArtwork?.identity !== identity || this.#musicArtwork.value.grant.expiresAt <= Date.now()) this.#musicArtwork = null;
    const artwork = this.#musicArtwork?.value ?? null;
    if (obsolete()) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    try {
      const command: DesktopModuleSync = { moduleId: "music", revision: ++this.#musicRevision, presentation: resolved.presentation, assets: [...resolved.assets], artwork };
      await this.dependencies.transport.syncModule(command);
      if (!obsolete()) this.#musicFrame = { command, identity, sourceRevision };
    } catch (error) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      throw error;
    }
    if (obsolete()) {
      if (resolved.ownerId !== null) await music.assets.releaseMusicOwner(resolved.ownerId);
      return;
    }
    const previous = this.#musicOwner;
    this.#musicOwner = resolved.ownerId;
    if (previous !== null && previous !== this.#musicOwner) await music.assets.releaseMusicOwner(previous);
    if (!obsolete() && identity !== null && current !== null && artwork === null && this.#pendingArtwork === null) {
      const pending = { identity, controller: new AbortController() };
      this.#pendingArtwork = pending;
      void this.#attachArtwork(current, pending).catch((error: unknown) => this.dependencies.logger?.warn("Desktop Music artwork refresh failed.", {
        module: "music", source: "desktop-overlay.music-artwork.refresh-failed", correlationId: this.dependencies.generateReferenceId?.() ?? "music-artwork-refresh", processingId: null,
        metadata: { errorName: error instanceof Error ? error.name : "UnknownError" }
      })).finally(() => { if (this.#pendingArtwork === pending) this.#pendingArtwork = null; });
    }
  }

  #cancelArtwork(): void {
    this.#pendingArtwork?.controller.abort();
    this.#pendingArtwork = null;
  }

  async #attachArtwork(current: NonNullable<ReturnType<MusicRuntimeCoordinator["getCurrentArtwork"]>>, pending: { identity: string; controller: AbortController }): Promise<void> {
    const music = this.dependencies.music!;
    const ref = await music.artwork.resolve(current.descriptor, current.owner, AbortSignal.any([pending.controller.signal, AbortSignal.timeout(5000)]));
    const validFrame = () => !this.#closed && !pending.controller.signal.aborted && this.#pendingArtwork === pending &&
      this.#musicFrame?.identity === pending.identity && this.#musicFrame.sourceRevision === music.coordinator.revision;
    if (ref === null || !validFrame()) return;
    const surface = (await this.dependencies.surfaces.list()).find(candidate => candidate.kind === "desktop");
    if (!validFrame() || surface?.kind !== "desktop" || !surface.enabled || surface.displayId === null ||
      !surface.layers.some(layer => layer.moduleId === "music" && layer.visible)) return;
    const expiresAt = Date.now() + 60_000;
    const handle = music.artwork.issueGrant(ref, current.owner, "desktop-music:desktop:primary", expiresAt);
    if (handle === null) return;
    const artwork = { ref: current.ref, grant: { handle, expiresAt } };
    const command = { ...this.#musicFrame!.command, revision: ++this.#musicRevision, artwork };
    // A progress frame arriving while transport delivery is pending can retain this grant.
    this.#musicArtwork = { identity: pending.identity, value: artwork };
    await this.dependencies.transport.syncModule(command);
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
    this.#cancelArtwork();
    this.#musicFrame = null;
    this.#musicArtwork = null;
    clearInterval(this.#refresh);
    this.dependencies.music?.artwork.revokeRecipient("desktop-music:desktop:primary");
    if (this.#musicOwner !== null) { await this.dependencies.music?.assets.releaseMusicOwner(this.#musicOwner); this.#musicOwner = null; }
    await this.dependencies.transport.syncModule({ moduleId: "timers", revision: ++this.#revision, presentation: null, assets: [] });
    if (this.dependencies.music !== undefined) await this.dependencies.transport.syncModule({ moduleId: "music", revision: ++this.#musicRevision, presentation: null, assets: [], artwork: null });
  }
}
