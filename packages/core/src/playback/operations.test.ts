import { describe, expect, it } from "vitest";
import { mergeOperations, type OperationRow, type OwnerOperationsSnapshot } from "./operations.js";

function row(input: Partial<OperationRow> & Pick<OperationRow, "moduleId" | "occurrenceId">): OperationRow {
  return {
    moduleId: input.moduleId,
    occurrenceId: input.occurrenceId,
    name: input.name ?? "Playback",
    summary: input.summary ?? "Manual",
    status: input.status ?? "queued",
    enqueuedAtMs: input.enqueuedAtMs ?? 1_000,
    completedAtMs: input.completedAtMs ?? null,
    sequence: input.sequence ?? 0,
    moduleQueuePosition: input.moduleQueuePosition ?? null
  };
}

function owner(moduleId: string, input: Partial<OwnerOperationsSnapshot> = {}): OwnerOperationsSnapshot {
  return {
    moduleId,
    paused: input.paused ?? false,
    current: input.current ?? null,
    queued: input.queued ?? [],
    recent: input.recent ?? []
  };
}

describe("mergeOperations", () => {
  it("keeps actual module positions while displaying enqueue chronology", () => {
    const early = row({ moduleId: "screen-effects", occurrenceId: "e", enqueuedAtMs: 1_000, sequence: 1, moduleQueuePosition: 2 });
    const late = row({ moduleId: "screen-effects", occurrenceId: "priority", enqueuedAtMs: 2_000, sequence: 2, moduleQueuePosition: 1 });
    const result = mergeOperations([owner("screen-effects", { queued: [late, early] })], { paused: false, muted: false, doNotDisturb: false }, 1);

    expect(result.queued.map((item) => [item.occurrenceId, item.moduleQueuePosition])).toEqual([
      ["e", 2],
      ["priority", 1]
    ]);
  });

  it("uses stable module and occurrence ties without changing owner snapshots", () => {
    const owners = [
      owner("screen-effects", {
        paused: true,
        current: row({ moduleId: "screen-effects", occurrenceId: "effect", status: "playing" }),
        queued: [row({ moduleId: "screen-effects", occurrenceId: "z", enqueuedAtMs: 2_000, sequence: 0, moduleQueuePosition: 1 })],
        recent: [row({ moduleId: "screen-effects", occurrenceId: "old-effect", status: "failed", completedAtMs: 3_000 })]
      }),
      owner("alerts", {
        current: row({ moduleId: "alerts", occurrenceId: "alert", status: "playing" }),
        queued: [row({ moduleId: "alerts", occurrenceId: "a", enqueuedAtMs: 2_000, sequence: 0, moduleQueuePosition: 1 })],
        recent: [row({ moduleId: "alerts", occurrenceId: "old-alert", status: "completed", completedAtMs: 4_000 })]
      })
    ];

    const result = mergeOperations(owners, { paused: true, muted: true, doNotDisturb: false }, 7);

    expect(result).toMatchObject({ revision: 7, paused: true, muted: true, doNotDisturb: false });
    expect(result.owners).toEqual([
      { moduleId: "alerts", paused: false },
      { moduleId: "screen-effects", paused: true }
    ]);
    expect(result.current.map((item) => item.moduleId)).toEqual(["alerts", "screen-effects"]);
    expect(result.queued.map((item) => item.occurrenceId)).toEqual(["a", "z"]);
    expect(result.recent.map((item) => item.occurrenceId)).toEqual(["old-alert", "old-effect"]);
    expect(owners[0]!.queued[0]!.moduleQueuePosition).toBe(1);
  });

  it("does not truncate an owner queue while projecting authoritative state", () => {
    const queued = Array.from({ length: 101 }, (_, index) => row({
      moduleId: "alerts",
      occurrenceId: `alert-${index}`,
      sequence: index,
      moduleQueuePosition: index + 1
    }));

    expect(mergeOperations(
      [owner("alerts", { queued })],
      { paused: false, muted: false, doNotDisturb: false },
      1
    ).queued).toHaveLength(101);
  });
});
