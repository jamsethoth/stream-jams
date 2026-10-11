import { DefaultAlertMatcher, DefaultAlertResolver, DefaultEffectQueue, DefaultPlaybackCooldownService, DefaultPlaybackDedupeService, DefaultPlaybackQueue, createScreenEffectDocument, eventTriggerSelectorSchema, type AlertEditorTestRequest, type AlertEditorTestResult, type AlertRule, type ManualBusEvent, type TimerDefinition } from "@stream-jams/core";
import { afterEach, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { createAlertEditorDocumentFromRule } from "../alerts/alert-editor-service.js";
import { PlaybackCoordinator } from "../playback/playback-coordinator.js";
import { EffectAdmissionService } from "../screen-effects/effect-admission-service.js";
import { TimerEventService } from "../timers/timer-event-service.js";
import { EventPipeline } from "./event-pipeline.js";
import { EventBus } from "./event-bus.js";
import { ManualEventService } from "./manual-event-service.js";
import { ManualAlertEffectService } from "./manual-alert-effect-service.js";
import { SqliteEventBusJournalRepository } from "./sqlite-event-bus-journal-repository.js";

const now = new Date("2026-10-10T12:00:00.000Z");
const rule: AlertRule = { id: "follow", name: "Follow", eventType: "follow", enabled: true, collectionIds: ["set"], conditions: [], cooldownSeconds: 0, priority: 0, variants: [{ id: "variant", name: "Default", enabled: true, weight: 1, visualAssetId: null, audioAssetId: null, textTemplate: "Hello {actor.displayName}", ttsConfig: null, durationMs: 1000, layout: { x: 0, y: 0, width: 200, height: 100, zIndex: 0 } }] };
const request: AlertEditorTestRequest = { document: JSON.parse(JSON.stringify(createAlertEditorDocumentFromRule(rule, 0, null))) as AlertEditorTestRequest["document"], targetProfileId: "landscape", includeAudio: false, includeTts: false, samplePayload: {} };
const databases: ReturnType<typeof createInMemoryStreamJamsDatabase>[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup(options: { blocked?: Promise<void>; failure?: Error; invalid?: boolean } = {}) {
  const database = createInMemoryStreamJamsDatabase(); databases.push(database);
  const journal = new SqliteEventBusJournalRepository(database.connection);
  const consumed: ManualBusEvent[] = [];
  const result: AlertEditorTestResult = { status: "queued", targetProfileId: "landscape", referenceId: "ref", test: true, deliveredDestinations: [{ kind: "browser-source", id: "landscape", name: "Landscape" }], unavailableDestinations: [{ kind: "device-route", id: "missing", name: "Missing route" }] };
  const alerts = {
    getDocument: vi.fn(async () => request.document),
    validateTestReferences: vi.fn(async (candidate: AlertEditorTestRequest) => { void candidate; if (options.invalid) throw new Error("Invalid media"); }),
    consumeTest: vi.fn(async (_id: string, _request: AlertEditorTestRequest, event?: { eventId: string; receivedAt: string }) => {
      expect(journal.headSequence()).toBeGreaterThan(0);
      await options.blocked;
      if (options.failure !== undefined) throw options.failure;
      return { ...result, referenceId: event?.eventId ?? "ref" };
    })
  };
  const bus = new EventBus({ journal, generateReferenceId: () => "bus-ref", now: () => now, manualOutcomeWaitMs: 5, consumers: [
    { id: "alerts", maxAttempts: 1, handle: event => { if (event.kind !== "manual") return Promise.resolve("no-match"); consumed.push(event); return dispatch.handleAlert(event); } },
    { id: "other", handle: async () => "admitted" }
  ] });
  let ids = 0;
  const manualEvents = new ManualEventService({ bus, now: () => now, generateEventId: () => `manual-${++ids}`, validateReferences: async action => { if (action.kind === "alert-draft-test") await alerts.validateTestReferences(action.request); return true; } });
  const dispatch: ManualAlertEffectService = new ManualAlertEffectService({ manualEvents, alerts, effects: { handleEvent: async event => ({ status: "no-matches", eventId: event.eventId, outcomes: [] }) } });
  return { journal, bus, manualEvents, dispatch, alerts, consumed };
}

it("test_send_journals_once_and_admits_once", async () => {
  const h = setup();
  const result = await h.dispatch.sendAlert(request);
  expect(result).toMatchObject({ status: "queued", eventId: "manual-1", deliveredDestinations: [{ name: "Landscape" }], unavailableDestinations: [{ name: "Missing route" }] });
  expect(h.journal.headSequence()).toBe(1);
  expect(h.alerts.consumeTest).toHaveBeenCalledOnce();
  const accepted = { ...h.consumed[0]! };
  delete (accepted as Partial<typeof accepted>).sequence;
  delete (accepted as Partial<typeof accepted>).busId;
  await h.bus.publishManual(accepted);
  expect(h.alerts.consumeTest).toHaveBeenCalledOnce();
  expect(h.journal.headSequence()).toBe(1);
});

it("invalid_draft_never_journals", async () => {
  const h = setup({ invalid: true });
  await expect(h.dispatch.sendAlert(request)).rejects.toThrow("Invalid media");
  expect(h.journal.headSequence()).toBe(0);
  expect(h.alerts.consumeTest).not.toHaveBeenCalled();
});

it("admits a supported maximum-grid warped draft within the journal bound", async () => {
  const h = setup();
  const axis = Array.from({ length: 7 }, (_, index) => index / 6);
  const warp = { columns: axis, rows: axis, points: axis.flatMap(y => axis.map(x => ({ x, y }))) };
  const document = { ...request.document, layers: request.document.layers.map(layer => layer.type === "text" ? { ...layer, textStyle: { ...layer.textStyle, warp } } : layer) };
  expect(new TextEncoder().encode(JSON.stringify({ action: { kind: "alert-draft-test", request: { ...request, document } } })).byteLength).toBeLessThan(65_536);
  await expect(h.dispatch.sendAlert({ ...request, document })).resolves.toMatchObject({ status: "queued" });
  expect(h.journal.headSequence()).toBe(1);
});

it("reports a clear bounded error for oversized complex drafts before journaling", async () => {
  const h = setup();
  await expect(h.dispatch.sendAlert({ ...request, samplePayload: { oversized: "x".repeat(65_536) } })).rejects.toThrow("65,536-byte JSON limit");
  expect(h.journal.headSequence()).toBe(0);
});

it("saved tests resolve their exact saved document and never become broad simulations", async () => {
  const h = setup();
  const result = await h.dispatch.sendSavedAlert({ kind: "alert-saved-test", alertId: "follow", targetProfileId: null, samplePayload: {}, includeAudio: true, includeTts: false });
  expect(result.status).toBe("queued");
  expect(h.consumed[0]?.action.kind).toBe("alert-saved-test");
  expect(h.alerts.consumeTest).toHaveBeenCalledWith("follow", expect.objectContaining({ targetProfileId: null, document: request.document }), expect.objectContaining({ sourceKind: "manual" }));
});

it("slow consumer returns identified pending without claiming destinations or replaying", async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const h = setup({ blocked });
  try {
    const result = await h.dispatch.sendAlert(request);
    expect(result).toMatchObject({ status: "pending", busId: expect.any(String), eventId: "manual-1", deliveredDestinations: [] });
    expect(h.journal.consumerOutcomes(1).find(outcome => outcome.consumerId === "other")?.outcome).toBe("admitted");
  } finally { release(); await h.bus.waitForManualDelivery(); }
  expect(h.alerts.consumeTest).toHaveBeenCalledOnce();
});

it("one_consumer_failure_does_not_block_others", async () => {
  const failure = new Error("Destination unavailable");
  const h = setup({ failure });
  await expect(h.dispatch.sendAlert(request)).rejects.toBe(failure);
  await h.bus.waitForManualDelivery();
  expect(h.journal.consumerOutcomes(1).map(outcome => [outcome.consumerId, outcome.outcome])).toEqual(expect.arrayContaining([["alerts", "failed"], ["other", "admitted"]]));
});

it.each(["canonical", "external"] as const)("disconnected_provider_does_not_block_manual_send: %s matches Alerts Effects and Timers with truthful provenance", async kind => {
  const database = createInMemoryStreamJamsDatabase(); databases.push(database);
  const journal = new SqliteEventBusJournalRepository(database.connection);
  const selector = eventTriggerSelectorSchema.parse({ match: kind === "canonical" ? { kind: "canonical", type: "follow" } : { kind: "external", providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" }, sources: "any", conditions: [] });
  const alertRule: AlertRule = kind === "canonical" ? rule : { ...rule, eventType: "external_event", externalIdentity: { providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" } };
  const queue = new DefaultPlaybackQueue({ clock: () => now, generateId: () => "alert-item" });
  const playback = new PlaybackCoordinator({ alertService: { listActiveRules: async () => [alertRule] }, matcher: new DefaultAlertMatcher(), resolver: new DefaultAlertResolver({ generateId: () => "resolved", random: () => 0 }), queue, cooldownService: new DefaultPlaybackCooldownService({ clock: () => now }), dedupeService: new DefaultPlaybackDedupeService({ clock: () => now }), defaultTarget: { overlayId: "alerts", purpose: "live", scope: "module" }, overlayPlaybackSink: { deliverPlaybackInstruction() {} } });
  const draft = createScreenEffectDocument({ id: "effect", name: "Effect", defaultVariantId: "variant" });
  const effect = { ...draft, enabled: true, bindings: [{ id: "binding", selector }], variants: [{ ...draft.variants[0]!, sound: { assetId: "tone", volume: 0 }, outputs: { browserSource: true, deviceRouteIds: [] } }] };
  const effectQueue = new DefaultEffectQueue();
  const effects = new EffectAdmissionService({ repository: { list: async () => [effect], find: async () => effect }, queue: effectQueue, dedupe: new DefaultPlaybackDedupeService(), cooldowns: new DefaultPlaybackCooldownService(), getModuleCooldownSeconds: async () => 0, generateOccurrenceId: () => "effect-item" });
  const timerRuntime = { start: vi.fn(), stop: vi.fn(), restart: vi.fn(), adjust: vi.fn() };
  const timer: TimerDefinition = { id: "timer", label: "Timer", durationMs: 10000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] }, createdAt: now.toISOString(), updatedAt: now.toISOString(), eventRules: [{ enabled: true, selector, action: "start", amountMs: 0, quantityUnit: null, inactiveBehavior: "ignore" }] };
  const logs = { appendEventLog: vi.fn(), appendAlertMatchLog: vi.fn(), appendPlaybackLog: vi.fn() };
  const pipeline = new EventPipeline({ playbackCoordinator: playback, effectEventSink: effects, timerEventSink: new TimerEventService({ list: () => [timer] }, timerRuntime), diagnosticsLogRepository: logs, generateId: () => "log" });
  const bus = new EventBus({ journal, generateReferenceId: () => "bus-ref", now: () => now, consumers: pipeline.consumers(), resolveSourceRegistrationId: async () => { throw new Error("Disconnected provider must not be queried"); } });
  const manual = new ManualEventService({ bus, now: () => now, validateReferences: async () => true });
  try {
    const receipt = await manual.submit(kind === "canonical" ? { action: { kind: "simulate-canonical", event: { type: "follow", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", actor: { id: null, displayName: "Viewer" }, message: null, metadata: {}, amount: null } } } : { action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" } } }, { channel: "management" });
    expect(receipt.consumers.map(outcome => outcome.outcome)).toEqual(["admitted", "admitted", "admitted"]);
    expect(queue.getSnapshot().current?.deliveredBy).toBe("manual");
    expect(effectQueue.snapshot().queued[0]?.sourceKind).toBe("manual");
    expect(effectQueue.snapshot().queued[0]?.trigger).toMatchObject({ kind: kind === "canonical" ? "canonical-event" : "manual-external" });
    expect(effectQueue.snapshot().queued[0]?.trigger).not.toHaveProperty("providerId");
    expect(timerRuntime.start).toHaveBeenCalledOnce();
    expect(logs.appendEventLog).not.toHaveBeenCalled();
    expect(journal.readAfter(0, 10)[0]?.event).toMatchObject({ sourceKind: "manual", sourceRegistrationId: null, correlationKey: null });
  } finally { await playback.close(); }
});
