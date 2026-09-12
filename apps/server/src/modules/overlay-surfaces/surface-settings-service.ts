import { desktopOverlayStatusSchema, surfaceConfigurationSchema, surfaceSettingsViewSchema, validateSurfaceOrder,
  type DesktopOverlayStatus, type DesktopOverlayTransport, type SurfaceConfiguration, type SurfaceRepository, type SurfaceSettingsView } from "@stream-jams/core";

export class SurfaceSettingsError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

export interface SurfaceSettingsServiceDependencies {
  surfaces: SurfaceRepository;
  host?: Pick<DesktopOverlayTransport, "configure" | "retry" | "getStatus">;
  moduleIds(): readonly string[];
  changed(surface: SurfaceConfiguration): Promise<void>;
  runMutation<T>(work: () => Promise<T>): Promise<T>;
}

export class SurfaceSettingsService {
  #saving = false;
  #applicationFailure: string | null = null;
  constructor(private readonly dependencies: SurfaceSettingsServiceDependencies) {}

  async load(): Promise<SurfaceSettingsView> {
    const [surfaces, desktop] = await Promise.all([this.dependencies.surfaces.list(), this.#status()]);
    return surfaceSettingsViewSchema.parse({ surfaces, desktop: this.#applicationFailure === null ? desktop : {
      ...desktop, state: "failed", message: this.#applicationFailure
    } });
  }

  save(surfaceId: string, candidate: unknown): Promise<SurfaceSettingsView> {
    return this.#mutate(async () => {
      const parsed = surfaceConfigurationSchema.safeParse(candidate);
      if (!parsed.success || parsed.data.id !== surfaceId) throw invalid();
      const config = parsed.data;
      try { validateSurfaceOrder(config.layers, this.dependencies.moduleIds()); } catch { throw invalid(); }
      const surfaces = await this.dependencies.surfaces.list();
      if (!surfaces.some(surface => surface.id === surfaceId)) throw new SurfaceSettingsError(404, "SURFACE_NOT_FOUND", "This overlay surface no longer exists. Refresh Settings and try again.");
      if (config.kind === "desktop" && config.enabled) {
        const status = await this.#status();
        if (!status.available || !status.displays.some(display => display.id === config.displayId)) {
          throw new SurfaceSettingsError(409, "SURFACE_DISPLAY_UNAVAILABLE", "The selected desktop display is unavailable. Reconnect it or select an available display, then save again.");
        }
      }
      try { await this.dependencies.surfaces.save(config); }
      catch { throw new SurfaceSettingsError(500, "SURFACE_SAVE_FAILED", "Overlay settings could not be saved. Check data-folder permissions and retry; the running overlay was not changed."); }
      try {
        if (config.kind === "desktop") await this.dependencies.host?.configure(config);
        await this.dependencies.changed(config);
        if (config.kind === "desktop") this.#applicationFailure = null;
      } catch {
        if (config.kind === "unified-browser") throw new SurfaceSettingsError(503, "SURFACE_APPLY_FAILED", "Settings were saved, but browser outputs could not be updated. Refresh the browser source or save the layer settings again.");
        this.#applicationFailure = "Settings were saved, but the overlay could not apply them. Check the display and explicitly retry the desktop overlay.";
      }
      return this.load();
    });
  }

  retry(): Promise<SurfaceSettingsView> {
    return this.#mutate(async () => {
      const host = this.dependencies.host;
      const status = await this.#status();
      if (host === undefined || !status.available) throw new SurfaceSettingsError(409, "DESKTOP_OVERLAY_UNAVAILABLE", "Desktop overlay recovery requires the Windows desktop app. Open it and retry from Settings.");
      const config = (await this.dependencies.surfaces.list()).find(surface => surface.kind === "desktop");
      if (config?.kind !== "desktop" || !config.enabled || !status.displays.some(display => display.id === config.displayId)) {
        throw new SurfaceSettingsError(409, "SURFACE_DISPLAY_UNAVAILABLE", "Enable the desktop overlay and save an available display before retrying.");
      }
      try { await host.configure(config); await host.retry(); this.#applicationFailure = null; }
      catch { this.#applicationFailure = "Desktop overlay recovery failed. Check the selected display and retry. Interrupted content will not replay."; }
      return this.load();
    });
  }

  async #status(): Promise<DesktopOverlayStatus> {
    if (this.dependencies.host?.getStatus === undefined) return { available: false, displays: [], state: "unavailable", message: "Desktop overlays require the Windows desktop app. Browser-source outputs remain available." };
    try { return desktopOverlayStatusSchema.parse(await this.dependencies.host.getStatus()); }
    catch { return { available: false, displays: [], state: "unavailable", message: "The desktop host is unavailable. Restart the Windows app and retry." }; }
  }

  async #mutate<T>(work: () => Promise<T>): Promise<T> {
    if (this.#saving) throw new SurfaceSettingsError(409, "SURFACE_SAVE_BUSY", "Another overlay settings change is still applying. Wait for it to finish and retry.");
    this.#saving = true;
    try { return await this.dependencies.runMutation(work); }
    finally { this.#saving = false; }
  }
}
function invalid(): SurfaceSettingsError { return new SurfaceSettingsError(400, "INVALID_SURFACE_SETTINGS", "Overlay settings are invalid. Refresh the registered module list and select a valid display, opacity and complete layer order."); }
