import { DataOverlayService, projectDataOverlays, type BusEvent, type DataSourceStatus } from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteDataOverlayRepository } from "../data-overlays/sqlite-data-overlay-repository.js";
import type { TwitchAccount } from "./twitch-account-repository.js";
import { createTwitchTokenSecretRef, defaultTwitchOAuthScopes } from "./twitch-oauth-service.js";
import { TwitchApiHttpError } from "./twitch-api-client.js";
import { TwitchDataSourceRuntime } from "./twitch-data-source-runtime.js";

// Invented provider responses derived from Twitch's documented total field; no live account evidence.
async function fixture(configured = true) {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
  const db = createInMemoryStreamJamsDatabase(); let id = 0;
  const service = new DataOverlayService(new SqliteDataOverlayRepository(db), { generateId: () => `value-${++id}`, now: () => new Date().toISOString() });
  if (configured) service.createTwitchFollowerValue("Followers", "broadcaster");
  let account: TwitchAccount | null = { accountId: "broadcaster", login: "synthetic", displayName: "Synthetic", scopes: defaultTwitchOAuthScopes, connectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const repository = { findConnectedAccount: async () => account, saveAccount: async (value: TwitchAccount) => { account = value; return value; }, deleteAccount: async () => { account = null; } };
  const secretStore = new InMemorySecretStore(); await secretStore.setSecret(createTwitchTokenSecretRef("broadcaster", "access_token"), "synthetic-token");
  const getFollowerTotal = vi.fn(async () => ({ total: 1000, rateResetEpochMs: null as number | null }));
  const statuses = new Map<string, DataSourceStatus>();
  const runtime = new TwitchDataSourceRuntime({ service, repository, secretStore, clientId: "synthetic-client", apiClient: { getFollowerTotal, getCreatorGoals: vi.fn() }, setStatus: (valueId, status) => { if (status === null) statuses.delete(valueId); else statuses.set(valueId, status); } });
  return { db, service, repository, getFollowerTotal, runtime, statuses, setAccount: (value: TwitchAccount | null) => { account = value; } };
}
afterEach(() => vi.useRealTimers());
describe("authoritative Twitch follower source", () => {
  it("refreshes canonical Streamer.bot follow hints and rejects explicit wrong-account hints", async () => {
    const f = await fixture(); await f.runtime.connectionChanged();
    const event: BusEvent = { kind: "canonical", sequence: 1, busId: "synthetic-bus", eventId: "synthetic-follow", sourceKind: "streamerbot", sourceRegistrationId: null, receivedAt: new Date().toISOString(), correlationKey: null, effectTriggers: [], event: { id: "synthetic-follow", type: "follow", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "streamerbot", occurredAt: new Date().toISOString(), actor: { id: "synthetic-viewer", displayName: "Synthetic" }, amount: null, message: null, metadata: {} } };
    expect(f.runtime.handleBusEvent(event)).toBe("admitted");
    if (event.kind === "canonical") expect(f.runtime.handleBusEvent({ ...event, event: { ...event.event, metadata: { twitchBroadcasterUserId: "wrong-account" } } })).toBe("no-match");
    await vi.advanceTimersByTimeAsync(10_000); expect(f.getFollowerTotal).toHaveBeenCalledTimes(2);
    await f.runtime.close(); f.db.close();
  });
  it("does no network work without an explicitly configured source and keeps optional goal scope separate", async () => {
    const f = await fixture(false); await f.runtime.connectionChanged();
    expect(f.getFollowerTotal).not.toHaveBeenCalled();
    expect(f.runtime.getStatus()).toMatchObject({ follower: { state: "unconfigured", broadcasterId: "broadcaster" }, goals: { state: "reauthorization-required", missingScopes: ["channel:read:goals"] } });
    const account = await f.repository.findConnectedAccount();
    f.setAccount({ ...account!, scopes: [...account!.scopes, "channel:read:goals"] });
    await f.runtime.connectionChanged();
    expect(f.runtime.getStatus().goals).toMatchObject({ state: "waiting", missingScopes: [] });
    await f.runtime.createFollowerSource("Follower total"); await vi.advanceTimersByTimeAsync(0);
    expect(f.getFollowerTotal).toHaveBeenCalledOnce();
    await f.runtime.close(); f.db.close();
  });
  it("replaces authoritative totals including decreases, polls at60s and throttles early hints", async () => {
    const f = await fixture(); await f.runtime.connectionChanged();
    expect(f.service.getState().values[0]?.content).toBe(1000);
    f.getFollowerTotal.mockResolvedValue({ total: 990, rateResetEpochMs: null });
    for (let i = 0; i < 20; i++) f.runtime.requestEarlyRefresh();
    await vi.advanceTimersByTimeAsync(9999); expect(f.getFollowerTotal).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(f.getFollowerTotal).toHaveBeenCalledTimes(2);
    expect(f.service.getState().values[0]?.content).toBe(990);
    await vi.advanceTimersByTimeAsync(59_999); expect(f.getFollowerTotal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(f.getFollowerTotal).toHaveBeenCalledTimes(3);
    await f.runtime.close(); f.db.close();
  });
  it("discards old epoch responses and invalidates old broadcaster bindings immediately", async () => {
    const f = await fixture(); let resolve!: (value: { total: number; rateResetEpochMs: null }) => void;
    f.getFollowerTotal.mockImplementationOnce(() => new Promise(accept => { resolve = accept; }));
    const old = f.runtime.connectionChanged(); await vi.advanceTimersByTimeAsync(0);
    await f.runtime.connectionChanged();
    resolve({ total: 123, rateResetEpochMs: null }); await old;
    expect(f.service.getState().values[0]?.content).toBe(1000);
    const oldAccount = await f.repository.findConnectedAccount(); f.setAccount({ ...oldAccount!, accountId: "different" });
    await f.runtime.connectionChanged(); expect(f.statuses.get("value-1")).toEqual({ state: "invalid" });
    expect(f.runtime.getStatus().follower.state).toBe("invalid");
    expect(f.service.getState().values[0]?.source?.invalidated).toBe(true);
    f.setAccount(oldAccount); await f.runtime.connectionChanged();
    expect(f.runtime.getStatus().follower.state).toBe("invalid"); expect(f.runtime.getStatus().follower.valueIds).toEqual([]);
    f.setAccount(null); await f.runtime.connectionChanged(); expect(f.runtime.getStatus().follower.state).toBe("disconnected");
    await f.runtime.close(); f.db.close();
  });
  it("keeps stale grace from first failure and honors later reset and retry-after beyond nominal cap", async () => {
    const f = await fixture(); await f.runtime.connectionChanged();
    const reset = Date.now() + 700_000;
    f.getFollowerTotal.mockRejectedValueOnce(new TwitchApiHttpError(429, reset, 800_000));
    await vi.advanceTimersByTimeAsync(60_000);
    const firstStale = Date.now();
    expect(f.statuses.get("value-1")).toEqual({ state: "stale", staleSinceEpochMs: firstStale });
    f.runtime.requestEarlyRefresh(); await vi.advanceTimersByTimeAsync(799_999); expect(f.getFollowerTotal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(f.getFollowerTotal).toHaveBeenCalledTimes(3);
    expect(f.statuses.get("value-1")).toEqual({ state: "current" });
    await f.runtime.close(); f.db.close();
  });
  it("backs off exponentially and never lets failed initial fetch expose saved provider content", async () => {
    const f = await fixture(); f.service.replaceTwitchFollowerTotal("broadcaster", 500);
    f.getFollowerTotal.mockRejectedValue(new TwitchApiHttpError(503)); await f.runtime.connectionChanged();
    expect(f.statuses.get("value-1")).toEqual({ state: "invalid" });
    await vi.advanceTimersByTimeAsync(10_000); expect(f.getFollowerTotal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19_999); expect(f.getFollowerTotal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(f.getFollowerTotal).toHaveBeenCalledTimes(3);
    await f.runtime.close(); f.db.close();
  });
  it("protects source writes and reset membership while allowing saved baseline goals", async () => {
    const f = await fixture(); await f.runtime.connectionChanged(); const value = f.service.getState().values[0]!;
    for (const command of [{ action: "set", content: 1, expectedRevision: value.revision }, { action: "add", amount: 1 }, { action: "subtract", amount: 1 }, { action: "reset" }] as const) expect(() => f.service.commandValue(value.id, command)).toThrow("read-only");
    expect(() => f.service.updateValue(value.id, { resetDefault: 2 })).toThrow("read-only");
    expect(() => f.service.updateValue(value.id, { resetGroupId: null })).toThrow("read-only");
    const goal = f.service.createGoal({ name: "Fifty more", mode: "saved-baseline", valueId: value.id, baseline: 0, additionalAmount: 50 }).goals[0]!;
    expect(f.service.restartGoal(goal.id).goals[0]).toMatchObject({ baseline: 1000 });
    expect(f.service.getState().values[0]?.content).toBe(1000);
    await f.runtime.close(); f.db.close();
  });
  it("chunks future rate deadlines to the Node timer maximum without a1ms retry loop", async () => {
    const f = await fixture(); const timer = vi.spyOn(globalThis, "setTimeout");
    f.getFollowerTotal.mockRejectedValue(new TwitchApiHttpError(429, Date.now() + 3_000_000_000));
    await f.runtime.connectionChanged();
    expect(timer.mock.calls.at(-1)?.[1]).toBe(2_147_483_647);
    await vi.advanceTimersByTimeAsync(100); expect(f.getFollowerTotal).toHaveBeenCalledOnce();
    timer.mockRestore(); await f.runtime.close(); f.db.close();
  });
  it("invalidates in-flight source work before maintenance and revalidates after restore", async () => {
    const f = await fixture(); await f.runtime.connectionChanged();
    let resolve!: (value: { total: number; rateResetEpochMs: null }) => void;
    f.getFollowerTotal.mockImplementationOnce(() => new Promise(accept => { resolve = accept; }));
    f.runtime.requestEarlyRefresh(); await vi.advanceTimersByTimeAsync(10_000);
    f.runtime.suspendForMaintenance(); expect(f.statuses.get("value-1")).toEqual({ state: "invalid" });
    resolve({ total: 777, rateResetEpochMs: null }); await vi.advanceTimersByTimeAsync(0);
    expect(f.service.getState().values[0]?.content).toBe(1000);
    f.getFollowerTotal.mockResolvedValue({ total: 990, rateResetEpochMs: null }); await f.runtime.resumeAfterMaintenance();
    expect(f.service.getState().values[0]?.content).toBe(990); expect(f.statuses.get("value-1")).toEqual({ state: "current" });
    await f.runtime.close(); f.db.close();
  });
  it("fails closed if source status is absent after restore", async () => {
    const f = await fixture(); f.service.createCanvas({ name: "Source", enabled: true, order: 0, targetProfileId: "landscape", outputs: { browser: true, desktop: true }, elements: [{ id: "text", kind: "text", order: 0, x: 0, y: 0, width: 100, height: 30, visible: true, stalePolicy: "retain-last", binding: { kind: "value", valueId: "value-1" }, literalText: "", format: { thousandsSeparator: false, prefix: "", suffix: "", overflow: "wrap" }, style: { fontSizePx: 16, color: "#FFFFFFFF", fontWeight: 400, align: "left" } }] });
    expect(projectDataOverlays(f.service.getState(), { runtimeId: "test", output: "browser", targetProfileId: "landscape", nowEpochMs: Date.now(), moduleEnabled: true, outputPaused: false, resolveAssetId: () => false }).canvases[0]?.elements).toEqual([]);
    await f.runtime.close(); f.db.close();
  });
});
