import type { DatabaseSync } from "node:sqlite";
import {
  audioOutputRouteSchema,
  type AudioOutputRoute,
  type AudioOutputRouteRepository,
  type AudioRouteReference,
  type ModuleMediaReference
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";
import { AudioOutputError } from "./audio-output-error.js";

export class SqliteAudioOutputRouteRepository implements AudioOutputRouteRepository {
  constructor(private readonly connection: DatabaseSync) {}

  list(): readonly AudioOutputRoute[] {
    return this.connection.prepare("SELECT * FROM audio_output_routes ORDER BY name COLLATE NOCASE, id").all().map(readRoute);
  }

  findById(id: string): AudioOutputRoute | null {
    const row = this.connection.prepare("SELECT * FROM audio_output_routes WHERE id = ?").get(id);
    return row === undefined ? null : readRoute(row);
  }

  findReferences(id: string): readonly AudioRouteReference[] {
    return this.connection.prepare(`
      SELECT DISTINCT alert_id, json_extract(document_json, '$.name') AS name
      FROM alert_editor_documents, json_each(document_json, '$.outputs.deviceRouteIds')
      WHERE json_each.value = ? ORDER BY alert_id
    `).all(id).map(row => ({ alertId: String(row.alert_id), name: String(row.name) }));
  }

  findModuleReferences(id: string): readonly ModuleMediaReference[] {
    const alerts = this.connection.prepare(`
      SELECT DISTINCT
        alert_id AS owner_id,
        json_extract(document_json, '$.name') AS owner_name,
        CASE
          WHEN json_extract(document_json, '$.kind') = 'variation' THEN alert_id
          ELSE NULL
        END AS variant_id
      FROM alert_editor_documents, json_each(document_json, '$.outputs.deviceRouteIds')
      WHERE json_each.value = ?
      ORDER BY alert_id
    `).all(id).map(row => ({
      moduleId: "alerts",
      ownerId: String(row.owner_id),
      ownerName: String(row.owner_name),
      variantId: row.variant_id === null ? null : String(row.variant_id)
    }));
    const effects = this.connection.prepare(`
      SELECT DISTINCT
        effects.id AS owner_id,
        effects.name AS owner_name,
        variants.id AS variant_id
      FROM screen_effect_audio_routes AS routes
      JOIN screen_effect_variants AS variants ON variants.id = routes.variant_id
      JOIN screen_effects AS effects ON effects.id = variants.effect_id
      WHERE routes.route_id = ?
      ORDER BY effects.id, variants.position
    `).all(id).map(row => ({
      moduleId: "screen-effects",
      ownerId: String(row.owner_id),
      ownerName: String(row.owner_name),
      variantId: String(row.variant_id)
    }));
    return [...alerts, ...effects];
  }

  save(candidate: AudioOutputRoute): void {
    const route = audioOutputRouteSchema.parse(candidate);
    runInTransaction(this.connection, () => {
      const conflict = this.connection.prepare("SELECT id FROM audio_output_routes WHERE name = ? COLLATE NOCASE AND id <> ?").get(route.name, route.id);
      if (conflict !== undefined) throw new AudioOutputError(409, "AUDIO_ROUTE_NAME_CONFLICT", "That route name is already in use.", "Choose a different route name.");
      this.connection.prepare(`
        INSERT INTO audio_output_routes (id, name, device_id, device_label) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, device_id = excluded.device_id, device_label = excluded.device_label
      `).run(route.id, route.name, route.deviceId, route.deviceLabel);
    });
  }

  delete(id: string): void {
    runInTransaction(this.connection, () => {
      const references = this.findReferences(id);
      const owners = this.findModuleReferences(id);
      if (owners.length > 0) {
        throw new AudioOutputError(
          409,
          "AUDIO_ROUTE_REFERENCED",
          "This route is still referenced by saved playback items.",
          "Remove the route from the listed Alerts and Screen Effects before deleting it.",
          [id],
          references,
          owners
        );
      }
      this.connection.prepare("DELETE FROM audio_output_routes WHERE id = ?").run(id);
    });
  }
}

function readRoute(row: Record<string, unknown>): AudioOutputRoute {
  return audioOutputRouteSchema.parse({ id: row.id, name: row.name, deviceId: row.device_id, deviceLabel: row.device_label });
}
