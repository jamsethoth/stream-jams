import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  duplicateScreenEffect, ScreenEffectSetError, screenEffectSetInputSchema, screenEffectSetSchema,
  type ScreenEffectDocument, type ScreenEffectSet, type ScreenEffectSetInput, type ScreenEffectSetRepository
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";
import { SqliteEffectRepository } from "./sqlite-effect-repository.js";

export class SqliteEffectSetRepository implements ScreenEffectSetRepository {
  constructor(private readonly connection: DatabaseSync, private readonly effects: SqliteEffectRepository) {}

  async list(): Promise<readonly ScreenEffectSet[]> {
    return this.connection.prepare("SELECT id FROM screen_effect_sets ORDER BY name COLLATE NOCASE, id")
      .all().map((row) => this.read(String(row.id)));
  }

  async create(candidate: ScreenEffectSetInput, sourceId?: string): Promise<ScreenEffectSet> {
    const input = screenEffectSetInputSchema.parse(candidate);
    return runInTransaction(this.connection, () => {
      this.assertUnique(input.id, input.name);
      const source = sourceId === undefined ? null : this.read(sourceId);
      this.connection.prepare("INSERT INTO screen_effect_sets (id, name, active) VALUES (?, ?, 0)").run(input.id, input.name);
      for (const effectId of source?.effectIds ?? []) {
        const original = this.effects.findSync(effectId)!;
        const copy = duplicateScreenEffect(original, {
          id: `effect-${randomUUID()}`, name: original.name,
          variantIds: original.variants.map(() => `variant-${randomUUID()}`),
          bindingIds: original.bindings.map(() => `binding-${randomUUID()}`)
        });
        this.effects.saveSync({ ...copy, enabled: original.enabled });
        this.assign(copy.id, input.id);
      }
      return this.read(input.id);
    });
  }

  async rename(id: string, name: string): Promise<ScreenEffectSet> {
    const input = screenEffectSetInputSchema.parse({ id, name });
    return runInTransaction(this.connection, () => {
      this.read(id);
      this.assertUnique(null, input.name, id);
      this.connection.prepare("UPDATE screen_effect_sets SET name = ? WHERE id = ?").run(input.name, id);
      return this.read(id);
    });
  }

  async activate(id: string): Promise<void> {
    runInTransaction(this.connection, () => {
      this.read(id);
      this.connection.prepare("UPDATE screen_effect_sets SET active = 0 WHERE active = 1").run();
      this.connection.prepare("UPDATE screen_effect_sets SET active = 1 WHERE id = ?").run(id);
    });
  }

  async remove(id: string): Promise<void> {
    runInTransaction(this.connection, () => {
      const set = this.read(id);
      if (set.active) throw new ScreenEffectSetError("Activate another set before deleting the active Screen Effect set.");
      for (const effectId of set.effectIds) {
        this.connection.prepare("DELETE FROM screen_effects WHERE id = ?").run(effectId);
      }
      this.connection.prepare("DELETE FROM screen_effect_sets WHERE id = ?").run(id);
    });
  }

  async createEffect(document: ScreenEffectDocument, setId: string): Promise<void> {
    runInTransaction(this.connection, () => {
      this.read(setId);
      if (this.effects.findSync(document.id) !== null) throw new ScreenEffectSetError("An effect with that ID already exists.");
      this.effects.saveSync(document);
      this.assign(document.id, setId);
    });
  }

  private assign(effectId: string, setId: string): void {
    this.connection.prepare("UPDATE screen_effect_set_memberships SET set_id = ? WHERE effect_id = ?").run(setId, effectId);
  }

  private read(id: string): ScreenEffectSet {
    const row = this.connection.prepare("SELECT * FROM screen_effect_sets WHERE id = ?").get(id);
    if (row === undefined) throw new ScreenEffectSetError("Screen Effect set no longer exists. Refresh the set list.");
    return screenEffectSetSchema.parse({ ...row, active: row.active === 1,
      effectIds: this.connection.prepare("SELECT effect_id FROM screen_effect_set_memberships WHERE set_id = ? ORDER BY effect_id").all(id).map((member) => member.effect_id)
    });
  }

  private assertUnique(id: string | null, name: string, excludingId = ""): void {
    if (this.connection.prepare("SELECT 1 FROM screen_effect_sets WHERE (id = ? OR name = ? COLLATE NOCASE) AND id <> ?").get(id, name, excludingId)) {
      throw new ScreenEffectSetError("A Screen Effect set with that name or ID already exists. Choose another name.");
    }
  }
}
