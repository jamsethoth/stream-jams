import { describe, expect, it } from "vitest";
import * as core from "../index.js";

type ProjectionApi = {
  formatTimerRemaining(value: number): string;
  projectTimerStack(input: unknown): {
    readonly cards: readonly {
      readonly definitionId: string;
      readonly label: string;
      readonly status: string;
      readonly slot: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly zIndex: number };
    }[];
    readonly overflowCount: number;
  };
};

function api(): ProjectionApi {
  expect(typeof (core as Record<string, unknown>).formatTimerRemaining).toBe("function");
  expect(typeof (core as Record<string, unknown>).projectTimerStack).toBe("function");
  return core as unknown as ProjectionApi;
}

function snapshot(id: string, label = id) {
  return {
    id,
    label,
    durationMs: 60_000,
    iconAssetId: null,
    startAudioAssetId: null,
    endAudioAssetId: null,
    outputs: { browserSource: false, deviceRouteIds: [] }
  };
}

function running(id: string, endsAtEpochMs: number) {
  return { status: "running", definitionId: id, generation: `g-${id}`, snapshot: snapshot(id), startedAtEpochMs: 0, endsAtEpochMs };
}

function paused(id: string, remainingMs: number) {
  return { status: "paused", definitionId: id, generation: `g-${id}`, snapshot: snapshot(id), remainingMs };
}

function completed(id: string) {
  return { status: "completed", definitionId: id, generation: `g-${id}`, snapshot: snapshot(id), completedAtEpochMs: 5_000, expiresAtEpochMs: 8_000 };
}

describe("timer projection", () => {
  it("formats positive countdowns by ceiling to M:SS and H:MM:SS", () => {
    const { formatTimerRemaining } = api();

    expect(formatTimerRemaining(0)).toBe("0:00");
    expect(formatTimerRemaining(1)).toBe("0:01");
    expect(formatTimerRemaining(59_001)).toBe("1:00");
    expect(formatTimerRemaining(3_600_000)).toBe("1:00:00");
    expect(formatTimerRemaining(3_661_000)).toBe("1:01:01");
  });

  it("sorts completed, running, and paused cards with stable identity ties", () => {
    const { projectTimerStack } = api();
    const projection = projectTimerStack({
      nowEpochMs: 4_000,
      targetProfileId: "landscape",
      region: { layout: { x: 10, y: 20, width: 600, height: 300, zIndex: 2 }, orientation: "vertical", maxVisible: 8 },
      runs: [paused("paused-late", 20_000), running("running-z", 15_000), completed("complete"), running("running-a", 15_000), paused("paused-early", 10_000)]
    });

    expect(projection.cards.map(card => card.definitionId)).toEqual([
      "complete",
      "running-a",
      "running-z",
      "paused-early",
      "paused-late"
    ]);
  });

  it("creates equal vertical slots and reports overflow without consuming a slot", () => {
    const { projectTimerStack } = api();
    const projection = projectTimerStack({
      nowEpochMs: 0,
      targetProfileId: "vertical",
      region: { layout: { x: 10, y: 20, width: 300, height: 360, zIndex: 4 }, orientation: "vertical", maxVisible: 3 },
      runs: [running("a", 1_000), running("b", 2_000), running("c", 3_000), running("d", 4_000), running("e", 5_000)]
    });

    expect(projection.cards).toHaveLength(3);
    expect(projection.cards.map(card => card.slot)).toEqual([
      { x: 10, y: 20, width: 300, height: 120, zIndex: 4 },
      { x: 10, y: 140, width: 300, height: 120, zIndex: 4 },
      { x: 10, y: 260, width: 300, height: 120, zIndex: 4 }
    ]);
    expect(projection.overflowCount).toBe(2);
  });

  it("creates equal horizontal slots without changing full labels", () => {
    const { projectTimerStack } = api();
    const longLabel = "Oven mitts for the cat paws reward";
    const projection = projectTimerStack({
      nowEpochMs: 0,
      targetProfileId: "landscape",
      region: { layout: { x: 0, y: 0, width: 600, height: 180, zIndex: 1 }, orientation: "horizontal", maxVisible: 2 },
      runs: [running("a", 1_000), { ...running("b", 2_000), snapshot: snapshot("b", longLabel) }]
    });

    expect(projection.cards.map(card => card.slot)).toEqual([
      { x: 0, y: 0, width: 300, height: 180, zIndex: 1 },
      { x: 300, y: 0, width: 300, height: 180, zIndex: 1 }
    ]);
    expect(projection.cards[1]?.label).toBe(longLabel);
  });
});
