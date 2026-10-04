import { describe, expect, it, vi } from "vitest";
import { AutomationControlService } from "./automation-control-service.js";
import { PlaybackOperationsService } from "../playback/playback-operations-service.js";
import type { QueueOwner } from "@stream-jams/core";

function fixture() {
  let paused = false;
  const owner: QueueOwner = { moduleId: "alerts", snapshot: () => ({ moduleId: "alerts", paused, current: null, queued: [], recent: [] }),
    setPaused: async value => { paused = value; }, skip: async () => false, remove: async () => false, replay: async () => false, clearPending: async () => 0 };
  const playback = new PlaybackOperationsService({ owners: [owner], initialSafety: { paused: false, muted: false, doNotDisturb: false },
    persistSafety: async patch => ({ paused: false, muted: false, doNotDisturb: false, ...patch }), applySafety: async () => {} });
  const timers = { listStates: () => [], activate: vi.fn(async () => ({ changed: true, state: null })), reset: vi.fn(), stopActive: vi.fn(), adjustActive: vi.fn(), togglePaused: vi.fn() };
  const service = new AutomationControlService({ timers, definitions: { listDefinitions: () => [] }, playback, now: () => 1000, runtimeId: "runtime" });
  return { service, timers };
}
const grant = { scopes: ["timers:read", "timers:control", "playback:read", "playback:pause:alerts"] };
describe("AutomationControlService", () => {
  it("does not mutate on prior runtime or absent capability", async () => {
    const {service, timers} = fixture();
    await expect(service.command(grant, { kind: "activate", timerId: "one", observedRuntimeId: "old", expectedGeneration: null })).rejects.toMatchObject({ code: "AUTOMATION_RUNTIME_CHANGED" });
    await expect(service.command({ scopes: ["timers:read"] }, {kind:"activate",timerId:"one",observedRuntimeId:"runtime",expectedGeneration:null})).rejects.toMatchObject({ statusCode:403 });
    expect(timers.activate).not.toHaveBeenCalled();
  });
  it("filters ungranted domains and exposes stable revision without time churn", () => {
    const {service} = fixture();
    expect(service.snapshot({scopes:[]})).toMatchObject({timers:[],playback:[]});
    const first = service.snapshot(grant);
    expect(first.playback).toHaveLength(1);
    expect(service.snapshot(grant).revision).toBe(first.revision);
  });
  it("serializes concurrent queue toggles using current server state", async () => {
    const {service} = fixture();
    await Promise.all([service.command(grant,{kind:"toggle-pause",moduleId:"alerts",observedRuntimeId:"runtime"}),service.command(grant,{kind:"toggle-pause",moduleId:"alerts",observedRuntimeId:"runtime"})]);
    expect(service.snapshot(grant).playback[0]?.paused).toBe(false);
  });
});
