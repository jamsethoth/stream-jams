import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { DefaultAlertMatcher, DefaultAlertResolver, DefaultPlaybackCooldownService, DefaultPlaybackDedupeService, DefaultPlaybackQueue, type AlertEditorDocument, type AssetRecord, type NormalizedStreamEvent, type TimerDefinition } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { LocalAssetStore } from "./local-asset-store.js";
import { SqliteAssetRepository } from "./sqlite-asset-repository.js";
import { SqliteAssetRetirementRepository } from "./sqlite-asset-retirement-repository.js";
import { LocalMediaService } from "./local-media-service.js";
import { TimerRuntimeCoordinator, timerRunOwner } from "../timers/timer-runtime-coordinator.js";
import { TimerCueService } from "../timers/timer-cue-service.js";
import { PlaybackCoordinator } from "../playback/playback-coordinator.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-media-lifecycle-"));
  const database = createInMemoryStreamJamsDatabase();
  const assets = new SqliteAssetRepository(database.connection);
  const store = new LocalAssetStore({ assetDirectory: directory });
  const media = new LocalMediaService({ assets, store, retirements: new SqliteAssetRetirementRepository(database.connection) });
  async function save(id: string, mediaType: AssetRecord["mediaType"], durationMs: number | null, revision: string) {
    const record = { id, mediaType, durationMs, mimeType: mediaType === "image" ? "image/png" : "audio/wav", sizeBytes: 3, originalFileName: id, storagePath: `${id}-${revision}`, checksum: `sha256:${createHash("sha256").update(revision).digest("hex")}` };
    await media.mutate(async () => { await writeFile(join(directory, record.storagePath), revision); await assets.save(record); });
    return record;
  }
  return { assets, store, media, save, async close() { await media.close(); database.close(); await rm(directory, { recursive: true, force: true }); } };
}
function definition(): TimerDefinition {
  return { id: "timer", label: "Timer", durationMs: 1000, iconAssetId: "icon", startAudioAssetId: null, endAudioAssetId: "bell", outputs: { browserSource: true, deviceRouteIds: [] }, createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z" };
}
function timerConfig() { return { moduleId: "timers", enabled: true, updatedAt: "2026-09-30T00:00:00Z", config: { profiles: { landscape: { layout: { x: 0, y: 0, width: 800, height: 400, zIndex: 1 }, orientation: "vertical", maxVisible: 4 }, vertical: { layout: { x: 0, y: 0, width: 400, height: 800, zIndex: 1 }, orientation: "vertical", maxVisible: 4 } } } }; }
const snapshotRequest = { moduleId: "timers", overlayId: "default", purpose: "live", scope: "unified", targetProfileId: "landscape" } as const;

it("holds paused and hidden timer versions through replacement and freshly verifies a new run", async () => {
  const f = await fixture();
  let now = 1000; let generation = 0;
  const scheduled: { delay: number; callback: () => void }[] = [];
  let enabled = true;
  const runtime = new TimerRuntimeCoordinator({ localMediaService: f.media, definitions: { findById: () => definition() }, clock: { now: () => now },
    config: { getModuleConfig: async () => ({ ...timerConfig(), enabled }) }, scheduler: { schedule(delay, callback) { scheduled.push({ delay, callback }); return { cancel() {} }; } }, generateGeneration: () => `g${++generation}` });
  try {
    const original = await f.save("icon", "image", null, "old"); await f.save("bell", "audio", 10000, "old");
    const verification = vi.spyOn(f.media, "verifyGroup");
    await runtime.start("timer");
    const version = f.media.descriptor(timerRunOwner("g1"), "icon").version;
    await runtime.pause("timer"); enabled = false;
    await f.save("icon", "image", null, "new"); await f.save("bell", "audio", 20000, "new");
    const snapshot = await runtime.getModuleSnapshot(snapshotRequest);
    expect(snapshot.enabled).toBe(false); expect(snapshot.presentation?.kind === "timer-stack" ? snapshot.presentation.stack.cards[0]?.iconVersion : undefined).toBe(version);
    expect(f.media.get(timerRunOwner("g1"), "bell").durationMs).toBe(10000);
    expect(await f.store.inspect(original.storagePath)).toBe("available");
    now += 7200000; await runtime.resume("timer");
    const resumed = await runtime.getModuleSnapshot(snapshotRequest);
    expect(resumed.presentation?.kind === "timer-stack" ? resumed.presentation.stack.cards[0]?.iconVersion : undefined).toBe(version);
    expect(verification).toHaveBeenCalledTimes(1);
    await runtime.restart("timer");
    expect(verification).toHaveBeenCalledTimes(2);
    expect(f.media.descriptor(timerRunOwner("g2"), "icon").version).not.toBe(version);
    expect(await f.store.inspect(original.storagePath)).toBe("missing");
    await runtime.stop("timer"); expect(f.media.counts.owners).toBe(0);
  } finally { await runtime.close(); await f.close(); }
});
it("keeps exact end cue bytes and duration after the completed card hold and releases on service close", async () => {
  const f = await fixture(); let now = 1000;
  const scheduled: { delay: number; callback: () => void }[] = [];
  const browser = { play: vi.fn(), stop: vi.fn() };
  const cues = new TimerCueService({ localMediaService: f.media, assets: f.assets, browser });
  const runtime = new TimerRuntimeCoordinator({ localMediaService: f.media, definitions: { findById: () => definition() }, clock: { now: () => now }, config: { getModuleConfig: async () => timerConfig() }, cueSink: cues,
    scheduler: { schedule(delay, callback) { scheduled.push({ delay, callback }); return { cancel() {} }; } }, generateGeneration: () => "run" });
  try {
    await f.save("icon", "image", null, "old"); const bell = await f.save("bell", "audio", 10000, "old");
    await runtime.start("timer"); await f.save("bell", "audio", 20000, "new");
    now = 2000; scheduled.find(entry => entry.delay === 1000)!.callback();
    await vi.waitFor(() => expect(browser.play).toHaveBeenCalledOnce());
    expect(browser.play).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 10000, assetVersions: expect.objectContaining({ bell: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
    now = 5000; scheduled.find(entry => entry.delay === 3000)!.callback(); await f.media.reconcile();
    expect(runtime.listStates()).toEqual([]); expect(f.media.counts.owners).toBe(1);
    expect(await f.store.inspect(bell.storagePath)).toBe("available");
    await runtime.close(); expect(f.media.counts.owners).toBe(0); expect(await f.store.inspect(bell.storagePath)).toBe("missing");
  } finally { await runtime.close(); await f.close(); }
});
it("replays alerts with freshly pinned versions and matching authored media-mode duration", async () => {
  const f = await fixture(); let sequence = 0;
  const queue = new DefaultPlaybackQueue({ generateId: () => `q${++sequence}`, onRelease: id => { void f.media.release(JSON.stringify(["alerts", id])); } });
  const coordinator = new PlaybackCoordinator({ localMediaService: f.media, queue, alertService: { listActiveRules: async () => [] }, matcher: new DefaultAlertMatcher(), resolver: new DefaultAlertResolver({ generateId: () => "unused" }),
    cooldownService: new DefaultPlaybackCooldownService(), dedupeService: new DefaultPlaybackDedupeService(), defaultTarget: { overlayId: "default", purpose: "live", scope: "module" } });
  try {
    await f.save("bell", "audio", 1000, "old");
    const document = { id: "document", durationMs: 1000, durationMode: "media", layers: [{ type: "audio", assetId: "bell", visible: true }] } as AlertEditorDocument;
    const event = { id: "event", type: "cheer", provider: "twitch", occurredAt: "2026-09-30T00:00:00Z", actor: null, channel: null, payload: {}, raw: {} } as unknown as NormalizedStreamEvent;
    await f.media.runAdmission(async () => { await f.media.captureAdmission(["bell"]); coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [], replayDocuments: [document], audio: [{ documentId: "document", durationMs: 1000, outputs: { browserSource: false, deviceRouteIds: ["selected"] }, layers: [{ layerId: "sound", assetId: "bell", sourceKind: "audio", volume: 1, playbackDurationMs: 1000 }] }] }); });
    const oldVersion = f.media.descriptor('["alerts","q1"]', "bell").version;
    coordinator.completeCurrent(); await f.media.reconcile(); await f.save("bell", "audio", 2500, "new");
    const replay = await coordinator.replayRecent("q1");
    expect(replay.current?.audio[0]?.durationMs).toBe(2500); expect(replay.current?.audio[0]?.layers[0]?.playbackDurationMs).toBe(2500);
    expect(f.media.descriptor('["alerts","q2"]', "bell").version).not.toBe(oldVersion);
    expect(f.media.counts.owners).toBe(1);
    await coordinator.close(); expect(f.media.counts.owners).toBe(0);
  } finally { await coordinator.close(); await f.close(); }
});
