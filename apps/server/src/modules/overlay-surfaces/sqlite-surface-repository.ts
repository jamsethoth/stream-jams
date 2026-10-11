import type { DatabaseSync } from "node:sqlite";
import {
  listDesktopOverlayModuleIds, reconcileSurfaceLayers, surfaceConfigurationSchema, validateSurfaceOrder,
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
    if (parsed.kind !== "desktop") throw new Error("Public unified surfaces were retired. Configure ordinary module sources instead.");
    runInTransaction(this.connection, () => {
      validateSurfaceOrder(parsed.layers, this.moduleIds());
      const surfaces = this.reconcile();
      if (!surfaces.some(surface => surface.id === parsed.id)) throw new Error("Unknown overlay surface");
      this.write(parsed);
    });
  }

  private reconcile(): SurfaceConfiguration[] {
    this.connection.prepare("DELETE FROM overlay_surfaces WHERE kind = 'unified-browser'").run();
    const rows = this.connection.prepare("SELECT configuration_json FROM overlay_surfaces ORDER BY id").all();
    const surfaces = rows.map(row => surfaceConfigurationSchema.parse(JSON.parse(String(row.configuration_json))));
    if (!surfaces.some(surface => surface.id === "desktop:primary")) {
      const desktop: SurfaceConfiguration = {
        id: "desktop:primary",
        kind: "desktop",
        enabled: false,
        displayId: null,
        displayLabel: null,
        autoFollowDisplayName: false,
        opacity: 1,
        layers: []
      };
      this.write(desktop);
      surfaces.push(desktop);
    }
    return surfaces.map(surface => {
      const layers = reconcileSurfaceLayers(surface.layers, this.moduleIds());
      const reconciled = { ...surface, layers };
      if (JSON.stringify(layers) !== JSON.stringify(surface.layers)) this.write(reconciled);
      return reconciled;
    }).sort((left, right) => left.id.localeCompare(right.id));
  }

  private moduleIds(): string[] {
    return listDesktopOverlayModuleIds(this.registry);
  }

  private write(configuration: SurfaceConfiguration): void {
    this.connection.prepare(`INSERT INTO overlay_surfaces (id, kind, configuration_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, configuration_json = excluded.configuration_json, updated_at = excluded.updated_at`)
      .run(configuration.id, configuration.kind, JSON.stringify(configuration), new Date().toISOString());
  }
}
