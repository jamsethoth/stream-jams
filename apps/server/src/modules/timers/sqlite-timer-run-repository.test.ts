import { expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteTimerDefinitionRepository } from "./sqlite-timer-definition-repository.js";
import { SqliteTimerRunRepository } from "./sqlite-timer-run-repository.js";
import type { TimerDefinition } from "@stream-jams/core";
import { snapshotTimerDefinition } from "./timer-management-service.js";

it("persists rules and paused recovery snapshots, rolls back invalid references, and cascades deletion", () => {
  using database = createInMemoryStreamJamsDatabase();
  const definitions = new SqliteTimerDefinitionRepository(database.connection);
  const definition: TimerDefinition = { id: "a", label: "Subathon", durationMs: 10000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] }, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", eventRules: [{ enabled: true, selector: { match: { kind: "canonical", type: "cheer" }, sources: "any", conditions: [] }, action: "increment", amountMs: 30000, quantityUnit: 100, inactiveBehavior: "ignore" }] };
  definitions.save(definition);
  expect(definitions.findById("a")).toEqual(definition);
  const runs = new SqliteTimerRunRepository(database.connection);
  const state = { status: "paused" as const, definitionId: "a", generation: "g", snapshot: definition, remainingMs: 5000 };
  // Runtime snapshots contain definition presentation, not authoring timestamps.
  const snapshot = snapshotTimerDefinition(definition);
  runs.replace([{ ...state, snapshot }]);
  expect(runs.list()[0]).toMatchObject({ remainingMs: 5000 });
  expect(() => runs.replace([{ ...state, snapshot, definitionId: "missing" }])).toThrow();
  expect(runs.list()).toHaveLength(1);
  definitions.delete("a"); expect(runs.list()).toEqual([]);
});
