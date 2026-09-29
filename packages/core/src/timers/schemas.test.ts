import { describe, expect, it } from "vitest";
import * as core from "../index.js";

type RuntimeSchema = {
  parse(value: unknown): unknown;
  safeParse(value: unknown): { readonly success: boolean };
};

function schema(name: string): RuntimeSchema {
  const value = (core as Record<string, unknown>)[name];
  expect(value, `${name} must be exported`).toBeDefined();
  return value as RuntimeSchema;
}

const validDefinition = {
  id: "timer-cat-paws",
  label: "Cat Paws",
  durationMs: 300_000,
  iconAssetId: "asset-icon",
  startAudioAssetId: "asset-start",
  endAudioAssetId: "asset-end",
  outputs: { browserSource: true, deviceRouteIds: ["headphones"] },
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z"
};

describe("timer schemas", () => {
  it("normalizes valid reusable definitions and rejects invalid fields", () => {
    const definitionSchema = schema("timerDefinitionSchema");

    expect(definitionSchema.parse({ ...validDefinition, label: "  Cat Paws  " })).toEqual(validDefinition);
    expect(definitionSchema.safeParse({ ...validDefinition, durationMs: 0 }).success).toBe(false);
    expect(definitionSchema.safeParse({ ...validDefinition, outputs: { browserSource: true, deviceRouteIds: ["headphones", "headphones"] } }).success).toBe(false);
    expect(definitionSchema.safeParse({ ...validDefinition, unexpected: true }).success).toBe(false);
  });

  it("validates running, paused, and completed generation identity", () => {
    const runSchema = schema("timerRunStateSchema");
    const snapshot = {
      id: validDefinition.id,
      label: validDefinition.label,
      durationMs: validDefinition.durationMs,
      iconAssetId: validDefinition.iconAssetId,
      startAudioAssetId: validDefinition.startAudioAssetId,
      endAudioAssetId: validDefinition.endAudioAssetId,
      outputs: validDefinition.outputs
    };

    expect(runSchema.safeParse({
      status: "running",
      definitionId: validDefinition.id,
      generation: "generation-1",
      snapshot,
      startedAtEpochMs: 1_000,
      endsAtEpochMs: 301_000
    }).success).toBe(true);
    expect(runSchema.safeParse({
      status: "paused",
      definitionId: validDefinition.id,
      generation: "generation-1",
      snapshot,
      remainingMs: 42_000
    }).success).toBe(true);
    expect(runSchema.safeParse({
      status: "completed",
      definitionId: validDefinition.id,
      generation: "generation-1",
      snapshot,
      completedAtEpochMs: 301_000,
      expiresAtEpochMs: 304_000
    }).success).toBe(true);
    expect(runSchema.safeParse({
      status: "running",
      definitionId: validDefinition.id,
      generation: " ",
      snapshot,
      startedAtEpochMs: 1_000,
      endsAtEpochMs: 301_000
    }).success).toBe(false);
  });

  it("requires command results to carry the resulting allowlisted state", () => {
    const commandResultSchema = schema("timerCommandResultSchema");

    expect(commandResultSchema.safeParse({ changed: false, state: null }).success).toBe(true);
    expect(commandResultSchema.safeParse({ changed: "yes", state: null }).success).toBe(false);
    expect(commandResultSchema.safeParse({ changed: false, state: null, token: "secret" }).success).toBe(false);
  });

  it("retains a strict normalized timer presentation in overlay snapshots", () => {
    const presentation = {
      kind: "timer-stack",
      stack: {
        targetProfileId: "landscape",
        region: { layout: { x: 0, y: 0, width: 400, height: 200, zIndex: 1 }, orientation: "vertical", maxVisible: 2 },
        cards: [],
        overflowCount: 0
      }
    };
    const parsed = core.overlayModuleSnapshotSchema.parse({
      moduleId: "timers",
      enabled: true,
      instructions: [],
      presentation
    });

    expect(parsed.presentation).toEqual(presentation);
    expect(core.overlayModuleSnapshotSchema.safeParse({
      moduleId: "timers",
      enabled: true,
      instructions: [],
      presentation: { ...presentation, leak: "not allowed" }
    }).success).toBe(false);
  });
});
