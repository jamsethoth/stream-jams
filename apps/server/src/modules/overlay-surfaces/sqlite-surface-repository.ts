import type { DatabaseSync } from "node:sqlite";
import {
  reconcileSurfaceLayers, surfaceConfigurationSchema, validateSurfaceOrder,
  type OverlayModuleRegistry, type SurfaceConfiguration, type SurfaceRepository
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

export class SqliteSurfaceRepository implements SurfaceRepository {
  constructor(private readonly connection: DatabaseSync, private readonly registry: OverlayModuleRegistry) {}

  async list(): Promise<SurfaceConfiguration[]> {
    return runInTransaction(this.connection, () => this.reconcile());
  }

  async save(configuration: SurfaceConfiguration): Promise<void> {
    const parsed = surfaceConfigurationSchema.parse(configuration);
    runInTransaction(this.connection, () => {
      validateSurfaceOrder(parsed.layers, this.registry.listModules().map(module => module.id));
      const surfaces = this.reconcile();
      if (!surfaces.some(surface => surface.id === parsed.id)) throw new Error("Unknown overlay surface");
      this.write(parsed);
    });
  }

  private reconcile(): SurfaceConfiguration[] {
    const modules = this.registry.listModules();
    const ids = modules.map(module => module.id);
    const rows = this.connection.prepare("SELECT configuration_json FROM overlay_surfaces ORDER BY id").all();
    const surfaces = rows.map(row => surfaceConfigurationSchema.parse(JSON.parse(String(row.configuration_json))));
    if (!surfaces.some(surface => surface.id === "desktop:primary")) {
      const desktop: SurfaceConfiguration = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, opacity: 1, layers: [] };
      this.write(desktop);
      surfaces.push(desktop);
    }
    const outputs = this.connection.prepare("SELECT DISTINCT overlay_id FROM overlay_keys WHERE scope = 'unified' AND revoked_at IS NULL ORDER BY overlay_id").all();
    for (const output of outputs) {
      const overlayId = String(output.overlay_id);
      const id = `unified-browser:${overlayId}`;
      if (surfaces.some(surface => surface.id === id)) continue;
      // Existing unified composition paints registry order bottom-first.
      const layers = modules.map(module => {
        const config = this.connection.prepare("SELECT enabled FROM overlay_module_config WHERE module_id = ?").get(module.id);
        return { moduleId: module.id, visible: config === undefined ? module.defaultEnabled : config.enabled === 1 };
      }).reverse();
      const surface: SurfaceConfiguration = { id, kind: "unified-browser", overlayId, layers };
      this.write(surface);
      surfaces.push(surface);
    }
    return surfaces.map(surface => {
      const layers = reconcileSurfaceLayers(surface.layers, ids);
      const reconciled = { ...surface, layers };
      if (JSON.stringify(layers) !== JSON.stringify(surface.layers)) this.write(reconciled);
      return reconciled;
    }).sort((left, right) => left.id.localeCompare(right.id));
  }

  private write(configuration: SurfaceConfiguration): void {
    this.connection.prepare(`INSERT INTO overlay_surfaces (id, kind, configuration_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, configuration_json = excluded.configuration_json, updated_at = excluded.updated_at`)
      .run(configuration.id, configuration.kind, JSON.stringify(configuration), new Date().toISOString());
  }
}
