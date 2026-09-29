import type { DatabaseSync } from "node:sqlite";
import {
  timerDefinitionSchema,
  type TimerDefinition,
  type TimerDefinitionRepository
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

interface TimerRow extends Record<string, unknown> {
  readonly id: unknown;
  readonly label: unknown;
  readonly duration_ms: unknown;
  readonly icon_asset_id: unknown;
  readonly start_audio_asset_id: unknown;
  readonly end_audio_asset_id: unknown;
  readonly browser_source: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export class TimerDefinitionReferenceError extends Error {
  constructor(
    readonly definitionId: string,
    readonly referenceKind: "icon" | "start-audio" | "end-audio" | "audio-route",
    readonly referenceId: string,
    message: string
  ) {
    super(message);
    this.name = "TimerDefinitionReferenceError";
  }
}

export class SqliteTimerDefinitionRepository implements TimerDefinitionRepository {
  constructor(private readonly connection: DatabaseSync) {}

  list(): readonly TimerDefinition[] {
    return (this.connection.prepare(
      "SELECT * FROM timer_definitions ORDER BY label COLLATE NOCASE, id"
    ).all() as unknown as TimerRow[]).map(row => this.#read(row));
  }

  findById(id: string): TimerDefinition | null {
    const row = this.connection.prepare("SELECT * FROM timer_definitions WHERE id = ?").get(id) as TimerRow | undefined;
    return row === undefined ? null : this.#read(row);
  }

  save(candidate: TimerDefinition): TimerDefinition {
    const definition = timerDefinitionSchema.parse(candidate);
    return runInTransaction(this.connection, () => {
      this.#validateReferences(definition);
      this.connection.prepare(`
        INSERT INTO timer_definitions (
          id, label, duration_ms, icon_asset_id, start_audio_asset_id, end_audio_asset_id,
          browser_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          duration_ms = excluded.duration_ms,
          icon_asset_id = excluded.icon_asset_id,
          start_audio_asset_id = excluded.start_audio_asset_id,
          end_audio_asset_id = excluded.end_audio_asset_id,
          browser_source = excluded.browser_source,
          updated_at = excluded.updated_at
      `).run(
        definition.id,
        definition.label,
        definition.durationMs,
        definition.iconAssetId,
        definition.startAudioAssetId,
        definition.endAudioAssetId,
        definition.outputs.browserSource ? 1 : 0,
        definition.createdAt,
        definition.updatedAt
      );
      this.connection.prepare("DELETE FROM timer_audio_routes WHERE timer_id = ?").run(definition.id);
      const insertRoute = this.connection.prepare(
        "INSERT INTO timer_audio_routes (timer_id, route_id, position) VALUES (?, ?, ?)"
      );
      for (const [position, routeId] of definition.outputs.deviceRouteIds.entries()) {
        insertRoute.run(definition.id, routeId, position);
      }
      return definition;
    });
  }

  delete(id: string): void {
    runInTransaction(this.connection, () => {
      this.connection.prepare("DELETE FROM timer_definitions WHERE id = ?").run(id);
    });
  }

  findByAssetId(assetId: string): readonly TimerDefinition[] {
    return (this.connection.prepare(`
      SELECT * FROM timer_definitions
      WHERE icon_asset_id = ? OR start_audio_asset_id = ? OR end_audio_asset_id = ?
      ORDER BY label COLLATE NOCASE, id
    `).all(assetId, assetId, assetId) as unknown as TimerRow[]).map(row => this.#read(row));
  }

  findByAudioRouteId(routeId: string): readonly TimerDefinition[] {
    return (this.connection.prepare(`
      SELECT definitions.* FROM timer_definitions AS definitions
      JOIN timer_audio_routes AS routes ON routes.timer_id = definitions.id
      WHERE routes.route_id = ?
      ORDER BY definitions.label COLLATE NOCASE, definitions.id
    `).all(routeId) as unknown as TimerRow[]).map(row => this.#read(row));
  }

  #read(row: TimerRow): TimerDefinition {
    const routeIds = this.connection.prepare(
      "SELECT route_id FROM timer_audio_routes WHERE timer_id = ? ORDER BY position"
    ).all(String(row.id)).map(route => String(route.route_id));
    return timerDefinitionSchema.parse({
      id: row.id,
      label: row.label,
      durationMs: row.duration_ms,
      iconAssetId: row.icon_asset_id,
      startAudioAssetId: row.start_audio_asset_id,
      endAudioAssetId: row.end_audio_asset_id,
      outputs: { browserSource: row.browser_source === 1, deviceRouteIds: routeIds },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  #validateReferences(definition: TimerDefinition): void {
    const findAsset = this.connection.prepare("SELECT media_type FROM asset_metadata WHERE id = ?");
    const validateAsset = (
      id: string | null,
      kind: "icon" | "start-audio" | "end-audio",
      allowed: readonly string[],
      label: string
    ) => {
      if (id === null) return;
      const row = findAsset.get(id);
      if (row === undefined || !allowed.includes(String(row.media_type))) {
        throw new TimerDefinitionReferenceError(
          definition.id,
          kind,
          id,
          `Timer ${label} asset "${id}" is missing or incompatible`
        );
      }
    };
    validateAsset(definition.iconAssetId, "icon", ["image", "gif"], "icon");
    validateAsset(definition.startAudioAssetId, "start-audio", ["audio"], "start cue");
    validateAsset(definition.endAudioAssetId, "end-audio", ["audio"], "end cue");

    const findRoute = this.connection.prepare("SELECT id FROM audio_output_routes WHERE id = ?");
    for (const routeId of definition.outputs.deviceRouteIds) {
      if (findRoute.get(routeId) === undefined) {
        throw new TimerDefinitionReferenceError(
          definition.id,
          "audio-route",
          routeId,
          `Timer audio route "${routeId}" does not exist`
        );
      }
    }
  }
}
