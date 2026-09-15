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

const route = {
  id: "route-headphones",
  name: "Headphones",
  deviceId: "device-headphones",
  deviceLabel: "XLR headphones"
};

describe("SqliteEffectRepository", () => {
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
      storagePath: "assets/asset-gif.gif"
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
    storagePath: "assets/asset-tone.wav"
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
