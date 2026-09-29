import { describe, expect, it } from "vitest";
import type { TimerDefinition } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAssetRepository } from "../assets/sqlite-asset-repository.js";

async function loadRepository(): Promise<{
  new(connection: ReturnType<typeof createInMemoryStreamJamsDatabase>["connection"]): {
    list(): readonly TimerDefinition[];
    findById(id: string): TimerDefinition | null;
    save(value: TimerDefinition): TimerDefinition;
    delete(id: string): void;
    findByAssetId(id: string): readonly TimerDefinition[];
    findByAudioRouteId(id: string): readonly TimerDefinition[];
  };
}> {
  const path = "./sqlite-timer-definition-repository.js";
  const module = await import(/* @vite-ignore */ path) as Record<string, unknown>;
  return module.SqliteTimerDefinitionRepository as never;
}

const baseDefinition: TimerDefinition = {
  id: "timer-cat-paws",
  label: "Cat Paws",
  durationMs: 300_000,
  iconAssetId: "icon",
  startAudioAssetId: "start",
  endAudioAssetId: "end",
  outputs: { browserSource: true, deviceRouteIds: ["speakers", "headphones"] },
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z"
};

describe("SqliteTimerDefinitionRepository", () => {
  it("round-trips definitions, ordered routes, and reference lookups", async () => {
    const Repository = await loadRepository();
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const repository = new Repository(database.connection);

    expect(repository.save(baseDefinition)).toEqual(baseDefinition);
    expect(repository.findById(baseDefinition.id)).toEqual(baseDefinition);
    expect(repository.list()).toEqual([baseDefinition]);
    expect(repository.findByAssetId("start")).toEqual([baseDefinition]);
    expect(repository.findByAudioRouteId("headphones")).toEqual([baseDefinition]);

    const updated = {
      ...baseDefinition,
      label: "Oven Mitts",
      outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
      updatedAt: "2026-09-28T12:05:00.000Z"
    };
    expect(repository.save(updated)).toEqual(updated);
    expect(repository.findById(updated.id)).toEqual(updated);
    expect(database.connection.prepare("SELECT route_id, position FROM timer_audio_routes").all()).toEqual([
      { route_id: "headphones", position: 0 }
    ]);
  });

  it("validates media and route references in the same transaction as a save", async () => {
    const Repository = await loadRepository();
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const repository = new Repository(database.connection);
    repository.save(baseDefinition);

    expect(() => repository.save({ ...baseDefinition, label: "Invalid", iconAssetId: "start" }))
      .toThrow(/icon.*incompatible/i);
    expect(() => repository.save({ ...baseDefinition, label: "Invalid", startAudioAssetId: "icon" }))
      .toThrow(/start cue.*incompatible/i);
    expect(() => repository.save({ ...baseDefinition, label: "Invalid", outputs: { browserSource: true, deviceRouteIds: ["missing"] } }))
      .toThrow(/route.*does not exist/i);
    expect(repository.findById(baseDefinition.id)).toEqual(baseDefinition);
  });

  it("deletes a definition and its route rows atomically", async () => {
    const Repository = await loadRepository();
    using database = createInMemoryStreamJamsDatabase();
    await seedReferences(database.connection);
    const repository = new Repository(database.connection);
    repository.save(baseDefinition);

    repository.delete(baseDefinition.id);

    expect(repository.findById(baseDefinition.id)).toBeNull();
    expect(database.connection.prepare("SELECT * FROM timer_audio_routes").all()).toEqual([]);
  });
});

async function seedReferences(connection: ReturnType<typeof createInMemoryStreamJamsDatabase>["connection"]): Promise<void> {
  const assets = new SqliteAssetRepository(connection);
  await assets.save(asset("icon", "image"));
  await assets.save(asset("start", "audio"));
  await assets.save(asset("end", "audio"));
  const insertRoute = connection.prepare("INSERT INTO audio_output_routes (id, name, device_id, device_label) VALUES (?, ?, NULL, NULL)");
  insertRoute.run("speakers", "Speakers");
  insertRoute.run("headphones", "Headphones");
}

function asset(id: string, mediaType: "image" | "audio") {
  return {
    id,
    originalFileName: `${id}.${mediaType === "image" ? "png" : "mp3"}`,
    mediaType,
    mimeType: mediaType === "image" ? "image/png" : "audio/mpeg",
    sizeBytes: 10,
    checksum: `checksum-${id}`,
    storagePath: `assets/${id}`,
    durationMs: mediaType === "audio" ? 1_000 : null
  } as const;
}
