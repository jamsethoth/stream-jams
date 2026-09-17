import type { DatabaseSync } from "node:sqlite";
import {
  effectBindingIdentity,
  effectBindingSchema,
  effectVariantSchema,
  screenEffectDocumentSchema,
  type EffectVariant,
  type ScreenEffectDocument,
  type ScreenEffectRepository
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

interface EffectRow {
  readonly id: unknown;
  readonly schema_version: unknown;
  readonly name: unknown;
  readonly enabled: unknown;
  readonly description: unknown;
  readonly category: unknown;
  readonly priority: unknown;
  readonly cooldown_seconds: unknown;
}

type StoredEffectVariant = EffectVariant & {
  readonly kind: "default" | "weighted";
};

export class SqliteEffectRepository implements ScreenEffectRepository {
  readonly #connection: DatabaseSync;
  readonly #now: () => Date;

  constructor(connection: DatabaseSync, now: () => Date = () => new Date()) {
    this.#connection = connection;
    this.#now = now;
  }

  async list(): Promise<readonly ScreenEffectDocument[]> {
    const rows = this.#connection.prepare(
      "SELECT * FROM screen_effects ORDER BY name COLLATE NOCASE, id"
    ).all() as unknown as EffectRow[];
    return rows.map((row) => this.#read(row));
  }

  async listActive(): Promise<readonly ScreenEffectDocument[]> {
    const rows = this.#connection.prepare(`
      SELECT e.* FROM screen_effects e
      JOIN screen_effect_set_memberships m ON m.effect_id = e.id
      JOIN screen_effect_sets s ON s.id = m.set_id
      WHERE s.active = 1 ORDER BY e.name COLLATE NOCASE, e.id
    `).all() as unknown as EffectRow[];
    return rows.map((row) => this.#read(row));
  }

  isInActiveSet(id: string): boolean {
    return this.#connection.prepare(`SELECT 1 FROM screen_effect_set_memberships m
      JOIN screen_effect_sets s ON s.id = m.set_id WHERE m.effect_id = ? AND s.active = 1`).get(id) !== undefined;
  }

  async find(id: string): Promise<ScreenEffectDocument | null> {
    return this.findSync(id);
  }

  findSync(id: string): ScreenEffectDocument | null {
    const row = this.#connection.prepare(
      "SELECT * FROM screen_effects WHERE id = ?"
    ).get(id) as EffectRow | undefined;
    return row === undefined ? null : this.#read(row);
  }

  async save(candidate: ScreenEffectDocument): Promise<void> {
    this.saveSync(candidate);
  }

  saveSync(candidate: ScreenEffectDocument): void {
    const document = screenEffectDocumentSchema.parse(candidate);
    runInTransaction(this.#connection, () => {
      this.#validateReferences(document);
      this.#connection.prepare(`
        INSERT INTO screen_effects (
          id, schema_version, name, enabled, description, category, priority, cooldown_seconds, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          schema_version = excluded.schema_version,
          name = excluded.name,
          enabled = excluded.enabled,
          description = excluded.description,
          category = excluded.category,
          priority = excluded.priority,
          cooldown_seconds = excluded.cooldown_seconds,
          updated_at = excluded.updated_at
      `).run(
        document.id,
        document.schemaVersion,
        document.name,
        document.enabled ? 1 : 0,
        document.description,
        document.category,
        document.priority,
        document.cooldownSeconds,
        this.#now().toISOString()
      );

      this.#connection.prepare("DELETE FROM screen_effect_bindings WHERE effect_id = ?").run(document.id);
      this.#connection.prepare("DELETE FROM screen_effect_variants WHERE effect_id = ?").run(document.id);
      const insertVariant = this.#connection.prepare(`
        INSERT INTO screen_effect_variants (
          id, effect_id, position, kind, enabled, weight, document_json, visual_asset_id, sound_asset_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertRoute = this.#connection.prepare(`
        INSERT INTO screen_effect_audio_routes (variant_id, route_id, position)
        VALUES (?, ?, ?)
      `);
      for (const [position, variant] of document.variants.entries()) {
        const storedVariant = serializeStoredVariant(variant);
        insertVariant.run(
          storedVariant.id,
          document.id,
          position,
          storedVariant.kind,
          storedVariant.enabled ? 1 : 0,
          storedVariant.weight,
          JSON.stringify(storedVariant),
          storedVariant.visual?.assetId ?? null,
          storedVariant.sound?.assetId ?? null
        );
        for (const [routePosition, routeId] of storedVariant.outputs.deviceRouteIds.entries()) {
          insertRoute.run(storedVariant.id, routeId, routePosition);
        }
      }

      const insertBinding = this.#connection.prepare(`
        INSERT INTO screen_effect_bindings (
          id, effect_id, position, kind, canonical_identity, document_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const [position, binding] of document.bindings.entries()) {
        insertBinding.run(
          binding.id,
          document.id,
          position,
          binding.kind,
          effectBindingIdentity(binding),
          JSON.stringify(binding)
        );
      }
    });
  }

  async remove(id: string): Promise<void> {
    runInTransaction(this.#connection, () => {
      this.#connection.prepare("DELETE FROM screen_effects WHERE id = ?").run(id);
    });
  }

  #read(row: EffectRow): ScreenEffectDocument {
    const variants = this.#connection.prepare(
      "SELECT document_json FROM screen_effect_variants WHERE effect_id = ? ORDER BY position"
    ).all(String(row.id)).map((variantRow) =>
      parseStoredVariant(JSON.parse(String(variantRow.document_json)) as unknown)
    );
    const bindings = this.#connection.prepare(
      "SELECT document_json FROM screen_effect_bindings WHERE effect_id = ? ORDER BY position"
    ).all(String(row.id)).map((bindingRow) =>
      effectBindingSchema.parse(JSON.parse(String(bindingRow.document_json)) as unknown)
    );
    return screenEffectDocumentSchema.parse({
      schemaVersion: Number(row.schema_version),
      id: String(row.id),
      name: String(row.name),
      enabled: row.enabled === 1,
      description: row.description === null ? null : String(row.description),
      category: row.category === null ? null : String(row.category),
      priority: Number(row.priority),
      cooldownSeconds: Number(row.cooldown_seconds),
      bindings,
      variants
    });
  }

  #validateReferences(document: ScreenEffectDocument): void {
    const findAsset = this.#connection.prepare(
      "SELECT media_type FROM asset_metadata WHERE id = ?"
    );
    const findRoute = this.#connection.prepare(
      "SELECT id FROM audio_output_routes WHERE id = ?"
    );
    for (const variant of document.variants) {
      if (variant.visual !== null) {
        const row = findAsset.get(variant.visual.assetId);
        if (row === undefined || row.media_type !== variant.visual.mediaType) {
          throw new Error(`Screen Effect visual asset "${variant.visual.assetId}" is missing or incompatible`);
        }
      }
      if (variant.sound !== null) {
        const row = findAsset.get(variant.sound.assetId);
        if (row === undefined || row.media_type !== "audio") {
          throw new Error(`Screen Effect sound asset "${variant.sound.assetId}" is missing or incompatible`);
        }
      }
      for (const routeId of variant.outputs.deviceRouteIds) {
        if (findRoute.get(routeId) === undefined) {
          throw new Error(`Screen Effect audio route "${routeId}" does not exist`);
        }
      }
    }
  }
}

function parseStoredVariant(value: unknown): EffectVariant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Stored Screen Effect variant must be an object");
  }
  const { kind, ...variant } = value as Record<string, unknown>;
  if (kind !== "default" && kind !== "weighted") {
    throw new TypeError("Stored Screen Effect variant kind is invalid");
  }
  return effectVariantSchema.parse(variant);
}

function serializeStoredVariant(variant: EffectVariant): StoredEffectVariant {
  return { ...variant, kind: "weighted" };
}
