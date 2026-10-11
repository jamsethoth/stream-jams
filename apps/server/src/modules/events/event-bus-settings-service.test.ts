import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { EventBusSettingsService } from "./event-bus-settings-service.js";

describe("EventBusSettingsService", () => {
  it("defaults to a two-minute replay age, saves within range and reloads after a restore", () => {
    using database = createInMemoryStreamJamsDatabase();
    const service = new EventBusSettingsService(database.connection, () => new Date("2026-10-08T12:00:00.000Z"));
    expect(service.get()).toEqual({ replayAgeSeconds: 120 });
    expect(service.replayAgeMs()).toBe(120_000);

    expect(service.save({ replayAgeSeconds: 1_800 })).toEqual({ replayAgeSeconds: 1_800 });
    expect(new EventBusSettingsService(database.connection).get()).toEqual({ replayAgeSeconds: 1_800 });
    expect(() => service.save({ replayAgeSeconds: 1_801 })).toThrow();
    expect(service.get()).toEqual({ replayAgeSeconds: 1_800 });

    database.connection.prepare("UPDATE event_bus_settings SET replay_age_seconds = 0").run();
    expect(service.get()).toEqual({ replayAgeSeconds: 1_800 });
    expect(service.reload()).toEqual({ replayAgeSeconds: 0 });
    expect(service.replayAgeMs()).toBe(0);
  });
});
