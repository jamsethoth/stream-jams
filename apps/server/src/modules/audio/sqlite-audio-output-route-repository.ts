import type { DatabaseSync } from "node:sqlite";
import { audioOutputRouteSchema, type AudioOutputRoute, type AudioOutputRouteRepository, type AudioRouteReference } from "@stream-jams/core";
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
      if (references.length > 0) throw new AudioOutputError(409, "AUDIO_ROUTE_REFERENCED", "This route is still referenced by alerts.", "Remove the route from the listed alerts before deleting it.", [id], references);
      this.connection.prepare("DELETE FROM audio_output_routes WHERE id = ?").run(id);
    });
  }
}

function readRoute(row: Record<string, unknown>): AudioOutputRoute {
  return audioOutputRouteSchema.parse({ id: row.id, name: row.name, deviceId: row.device_id, deviceLabel: row.device_label });
}
