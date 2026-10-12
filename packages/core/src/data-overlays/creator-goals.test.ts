import { describe, expect, it, vi } from "vitest";
import { DataOverlayService } from "./value-service.js";
import { dataGoalInputSchema, dataOverlayStateSchema, twitchDataSourceStatusSchema } from "./schemas.js";
import { projectDataOverlays } from "./projection.js";
import { bundledDataTemplates } from "./template-starters.js";
import type { DataOverlayState } from "./types.js";

function fixture() {
  let state: DataOverlayState = { revision: 0, values: [], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [] };
  let sequence = 0;
  const publish = vi.fn();
  const service = new DataOverlayService({ read: () => structuredClone(state), mutate: work => {
    const draft = structuredClone(state); work(draft); state = dataOverlayStateSchema.parse(draft); return structuredClone(state);
  } }, { generateId: () => `id-${++sequence}`, now: () => "2026-10-11T00:00:00Z", publish });
  return { service, publish };
}
const input = { name: "Creator goal", binding: { mode: "active-type" as const, type: "follower" as const } };

describe("provider owned Creator Goals", () => {
  it("validates active records and typed binding status without credentials", () => {
    const status = { follower: { state: "unconfigured", broadcasterId: null, valueIds: [], updatedAt: null }, goals: { state: "current", missingScopes: [], broadcasterId: "account-a", updatedAt: "2026-10-11T00:00:00Z", activeGoals: [{ id: "twitch-goal", broadcaster_id: "account-a", broadcaster_name: "Synthetic", broadcaster_login: "synthetic", type: "unknown-future-type", description: "Synthetic fixture", current_amount: 4, target_amount: 10, started_at: "2026-10-11T00:00:00Z" }], bindings: [{ goalId: "goal", valueId: "value", selectedGoalId: null, state: "ended", units: "unsupported" }] } };
    expect(twitchDataSourceStatusSchema.safeParse(status).success).toBe(true);
    for (const current_amount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(twitchDataSourceStatusSchema.safeParse({ ...status, goals: { ...status.goals, activeGoals: [{ ...status.goals.activeGoals[0], current_amount }] } }).success).toBe(false);
    expect(twitchDataSourceStatusSchema.safeParse({ ...status, goals: { ...status.goals, token: "secret" } }).success).toBe(false);
    expect(twitchDataSourceStatusSchema.safeParse({ ...status, goals: { ...status.goals, bindings: [{ ...status.goals.bindings[0], units: "subscribers" }] } }).success).toBe(false);
  });
  it("projects provider goals through existing text/bar references and hides unavailable placeholders", () => {
    const { service } = fixture(); const bound = service.createTwitchGoalBinding(input, "account-a"); const valueId = bound.values[0]!.id;
    const state = service.instantiateTemplate(bundledDataTemplates[1]!, { name: "Output", enabled: true, order: 0, outputs: { browser: true, desktop: true }, mappings: [{ slotId: "goal", mapping: { kind: "goal", goalId: bound.goals[0]!.id } }] });
    const project = (catalog: DataOverlayState, sourceStatuses?: { [id: string]: { state: "current" | "ended" } }) => projectDataOverlays(catalog, { runtimeId: "runtime", output: "browser", targetProfileId: "landscape", nowEpochMs: 0, moduleEnabled: true, outputPaused: false, resolveAssetId: () => false, ...(sourceStatuses ? { sourceStatuses } : {}) });
    expect(project(state).canvases[0]?.elements.some(element => element.kind === "progress")).toBe(false);
    const updated = service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 35, targetAmount: 50 }]);
    expect(project(updated, { [valueId]: { state: "current" } }).canvases[0]?.elements).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "progress", fill: 0.7 })]));
    expect(project(updated, { [valueId]: { state: "ended" } }).canvases[0]?.elements.some(element => element.kind === "progress")).toBe(false);
  });
  it("creates a value and readonly fixed target goal in one mutation and publication", () => {
    const { service, publish } = fixture();
    const state = service.createTwitchGoalBinding(input, "account-a");
    expect(state.revision).toBe(1); expect(publish).toHaveBeenCalledTimes(1);
    expect(state.values[0]).toMatchObject({ name: input.name, content: 0, resetDefault: 0, resetGroupId: null, source: { provider: "twitch", kind: "creator-goal", broadcasterId: "account-a", binding: input.binding } });
    expect(state.goals[0]).toMatchObject({ name: input.name, valueId: state.values[0]!.id, mode: "fixed-target", target: 1, source: { provider: "twitch", kind: "creator-goal" } });
    expect(dataOverlayStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  it("updates current and target atomically and rejects bad batches without publication", () => {
    const { service, publish } = fixture();
    const state = service.createTwitchGoalBinding(input, "account-a"); const valueId = state.values[0]!.id;
    const updated = service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 35, targetAmount: 50 }]);
    expect(updated.values[0]).toMatchObject({ content: 35, revision: 1 }); expect(updated.goals[0]).toMatchObject({ target: 50 });
    expect(updated.revision).toBe(2); expect(publish).toHaveBeenCalledTimes(2);
    for (const currentAmount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount, targetAmount: 50 }])).toThrow();
    for (const targetAmount of [0, -1, Number.MAX_SAFE_INTEGER + 1]) expect(() => service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 1, targetAmount }])).toThrow();
    expect(() => service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 1, targetAmount: 2 }, { valueId: "missing", currentAmount: 1, targetAmount: 2 }])).toThrow();
    expect(service.getState()).toEqual(updated); expect(publish).toHaveBeenCalledTimes(2);
  });
  it("rejects forged/manual provider changes and leaves custom follower goals usable", () => {
    const { service } = fixture(); const state = service.createTwitchGoalBinding(input, "account-a"); const goal = state.goals[0]!; const value = state.values[0]!;
    expect(dataGoalInputSchema.safeParse(goal).success).toBe(false);
    expect(() => service.createValue({ name: "Forged", kind: "integer", resetDefault: 0, resetGroupId: null, source: value.source } as never)).toThrow();
    for (const command of [{ action: "reset" }, { action: "add", amount: 1 }, { action: "set", content: 1, expectedRevision: 0 }] as const) expect(() => service.commandValue(value.id, command)).toThrow("read-only");
    expect(() => service.updateGoal(goal.id, { name: goal.name, valueId: goal.valueId, mode: "fixed-target", target: 99 })).toThrow("read-only");
    expect(() => service.restartGoal(goal.id)).toThrow("read-only");
    expect(() => service.createGoal({ name: "Forged", valueId: goal.valueId, mode: "fixed-target", target: 10 })).toThrow("read-only");
    service.updateGoal(goal.id, { name: "Renamed", valueId: goal.valueId, mode: "fixed-target", target: 1 });
    const follower = service.createTwitchFollowerValue("Followers", "account-a").values.find(v => v.source?.kind === "follower-total")!;
    expect(service.createGoal({ name: "Custom", valueId: follower.id, mode: "saved-baseline", baseline: 0, additionalAmount: 10 }).goals).toHaveLength(2);
  });
  it("invalidates durably through A-B-A and explicitly rebinds the same resources", () => {
    const { service } = fixture(); const state = service.createTwitchGoalBinding(input, "account-a"); const valueId = state.values[0]!.id; const goalId = state.goals[0]!.id;
    service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 9, targetAmount: 10 }]);
    service.invalidateTwitchBindingsExcept("account-b"); service.invalidateTwitchBindingsExcept("account-a");
    expect(service.getState().values[0]?.source?.invalidated).toBe(true);
    expect(() => service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 99, targetAmount: 100 }])).toThrow("read-only");
    const rebound = service.rebindTwitchGoalBinding(goalId, { name: "Rebound", binding: { mode: "pinned", goalId: "twitch-goal" } }, "account-b");
    expect(rebound.values[0]).toMatchObject({ id: valueId, name: "Rebound", content: 0, source: { broadcasterId: "account-b", binding: { mode: "pinned", goalId: "twitch-goal" } } });
    expect(rebound.values[0]?.source?.invalidated).toBeUndefined(); expect(rebound.goals[0]).toMatchObject({ id: goalId, name: "Rebound", target: 1 });
    expect(() => service.applyTwitchCreatorGoals("account-a", [{ valueId, currentAmount: 99, targetAmount: 100 }])).toThrow("read-only");
  });
  it("rejects mismatched provenance and invalid source inputs", () => {
    const { service } = fixture(); const state = service.createTwitchGoalBinding(input, "account-a");
    const forged = structuredClone(state); delete forged.values[0]!.source;
    expect(dataOverlayStateSchema.safeParse(forged).success).toBe(false);
    const unmarked = structuredClone(state); delete unmarked.goals[0]!.source;
    expect(dataOverlayStateSchema.safeParse(unmarked).success).toBe(false);
    for (const binding of [{ mode: "active-type", type: "unknown" }, { mode: "pinned", goalId: "" }, { ...input.binding, token: "secret" }]) expect(() => service.createTwitchGoalBinding({ name: "Bad", binding } as never, "account-a")).toThrow();
    expect(service.getState()).toEqual(state);
  });
});
