import { timerRunStateSchema, timerStackRegionSchema } from "./schemas.js";
import type { TimerOverlayCard, TimerRunState, TimerStackProjection, TimerStackRegion } from "./types.js";
import { overlayTargetProfileIdSchema, type OverlayElementLayout, type OverlayTargetProfileId } from "../shared/schemas.js";

export function formatTimerRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${seconds.toString().padStart(2, "0")}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function projectTimerStack(input: {
  readonly nowEpochMs: number;
  readonly targetProfileId: OverlayTargetProfileId;
  readonly region: TimerStackRegion;
  readonly runs: readonly TimerRunState[];
}): TimerStackProjection {
  const targetProfileId = overlayTargetProfileIdSchema.parse(input.targetProfileId);
  const region = timerStackRegionSchema.parse(input.region);
  const runs = input.runs.map(run => timerRunStateSchema.parse(run))
    .filter(run => run.status !== "completed" || run.expiresAtEpochMs > input.nowEpochMs)
    .sort(compareRuns);
  const visible = runs.slice(0, region.maxVisible);
  const slots = createSlots(region.layout, region.orientation, visible.length);
  return {
    targetProfileId,
    region,
    cards: visible.map((run, index) => toCard(run, slots[index]!)),
    overflowCount: Math.max(0, runs.length - visible.length)
  };
}

function compareRuns(left: TimerRunState, right: TimerRunState): number {
  const group = stateRank(left) - stateRank(right);
  if (group !== 0) return group;
  const urgency = urgencyValue(left) - urgencyValue(right);
  return urgency !== 0 ? urgency : left.definitionId.localeCompare(right.definitionId);
}

function stateRank(run: TimerRunState): number {
  return run.status === "completed" ? 0 : run.status === "running" ? 1 : 2;
}

function urgencyValue(run: TimerRunState): number {
  if (run.status === "running") return run.endsAtEpochMs;
  if (run.status === "paused") return run.remainingMs;
  return 0;
}

function createSlots(
  layout: OverlayElementLayout,
  orientation: TimerStackRegion["orientation"],
  count: number
): OverlayElementLayout[] {
  if (count === 0) return [];
  return Array.from({ length: count }, (_, index) => orientation === "vertical"
    ? { ...layout, y: layout.y + layout.height * index / count, height: layout.height / count }
    : { ...layout, x: layout.x + layout.width * index / count, width: layout.width / count });
}

function toCard(run: TimerRunState, slot: OverlayElementLayout): TimerOverlayCard {
  const common = {
    definitionId: run.definitionId,
    generation: run.generation,
    label: run.snapshot.label,
    iconAssetId: run.snapshot.iconAssetId,
    slot
  };
  if (run.status === "running") return { ...common, status: "running", endsAtEpochMs: run.endsAtEpochMs };
  if (run.status === "paused") return { ...common, status: "paused", remainingMs: run.remainingMs };
  return { ...common, status: "completed", remainingMs: 0, expiresAtEpochMs: run.expiresAtEpochMs };
}
