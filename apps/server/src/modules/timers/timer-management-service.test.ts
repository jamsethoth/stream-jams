import { describe, expect, it } from "vitest";
import type { TimerDefinition } from "@stream-jams/core";

async function loadService() {
  const path = "./timer-management-service.js";
  return import(/* @vite-ignore */ path) as Promise<Record<string, new(options: unknown) => TimerService>>;
}

interface TimerService {
  listDefinitions(): readonly TimerDefinition[];
  getDefinition(id: string): TimerDefinition;
  createDefinition(input: unknown): TimerDefinition;
  updateDefinition(id: string, input: unknown): TimerDefinition;
  deleteDefinition(id: string): void;
}

function input(label = "Cat Paws") {
  return {
    label,
    durationMs: 300_000,
    iconAssetId: null,
    startAudioAssetId: null,
    endAudioAssetId: null,
    outputs: { browserSource: false, deviceRouteIds: [] }
  };
}

describe("TimerManagementService", () => {
  it("creates stable identities and preserves audit identity on update", async () => {
    const module = await loadService();
    const definitions = new Map<string, TimerDefinition>();
    const Service = module.TimerManagementService!;
    const service = new Service({
      repository: memoryRepository(definitions),
      activity: { isActive: () => false },
      generateId: () => "timer-generated",
      now: () => new Date("2026-09-28T12:00:00.000Z")
    });

    expect(service.createDefinition(input())).toEqual({
      id: "timer-generated",
      ...input(),
      createdAt: "2026-09-28T12:00:00.000Z",
      updatedAt: "2026-09-28T12:00:00.000Z"
    });
    const updated = service.updateDefinition("timer-generated", input("Oven Mitts"));
    expect(updated.id).toBe("timer-generated");
    expect(updated.createdAt).toBe("2026-09-28T12:00:00.000Z");
    expect(updated.label).toBe("Oven Mitts");
    expect(service.listDefinitions()).toEqual([updated]);
  });

  it("rejects deletion while running, paused, or completed", async () => {
    const module = await loadService();
    const definitions = new Map<string, TimerDefinition>();
    definitions.set("active", { id: "active", ...input(), createdAt: "2026-09-28T12:00:00.000Z", updatedAt: "2026-09-28T12:00:00.000Z" });
    const Service = module.TimerManagementService!;
    const service = new Service({
      repository: memoryRepository(definitions),
      activity: { isActive: (id: string) => id === "active" }
    });

    expect(() => service.deleteDefinition("active")).toThrow(/stop.*before deleting/i);
    expect(definitions.has("active")).toBe(true);
  });

  it("returns immutable admitted snapshots without audit timestamps", async () => {
    const module = await loadService();
    const definition: TimerDefinition = {
      id: "timer-a",
      ...input(),
      createdAt: "2026-09-28T12:00:00.000Z",
      updatedAt: "2026-09-28T12:00:00.000Z"
    };
    const snapshot = (module.snapshotTimerDefinition as unknown as (value: TimerDefinition) => Record<string, unknown>)(definition);

    expect(snapshot).toEqual({ id: "timer-a", ...input() });
    expect(snapshot).not.toHaveProperty("createdAt");
    expect(snapshot).not.toHaveProperty("updatedAt");
    expect(snapshot).not.toBe(definition);
  });
});

function memoryRepository(definitions: Map<string, TimerDefinition>) {
  return {
    list: () => [...definitions.values()],
    findById: (id: string) => definitions.get(id) ?? null,
    save: (definition: TimerDefinition) => {
      definitions.set(definition.id, structuredClone(definition));
      return definition;
    },
    delete: (id: string) => { definitions.delete(id); },
    findByAssetId: () => [],
    findByAudioRouteId: () => []
  };
}
