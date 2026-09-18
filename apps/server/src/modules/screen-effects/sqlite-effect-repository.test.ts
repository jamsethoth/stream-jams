import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  createInMemoryStreamJamsDatabase,
  openStreamJamsDatabase,
  runInTransaction
} from "../db/database.js";
import { SqliteAssetRepository } from "../assets/sqlite-asset-repository.js";
import { SqliteAudioOutputRouteRepository } from "../audio/sqlite-audio-output-route-repository.js";
import { SqliteEffectRepository } from "./sqlite-effect-repository.js";
import { SqliteEffectSetRepository } from "./sqlite-effect-set-repository.js";

const route = {
  id: "route-headphones",
  name: "Headphones",
  deviceId: "device-headphones",
  deviceLabel: "XLR headphones"
};

describe("SqliteEffectRepository", () => {
  it("reads legacy default and weighted storage rows into the unified variant model", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const document = effectDocument();
    database.connection.prepare(`
      INSERT INTO screen_effects (
        id, schema_version, name, enabled, description, category, priority, cooldown_seconds, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      document.id,
      document.schemaVersion,
      document.name,
      0,
      document.description,
      document.category,
      document.priority,
      60,
      "2026-09-17T00:00:00.000Z"
    );
    const defaultVariant = document.variants[0]!;
    const weightedVariant = { ...defaultVariant, id: "variant-weighted", name: "Weighted", enabled: false, weight: 3 };
    const unifiedVariants = [defaultVariant, weightedVariant] as const;
    const storedVariants = [
      { ...defaultVariant, kind: "default" },
      { ...weightedVariant, kind: "weighted" }
    ] as const;
    const insertVariant = database.connection.prepare(`
      INSERT INTO screen_effect_variants (
        id, effect_id, position, kind, enabled, weight, document_json, visual_asset_id, sound_asset_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertRoute = database.connection.prepare(`
      INSERT INTO screen_effect_audio_routes (variant_id, route_id, position) VALUES (?, ?, ?)
    `);
    for (const [position, storedVariant] of storedVariants.entries()) {
      insertVariant.run(
        storedVariant.id,
        document.id,
        position,
        storedVariant.kind,
        storedVariant.enabled ? 1 : 0,
        storedVariant.weight,
        JSON.stringify(storedVariant),
        null,
        storedVariant.sound?.assetId ?? null
      );
      insertRoute.run(storedVariant.id, route.id, 0);
    }

    await expect(new SqliteEffectRepository(database.connection).find(document.id)).resolves.toEqual({
      ...document,
      bindings: [],
      variants: unifiedVariants
    });
  });

  it("writes the neutral weighted marker only in legacy storage", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const repository = new SqliteEffectRepository(database.connection);
    const document = effectDocument();

    await repository.save(document);

    const row = database.connection.prepare(
      "SELECT kind, document_json FROM screen_effect_variants WHERE id = ?"
    ).get(document.variants[0]!.id);
    expect(row?.kind).toBe("weighted");
    expect(JSON.parse(String(row?.document_json))).toEqual({
      ...document.variants[0],
      kind: "weighted"
    });
    await expect(repository.find(document.id)).resolves.toEqual(document);
  });

  it("upgrades populated pre-set data without changing document identities or flags", async () => {
    using database = createInMemoryStreamJamsDatabase();
    database.connection.exec(`DROP TRIGGER screen_effect_assign_set;
      DROP TABLE screen_effect_set_memberships; DROP TABLE screen_effect_sets;
      DELETE FROM schema_migrations WHERE id = '023-screen-effect-sets';`);
    await seedReferences(database.connection);
    const effects = new SqliteEffectRepository(database.connection);
    const original = { ...effectDocument(), enabled: true };
    await effects.save(original);
    database.runMigrations();
    expect(await effects.find(original.id)).toEqual(original);
    expect(await effects.listActive()).toEqual([original]);
    expect(await new SqliteEffectSetRepository(database.connection, effects).list()).toEqual([
      { id: "screen-effects-default", name: "Default", active: true, effectIds: [original.id] }
    ]);
  });

  it("duplicates into an inactive set, activates atomically and protects active deletion and unique names", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const effects = new SqliteEffectRepository(database.connection);
    const sets = new SqliteEffectSetRepository(database.connection, effects);
    const original = { ...effectDocument(), enabled: true };
    await effects.save(original);
    const copy = await sets.create({ id: "other", name: "Other" }, "screen-effects-default");
    expect(copy.active).toBe(false);
    expect(copy.effectIds).toHaveLength(1);
    const copied = (await effects.find(copy.effectIds[0]!))!;
    expect(copied.id).not.toBe(original.id);
    expect(copied.variants[0]!.id).not.toBe(original.variants[0]!.id);
    expect(copied.bindings[0]!.id).not.toBe(original.bindings[0]!.id);
    expect(copied.enabled).toBe(true);
    expect(copied.variants[0]!.sound).toEqual(original.variants[0]!.sound);
    expect(await effects.listActive()).toEqual([original]);
    await expect(sets.create({ id: "duplicate", name: "other" })).rejects.toThrow(/already exists/u);
    await expect(sets.remove("screen-effects-default")).rejects.toThrow(/active/u);
    await expect(sets.activate("missing")).rejects.toThrow(/no longer exists/u);
    expect(effects.isInActiveSet(original.id)).toBe(true);
    await sets.activate(copy.id);
    expect(effects.isInActiveSet(original.id)).toBe(false);
    expect(await effects.listActive()).toEqual([copied]);
    expect((await sets.list()).filter((set) => set.active)).toHaveLength(1);
    await expect(sets.rename(copy.id, "DEFAULT")).rejects.toThrow(/already exists/u);
    await sets.remove("screen-effects-default");
    expect(await effects.find(original.id)).toBeNull();
    expect(await effects.find(copied.id)).toEqual(copied);
  });

  it("rolls back a copied set and its children if any child write fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const effects = new SqliteEffectRepository(database.connection);
    const sets = new SqliteEffectSetRepository(database.connection, effects);
    await effects.save(effectDocument());
    database.connection.exec(`CREATE TRIGGER reject_copy BEFORE INSERT ON screen_effects
      BEGIN SELECT RAISE(ABORT, 'copy failed'); END;`);
    await expect(sets.create({ id: "copy", name: "Copy" }, "screen-effects-default")).rejects.toThrow("copy failed");
    expect(await sets.list()).toHaveLength(1);
    expect(await effects.list()).toEqual([effectDocument()]);
  });

  it("assigns existing document saves to the single active Default set", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const repository = new SqliteEffectRepository(database.connection);
    await repository.save(effectDocument());
    expect(database.connection.prepare("SELECT name FROM screen_effect_sets WHERE active = 1").get()?.name).toBe("Default");
    expect(database.connection.prepare("SELECT count(*) AS count FROM screen_effect_set_memberships").get()?.count).toBe(1);
  });

  it("round-trips an exact definition across restart and protects its route reference", async () => {
    const root = mkdtempSync(join(tmpdir(), "stream-jams-effects-"));
    const databasePath = join(root, "test.sqlite");
    const document = effectDocument();
    try {
      {
        using database = openStreamJamsDatabase(databasePath);
        await seedReferences(database.connection);
        const repository = new SqliteEffectRepository(database.connection);
        await expect(repository.find(document.id)).resolves.toBeNull();
        await expect(repository.save(document)).resolves.toBeUndefined();
        await expect(repository.find(document.id)).resolves.toEqual(document);
        await expect(repository.list()).resolves.toEqual([document]);
      }

      using database = openStreamJamsDatabase(databasePath);
      const repository = new SqliteEffectRepository(database.connection);
      const routes = new SqliteAudioOutputRouteRepository(database.connection);
      await expect(repository.find(document.id)).resolves.toEqual(document);
      expect(() => routes.delete(route.id)).toThrow();
      await repository.remove(document.id);
      routes.delete(route.id);
      expect(routes.findById(route.id)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rolls back metadata, variants, bindings, and references when a child write fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const repository = new SqliteEffectRepository(database.connection);
    const original = effectDocument();
    await repository.save(original);
    database.connection.exec(`
      CREATE TRIGGER fail_effect_binding
      BEFORE INSERT ON screen_effect_bindings
      WHEN NEW.id = 'binding-fail'
      BEGIN
        SELECT RAISE(ABORT, 'effect binding test failure');
      END
    `);
    const replacement: ScreenEffectDocument = {
      ...original,
      name: "Must roll back",
      bindings: [{
        id: "binding-fail",
        kind: "twitch-reward",
        broadcasterId: "broadcaster-1",
        rewardId: "reward-2"
      }],
      variants: [{
        ...original.variants[0]!,
        id: "variant-replacement",
        sound: { assetId: "asset-tone", volume: 0.75 }
      }]
    };

    await expect(repository.save(replacement)).rejects.toThrow("effect binding test failure");
    await expect(repository.find(original.id)).resolves.toEqual(original);
    expect(database.connection.prepare(
      "SELECT id FROM screen_effect_variants WHERE effect_id = ? ORDER BY position"
    ).all(original.id)).toEqual([{ id: "variant-default" }]);
    expect(database.connection.prepare(
      "SELECT id FROM screen_effect_bindings WHERE effect_id = ? ORDER BY position"
    ).all(original.id)).toEqual([{ id: "binding-reward" }]);
    expect(database.connection.prepare(
      "SELECT route_id FROM screen_effect_audio_routes ORDER BY position"
    ).all()).toEqual([{ route_id: route.id }]);
  });

  it("serializes effect saves against asset deletion without dangling references", async () => {
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const assets = new SqliteAssetRepository(database.connection);
    const effects = new SqliteEffectRepository(database.connection);
    const document = effectDocument();

    expect(() => runInTransaction(database.connection, () => {
      assets.deleteSync("asset-tone");
      effects.saveSync(document);
    })).toThrow(/missing or incompatible/iu);
    await expect(assets.findById("asset-tone")).resolves.not.toBeNull();
    await expect(effects.find(document.id)).resolves.toBeNull();

    expect(() => runInTransaction(database.connection, () => {
      effects.saveSync(document);
      assets.deleteSync("asset-tone");
    })).toThrow(/foreign key constraint/iu);
    await expect(assets.findById("asset-tone")).resolves.not.toBeNull();
    await expect(effects.find(document.id)).resolves.toBeNull();

    await effects.save(document);
    expect(() => runInTransaction(database.connection, () => {
      assets.deleteSync("asset-tone");
    })).toThrow(/foreign key constraint/iu);
    await expect(assets.findById("asset-tone")).resolves.not.toBeNull();
    await expect(effects.find(document.id)).resolves.toEqual(document);
  });

  it("accepts a GIF visual only when the referenced asset is a GIF", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const assets = new SqliteAssetRepository(database.connection);
    await assets.save({
      id: "asset-gif",
      originalFileName: "effect.gif",
      mediaType: "gif",
      mimeType: "image/gif",
      sizeBytes: 4,
      checksum: "sha256:test-gif",
      storagePath: "assets/asset-gif.gif",
      durationMs: null
    });
    const draft = createScreenEffectDocument({
      id: "effect-gif",
      name: "GIF effect",
      defaultVariantId: "variant-gif"
    });
    const document = screenEffectDocumentSchema.parse({
      ...draft,
      variants: [{
        ...draft.variants[0]!,
        visual: {
          mediaType: "gif",
          assetId: "asset-gif",
          layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }
        },
        visualOutputs: { browserSource: true, desktop: false }
      }]
    });

    const repository = new SqliteEffectRepository(database.connection);
    await expect(repository.save(document)).resolves.toBeUndefined();
    await expect(repository.find(document.id)).resolves.toEqual(document);
  });
});

async function seedReferences(connection: ConstructorParameters<typeof SqliteEffectRepository>[0]): Promise<void> {
  await new SqliteAssetRepository(connection).save({
    id: "asset-tone",
    originalFileName: "tone.wav",
    mediaType: "audio",
    mimeType: "audio/wav",
    sizeBytes: 4,
    checksum: "sha256:test-tone",
    storagePath: "assets/asset-tone.wav",
    durationMs: null
  });
  new SqliteAudioOutputRouteRepository(connection).save(route);
}

function effectDocument(): ScreenEffectDocument {
  const draft = createScreenEffectDocument({
    id: "effect-neutral",
    name: "Neutral effect",
    defaultVariantId: "variant-default"
  });
  return screenEffectDocumentSchema.parse({
    ...draft,
    description: "A neutral persistence fixture",
    category: "Tests",
    bindings: [{
      id: "binding-reward",
      kind: "twitch-reward",
      broadcasterId: "broadcaster-1",
      rewardId: "reward-1"
    }],
    variants: [{
      ...draft.variants[0]!,
      sound: { assetId: "asset-tone", volume: 0.25 },
      outputs: { browserSource: false, deviceRouteIds: [route.id] }
    }]
  });
}
