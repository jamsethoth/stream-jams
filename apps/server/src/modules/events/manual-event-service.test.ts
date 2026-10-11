import { afterEach, describe, expect, it, vi } from "vitest";
import { eventBusActivityViewSchema, manualEventActionMaxBytes, matchSelector, type BusEvent, type ManualBusEvent, type ManualEventSubmission } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { createVideosBusConsumer } from "../videos/videos-bus-consumer.js";
import { EventPipeline } from "./event-pipeline.js";
import { EventBus, type EventBusOptions } from "./event-bus.js";
import { ManualEventService, ManualSubmissionRejectedError } from "./manual-event-service.js";
import { SqliteEventBusJournalRepository } from "./sqlite-event-bus-journal-repository.js";

const now = "2026-10-10T12:00:00.000Z";
const eventInput = { type: "follow", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", actor: { id: "viewer", displayName: "Viewer" }, message: null, amount: null, metadata: {} } as const;
const simulation: ManualEventSubmission = { action: { kind: "simulate-canonical", event: eventInput } };
const video: ManualEventSubmission = { action: { kind: "video-request", request: { link: "https://youtu.be/dQw4w9WgXcQ", autoplay: true } } };

const databases: ReturnType<typeof createInMemoryStreamJamsDatabase>[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup(options: Partial<EventBusOptions> = {}) {
  const database = createInMemoryStreamJamsDatabase();
  databases.push(database);
  database.runMigrations();
  const journal = new SqliteEventBusJournalRepository(database.connection);
  const delivered: BusEvent[] = [];
  let ids = 0;
  const bus = new EventBus({ journal, now: () => new Date(now), generateReferenceId: () => "failure-ref", consumers: [{ id: "recording", handle: async event => { delivered.push(event); return "no-match"; } }], ...options });
  const validateReferences = vi.fn(async () => true);
  const service = new ManualEventService({ bus, validateReferences, now: () => new Date(now), generateEventId: () => `manual_${++ids}`, generateReferenceId: () => "rejected-ref" });
  return { database, journal, bus, service, delivered, validateReferences };
}

describe("ManualEventService", () => {
  it("manual_origin_is_not_provider_delivery", async () => {
    const { service, journal, delivered } = setup();
    const receipt = await service.submit(simulation, { channel: "management" });
    expect(delivered[0]).toMatchObject({ kind: "manual", sourceKind: "manual", sourceRegistrationId: null, correlationKey: null, eventId: "manual_1", receivedAt: now, submission: { channel: "management", mayAutoplay: true }, action: { event: { id: "manual_1", occurredAt: now } } });
    expect(receipt).toMatchObject({ status: "accepted", eventId: "manual_1", consumers: [{ consumerId: "recording", outcome: "no-match" }] });
    expect(journal.readAfter(0, 10)[0]?.event).toEqual(delivered[0]);
    const { sequence, ...activity } = journal.recentActivity(1)[0]!;
    expect(sequence).toBe(1);
    expect(eventBusActivityViewSchema.parse({ events: [activity] }).events[0]).toMatchObject({ sourceKind: "manual", kind: "manual", submissionChannel: "management", eventType: "follow" });
  });

  it("manual_does_not_correlate_with_twitch", async () => {
    const { service, bus, journal } = setup();
    await bus.handleEvent({ ...eventInput, id: "twitch-delivery", occurredAt: now }, []);
    await service.submit(simulation, { channel: "operator" });
    await bus.handleEvent({ ...eventInput, ingestProvider: "streamerbot", id: "sb-delivery", occurredAt: now }, []);
    expect(journal.readAfter(0, 10).map(row => row.event?.sourceKind)).toEqual(["twitch", "manual"]);
    expect(journal.recentActivity(3).map(row => row.outcome)).toEqual(["merged", "accepted", "accepted"]);
  });

  it("duplicate_delivery_is_not_a_new_submission", async () => {
    const { service, bus, journal, delivered } = setup();
    const receipt = await service.submit(simulation, { channel: "management" });
    const { sequence, busId, ...input } = delivered[0] as ManualBusEvent;
    expect(sequence).toBe(1);
    expect(busId).toBe(receipt.busId);
    expect(await bus.publishManual(input)).toEqual({ ...receipt, status: "duplicate" });
    expect(journal.headSequence()).toBe(1);
    expect(delivered).toHaveLength(1);
  });

  it("two_intentional_submissions_are_distinct", async () => {
    const { service, journal } = setup();
    const first = await service.submit(simulation, { channel: "management" });
    const second = await service.submit(simulation, { channel: "management" });
    expect(first.busId).not.toBe(second.busId);
    expect(first.eventId).not.toBe(second.eventId);
    expect(journal.headSequence()).toBe(2);
  });

  it.each([
    { ...simulation, sourceRegistrationId: "provider-forged" },
    { ...simulation, recipients: ["private-desktop"] },
    { ...simulation, context: { channel: "management" } },
    { action: { kind: "video-request", request: { link: "https://youtu.be/dQw4w9WgXcQ", recipients: ["desktop"] } } },
    { action: { kind: "simulate-canonical", event: { ...eventInput, sourceRegistrationId: "forged" } } },
    { action: { kind: "simulate-canonical", event: { ...eventInput, id: "forged-id" } } },
    { action: { kind: "simulate-canonical", event: { ...eventInput, message: "x".repeat(manualEventActionMaxBytes) } } },
    { action: { kind: "effect-test", effectId: "effect", variantId: "variant", confirmLiveImpact: false } },
    { action: { kind: "simulate-canonical", event: { ...eventInput, metadata: { callback: () => "forbidden" } } } },
    { action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "general", eventType: "Custom" }, payload: { message: "x".repeat(16_384) } } }
  ])("rejects forged or oversized actions before insertion: %#", async input => {
    const { service, journal, validateReferences } = setup();
    await expect(service.submit(input as ManualEventSubmission, { channel: "management" })).rejects.toMatchObject({ reason: "invalid-action", referenceId: "rejected-ref" });
    expect(journal.headSequence()).toBe(0);
    expect(validateReferences).not.toHaveBeenCalled();
    expect(journal.recentActivity(1)[0]).toMatchObject({ sourceKind: "manual", outcome: "rejected", eventType: null, referenceId: "rejected-ref" });
    expect(JSON.stringify(journal.recentActivity(1))).not.toContain("provider-forged");
  });

  it("video-only automation cannot inject event types or gain autoplay authority", async () => {
    const { service, journal, delivered } = setup();
    await expect(service.submit(simulation, { channel: "automation", scopes: ["videos:read", "videos:submit"] })).rejects.toMatchObject({ reason: "forbidden" });
    await expect(service.submit(video, { channel: "automation", scopes: ["videos:read"] })).rejects.toMatchObject({ reason: "forbidden" });
    expect(journal.headSequence()).toBe(0);
    await service.submit(video, { channel: "automation", scopes: ["videos:read", "videos:submit"] });
    expect(delivered[0]).toMatchObject({ submission: { channel: "automation", mayAutoplay: false } });
    const activity = JSON.stringify(journal.recentActivity(10));
    expect(activity).not.toContain("youtu");
    expect(activity).not.toContain("autoplay");
  });

  it("validates target references before insertion and bounds rejection evidence", async () => {
    const { service, journal, validateReferences } = setup();
    validateReferences.mockResolvedValue(false);
    await expect(service.submit({ action: { kind: "effect-test", effectId: "missing", variantId: "variant", confirmLiveImpact: true } }, { channel: "operator" })).rejects.toBeInstanceOf(ManualSubmissionRejectedError);
    expect(journal.headSequence()).toBe(0);
    expect(journal.recentActivity(1)[0]?.referenceId).toBe("rejected-ref");
  });

  it("reference validation exceptions reject before insertion without leaking their data", async () => {
    const { service, journal, validateReferences } = setup();
    validateReferences.mockRejectedValue(new Error("https://private.test/token?secret=value"));
    await expect(service.submit(video, { channel: "management" })).rejects.toMatchObject({ reason: "invalid-reference", referenceId: "rejected-ref" });
    expect(journal.headSequence()).toBe(0);
    expect(JSON.stringify(journal.recentActivity(1))).not.toContain("private.test");
  });

  it("bounds receipt waits for blocked consumers, coalesces work and lets the owner await delivery", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const slowEvents: string[] = [];
    const tracked: Promise<void>[] = [];
    const { service, bus, journal } = setup({ manualOutcomeWaitMs: 5, consumers: [
      { id: "slow", handle: async event => { await blocked; slowEvents.push(event.eventId); return "admitted"; } },
      { id: "fast", handle: async () => "no-match" }
    ], onManualDeliveryWork: work => { tracked.push(work); } });
    const receipts = await Promise.all(Array.from({ length: 20 }, () => service.submit(video, { channel: "management" })));
    expect(receipts).toHaveLength(20);
    expect(receipts.every(receipt => receipt.status === "accepted" && receipt.consumers.find(outcome => outcome.consumerId === "slow")?.outcome === "pending")).toBe(true);
    expect(receipts.every(receipt => receipt.consumers.find(outcome => outcome.consumerId === "fast")?.outcome === "no-match")).toBe(true);
    expect(tracked).toHaveLength(2);
    expect(journal.getCursor("slow")).toBe(0);
    release();
    await bus.waitForManualDelivery();
    await Promise.all(tracked);
    expect(slowEvents).toEqual(Array.from({ length: 20 }, (_, index) => `manual_${index + 1}`));
    expect(journal.getCursor("slow")).toBe(20);
    expect(journal.consumerOutcomes(20).find(outcome => outcome.consumerId === "slow")?.outcome).toBe("admitted");
  });

  it("pending is not admission and the same journaled identity resumes after restart", async () => {
    const { journal } = setup();
    const brokenJournal = Object.assign(Object.create(journal) as SqliteEventBusJournalRepository, { readAfter: () => { throw new Error("temporary worker read failure"); } });
    const bus = new EventBus({ journal: brokenJournal, consumers: [{ id: "waiting", handle: async () => "admitted" }], generateReferenceId: () => "failure", now: () => new Date(now) });
    const service = new ManualEventService({ bus, validateReferences: async () => true, now: () => new Date(now), generateEventId: () => "manual-pending" });
    const receipt = await service.submit(video, { channel: "management" });
    expect(receipt).toMatchObject({ status: "accepted", consumers: [{ consumerId: "waiting", outcome: "pending" }] });
    expect(journal.getCursor("waiting")).toBe(0);
    const resumed: BusEvent[] = [];
    const restarted = new EventBus({ journal, consumers: [{ id: "waiting", handle: async event => { resumed.push(event); return "admitted"; } }], generateReferenceId: () => "failure", now: () => new Date(now) });
    await restarted.resume();
    expect(resumed[0]).toMatchObject({ busId: receipt.busId, eventId: receipt.eventId, sourceKind: "manual", submission: { channel: "management" } });
    expect(journal.consumerOutcomes(1)).toEqual([{ consumerId: "waiting", outcome: "admitted", referenceId: null }]);
    expect(journal.getCursor("waiting")).toBe(1);
  });

  it("pending manual events expire under the normal replay-age policy", async () => {
    const { journal } = setup();
    const brokenJournal = Object.assign(Object.create(journal) as SqliteEventBusJournalRepository, { readAfter: () => { throw new Error("temporary read failure"); } });
    const bus = new EventBus({ journal: brokenJournal, consumers: [{ id: "waiting", handle: async () => "admitted" }], generateReferenceId: () => "failure", now: () => new Date(now) });
    const service = new ManualEventService({ bus, validateReferences: async () => true, now: () => new Date(now) });
    await service.submit(video, { channel: "management" });
    const handle = vi.fn(async () => "admitted" as const);
    const restarted = new EventBus({ journal, consumers: [{ id: "waiting", handle }], generateReferenceId: () => "failure", now: () => new Date(Date.parse(now) + 181_000) });
    await restarted.resume();
    expect(handle).not.toHaveBeenCalled();
    expect(journal.consumerOutcomes(1)).toEqual([{ consumerId: "waiting", outcome: "expired", referenceId: null }]);
  });

  it("matches canonical/external simulations through selectors and preserves payload subscriptions", async () => {
    const { service, bus, delivered } = setup({ consumers: [{ id: "recording", handle: async event => { seen.push(event); return "no-match"; }, externalPayloads: [{ providerKind: "streamerbot", sourceKey: "general", eventType: "Custom" }] }] });
    const seen: BusEvent[] = [];
    await service.submit(simulation, { channel: "management" });
    await service.submit({ action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "general", eventType: "Custom" }, payload: { data: 1 } } }, { channel: "management" });
    await service.submit({ action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "general", eventType: "Other" }, payload: { secret: "dropped" } } }, { channel: "management" });
    expect(matchSelector({ match: { kind: "canonical", type: "follow" }, sources: ["twitch"], conditions: [] }, seen[0]!)).toBe(true);
    expect(matchSelector({ match: { kind: "canonical", type: "follow" }, sources: ["streamerbot"], conditions: [] }, seen[0]!)).toBe(false);
    expect(matchSelector({ match: { kind: "external", providerKind: "streamerbot", sourceKey: "general", eventType: "Custom" }, sources: "any", conditions: [] }, seen[1]!)).toBe(true);
    expect(seen[1]).toMatchObject({ effectTriggers: [], action: { payload: { data: 1 } } });
    expect(seen[2]?.kind === "manual" && seen[2].action).not.toHaveProperty("payload");
    expect(bus.externalPayloadIdentities()).toHaveLength(1);
    expect(delivered).toHaveLength(0);
  });

  it("uses normal bounded retries and reports failure independently of journal acceptance", async () => {
    const handle = vi.fn(async () => { throw new Error("private request data"); });
    const { service } = setup({ consumers: [{ id: "failing", maxAttempts: 2, handle }], sleep: async () => {} });
    expect(await service.submit(video, { channel: "management" })).toMatchObject({ status: "accepted", consumers: [{ consumerId: "failing", outcome: "failed", referenceId: "failure-ref" }] });
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("routes canonical simulations normally while targeted Videos actions remain isolated from other consumers", async () => {
    const { service, delivered } = setup();
    await service.submit(simulation, { channel: "management" });
    await service.submit(video, { channel: "management" });
    const streamerBot = vi.fn(async () => "no-match" as const);
    const channelPoints = { handleEvent: vi.fn(async () => "no-match" as const) };
    const intake = { submit: vi.fn(async () => ({ status: "rejected" as const, reason: "module-disabled" as const, fields: [] })) };
    const videos = createVideosBusConsumer({ streamerBot, channelPoints, intake });
    const enqueueEvent = vi.fn(async () => ({ status: "no-matches" as const, matchedRuleIds: [], enqueuedAlertIds: [], snapshot: {} as never }));
    const effectEventSink = { handleEvent: vi.fn(async (event: BusEvent) => ({ status: "no-matches" as const, eventId: event.eventId, outcomes: [] as const })) };
    const pipeline = new EventPipeline({ playbackCoordinator: { enqueueEvent }, effectEventSink, diagnosticsLogRepository: { appendEventLog: vi.fn(), appendAlertMatchLog: vi.fn(), appendPlaybackLog: vi.fn() }, generateId: () => "test" });
    for (const event of delivered) {
      expect(await videos.handle(event, { checkpoint() {} })).toBe("no-match");
      for (const consumer of pipeline.consumers()) expect(await consumer.handle(event, { checkpoint() {} })).toBe("no-match");
    }
    expect(streamerBot).not.toHaveBeenCalled();
    expect(channelPoints.handleEvent).toHaveBeenCalledOnce();
    expect(channelPoints.handleEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "manual_1" }), expect.objectContaining({ via: "management", policy: "channel-points" }));
    expect(intake.submit).toHaveBeenCalledWith("live", video.action.kind === "video-request" ? video.action.request : undefined, expect.objectContaining({ via: "management", busIdentity: expect.objectContaining({ eventId: "manual_2" }) }));
    expect(enqueueEvent).toHaveBeenCalledOnce();
    expect(enqueueEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "manual_1", ingestProvider: "twitch" }), "manual");
    expect(effectEventSink.handleEvent).toHaveBeenCalledTimes(2);
  });
});
