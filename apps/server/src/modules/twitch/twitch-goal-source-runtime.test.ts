import { DataOverlayService, type BusEvent, type DataSourceStatus } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteDataOverlayRepository } from "../data-overlays/sqlite-data-overlay-repository.js";
import { TwitchGoalSourceRuntime } from "./twitch-goal-source-runtime.js";
import { TwitchApiHttpError } from "./twitch-api-client.js";
import type { TwitchEventSubStatus } from "./twitch-eventsub-client.js";

// Synthetic records based on official schemas; no account or live token.
const goal = { id: "twitch-goal", broadcaster_id: "broadcaster", broadcaster_name: "Synthetic", broadcaster_login: "synthetic", type: "follower", description: "Synthetic goal", current_amount: 5, target_amount: 20, started_at: "2026-10-11T00:00:00Z" };
const ready: TwitchEventSubStatus = { state: "connected", sessionId: "session", message: null, connectedAt: null, lastMessageAt: null, lastErrorAt: null, referenceId: null, subscriptionTypes: ["channel.goal.begin", "channel.goal.progress", "channel.goal.end"] };
function bus(type: "goal_begin" | "goal_progress" | "goal_end", amount = 8, time = Date.now(), broadcasterId = "broadcaster"): BusEvent {
  return { kind: "canonical", sequence: 1, busId: "bus", eventId: "event", sourceKind: "twitch", sourceRegistrationId: null, receivedAt: new Date(time).toISOString(), correlationKey: null, effectTriggers: [], event: { id: "event", type, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: new Date(time).toISOString(), actor: { id: null, displayName: "Synthetic" }, message: null, metadata: {}, amount: null, broadcasterId, goalId: goal.id, goalType: goal.type, description: goal.description, currentAmount: amount, targetAmount: 20, startedAt: goal.started_at, ...(type === "goal_end" ? { endedAt: new Date(time).toISOString(), isAchieved: false } : {}) } } as BusEvent;
}
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:01Z"));
  const db = createInMemoryStreamJamsDatabase(); let id = 0;
  const service = new DataOverlayService(new SqliteDataOverlayRepository(db), { generateId: () => `data-${++id}`, now: () => new Date().toISOString() });
  service.createTwitchGoalBinding({ name: "Followers", binding: { mode: "active-type", type: "follower" } }, "broadcaster");
  service.createTwitchGoalBinding({ name: "Pinned", binding: { mode: "pinned", goalId: goal.id } }, "broadcaster");
  const getCreatorGoals = vi.fn(async () => ({ goals: [goal], rateResetEpochMs: null as number | null }));
  const statuses = new Map<string, DataSourceStatus>();
  const runtime = new TwitchGoalSourceRuntime({ service, apiClient: { getCreatorGoals, getFollowerTotal: vi.fn() }, clientId: "synthetic", getAccessToken: async () => "synthetic", now: Date.now, setStatus: (id, status) => { if (status) statuses.set(id, status); else statuses.delete(id); }, onError: vi.fn() });
  const account = { accountId: "broadcaster", login: "synthetic", displayName: "Synthetic", scopes: ["channel:read:goals"], connectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  runtime.configure(account);
  return { runtime, service, getCreatorGoals, statuses, account, db };
}
afterEach(() => vi.useRealTimers());
describe("live Creator Goal source", () => {
  it("waits for all subscriptions, buffers delayed snapshot progress and ignores older begin/replay and wrong broadcaster", async () => {
    const f = fixture(); let resolve!: (value: { goals: typeof goal[]; rateResetEpochMs: null }) => void;
    f.getCreatorGoals.mockImplementationOnce(() => new Promise(accept => { resolve = accept; }));
    f.runtime.statusChanged({ ...ready, subscriptionTypes: ready.subscriptionTypes.slice(0, 2) }); await vi.advanceTimersByTimeAsync(0); expect(f.getCreatorGoals).not.toHaveBeenCalled();
    f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    expect(f.runtime.handle(bus("goal_progress", 8, Date.now() + 2))).toBe(true);
    f.runtime.handle(bus("goal_begin", 5, Date.now() + 1)); f.runtime.handle(bus("goal_progress", 99, Date.now() + 3, "wrong"));
    resolve({ goals: [goal, { ...goal, id: "subscription", type: "subscription" }], rateResetEpochMs: null }); await vi.advanceTimersByTimeAsync(0);
    expect(f.runtime.getStatus().activeGoals).toHaveLength(2); expect(f.service.getState().values[0]?.content).toBe(8);
    f.runtime.handle(bus("goal_progress", 1, Date.now() - 1)); expect(f.service.getState().values[0]?.content).toBe(8);
    f.runtime.statusChanged({ ...ready, lastMessageAt: new Date().toISOString() }); await vi.advanceTimersByTimeAsync(0); expect(f.getCreatorGoals).toHaveBeenCalledOnce();
    await f.runtime.close(); f.db.close();
  });
  it("ends pins immediately, follows replacements and resnapshots reconnect without resurrecting tombstones", async () => {
    const f = fixture(); f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    f.runtime.handle(bus("goal_end", 8, Date.now() + 1)); f.runtime.handle(bus("goal_begin", 5, Date.now()));
    expect(f.runtime.getStatus().bindings.map(binding => binding.state)).toEqual(["ended", "ended"]);
    const next = bus("goal_begin", 2, Date.now() + 2);
    if (next.kind === "canonical" && next.event.type === "goal_begin") f.runtime.handle({ ...next, event: { ...next.event, goalId: "replacement", startedAt: new Date(Date.now() + 2).toISOString() } });
    expect(f.runtime.getStatus().bindings.map(binding => binding.state)).toEqual(["current", "ended"]);
    f.getCreatorGoals.mockResolvedValue({ goals: [{ ...goal, id: "replacement" }], rateResetEpochMs: null });
    f.runtime.statusChanged({ ...ready, state: "reconnecting" }); f.runtime.statusChanged({ ...ready, sessionId: "next-session" }); await vi.advanceTimersByTimeAsync(0);
    f.runtime.handle(bus("goal_begin", 5, Date.now() - 1)); expect(f.runtime.getStatus().activeGoals.map(goal => goal.id)).toEqual(["replacement"]);
    await f.runtime.close(); f.db.close();
  });
  it("resnapshots overflow and discards obsolete maintenance/account responses", async () => {
    const f = fixture(); let resolve!: (value: { goals: typeof goal[]; rateResetEpochMs: null }) => void;
    f.getCreatorGoals.mockImplementationOnce(() => new Promise(accept => { resolve = accept; }));
    f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 101; index++) f.runtime.handle(bus("goal_progress", index, Date.now() + index));
    resolve({ goals: [goal], rateResetEpochMs: null }); await vi.advanceTimersByTimeAsync(1); expect(f.getCreatorGoals).toHaveBeenCalledTimes(2);
    f.getCreatorGoals.mockImplementationOnce(() => new Promise(accept => { resolve = accept; }));
    f.runtime.statusChanged({ ...ready, sessionId: "second" }); await vi.advanceTimersByTimeAsync(0);
    f.runtime.suspend(); f.runtime.configure({ ...f.account, accountId: "other" }); resolve({ goals: [{ ...goal, current_amount: 99 }], rateResetEpochMs: null }); await vi.advanceTimersByTimeAsync(0);
    expect(f.service.getState().values[0]?.content).toBe(5); expect(f.runtime.getStatus().bindings[0]?.state).toBe("invalid");
    await f.runtime.close(); f.db.close();
  });
  it("honors retry/reset deadlines and republishes stale expiry", async () => {
    const f = fixture(); f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    f.getCreatorGoals.mockRejectedValue(new TwitchApiHttpError(429, Date.now() + 800_000));
    // A ready-session replacement requires fresh authoritative state.
    f.runtime.statusChanged({ ...ready, sessionId: "second" }); await vi.advanceTimersByTimeAsync(0);
    expect(f.runtime.getStatus().state).toBe("stale");
    await vi.advanceTimersByTimeAsync(600_001); expect(f.runtime.getStatus().state).toBe("error"); expect([...f.statuses.values()]).toEqual([{ state: "invalid" }, { state: "invalid" }]);
    expect(f.getCreatorGoals).toHaveBeenCalledTimes(2); await vi.advanceTimersByTimeAsync(199_999); expect(f.getCreatorGoals).toHaveBeenCalledTimes(3);
    await f.runtime.close(); f.db.close();
  });
  it("hides ended goals during a pending resnapshot and preserves the end when HTTP fails", async () => {
    const f = fixture(); f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    let reject!: (error: Error) => void;
    f.getCreatorGoals.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    f.runtime.statusChanged({ ...ready, sessionId: "replacement" }); await vi.advanceTimersByTimeAsync(0);
    f.runtime.handle(bus("goal_end", 8, Date.now() + 1));
    expect(f.runtime.getStatus().activeGoals).toEqual([]);
    expect([...f.statuses.values()].every(status => status.state !== "current")).toBe(true);
    reject(new TwitchApiHttpError(500)); await vi.advanceTimersByTimeAsync(0);
    expect(f.runtime.getStatus().bindings.map(binding => binding.state)).toEqual(["ended", "ended"]);
    expect([...f.statuses.values()]).toEqual([{ state: "ended" }, { state: "ended" }]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.runtime.getStatus().activeGoals).toEqual([]);
    await f.runtime.close(); f.db.close();
  });
  it("invalidates retained provider values after their native goal is deleted", async () => {
    const f = fixture(); f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    const native = f.service.getState().goals[0]!;
    expect(f.statuses.get(native.valueId)).toEqual({ state: "current" });
    f.service.deleteGoal(native.id); f.runtime.reconcile();
    expect(f.service.getState().values.some(value => value.id === native.valueId)).toBe(true);
    expect(f.statuses.get(native.valueId)).toEqual({ state: "invalid" });
    expect(f.runtime.getStatus().bindings).toHaveLength(1);
    await f.runtime.close(); f.db.close();
  });
  it("distinguishes temporary optional subscription failures from permission revocation", async () => {
    const f = fixture();
    const incomplete = { ...ready, subscriptionTypes: ["channel.follow"] };
    f.runtime.statusChanged({ ...incomplete, goalSubscriptionFailure: "temporary" });
    expect(f.runtime.getStatus()).toMatchObject({ state: "error", missingScopes: [] });
    f.runtime.statusChanged({ ...incomplete, goalSubscriptionFailure: "reauthorization-required" });
    expect(f.runtime.getStatus()).toMatchObject({ state: "reauthorization-required", missingScopes: ["channel:read:goals"] });
    f.runtime.statusChanged(ready); await vi.advanceTimersByTimeAsync(0);
    expect(f.runtime.getStatus()).toMatchObject({ state: "current", missingScopes: [] });
    f.runtime.statusChanged({ ...incomplete, goalSubscriptionFailure: "temporary" });
    expect(f.runtime.getStatus()).toMatchObject({ state: "stale", missingScopes: [] });
    await f.runtime.close(); f.db.close();
  });
});
