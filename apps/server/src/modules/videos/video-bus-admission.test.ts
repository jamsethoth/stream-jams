import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type ManualBusEvent, type VideosModuleConfig } from "@stream-jams/core";
import { openStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { EventBus } from "../events/event-bus.js";
import { ManualEventService } from "../events/manual-event-service.js";
import { SqliteEventBusJournalRepository } from "../events/sqlite-event-bus-journal-repository.js";
import { VideoQueueService } from "./video-queue-service.js";
import { SqliteVideoQueueRepository } from "./video-queue-repository.js";
import { SqliteVideoBusAdmissionRepository } from "./video-bus-admission-repository.js";
import { VideoRequestIntake } from "./video-request-intake.js";
import { createVideosBusConsumer } from "./videos-bus-consumer.js";
import { createStreamerBotVideoIntake, validateVideoBusInput } from "./streamerbot-video-intake.js";
import { createChannelPointVideoIntake } from "./channel-point-video-intake.js";
import { ManualVideoRequestService } from "./manual-video-request-service.js";

const now = "2026-10-11T12:00:00.000Z";
const link = "https://youtu.be/dQw4w9WgXcQ";
const databases: StreamJamsDatabase[] = [];
const queues: VideoQueueService[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const queue of queues.splice(0)) queue.dispose();
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup(path: string, enabled: boolean | (() => Promise<boolean>) = true) {
  const database = openStreamJamsDatabase(path);
  databases.push(database);
  database.runMigrations();
  let config = createDefaultVideosModuleConfig();
  const queue = new VideoQueueService({ repository: new SqliteVideoQueueRepository(database.connection, () => now), getConfig: () => config, now: () => Date.parse(now) });
  queues.push(queue);
  const admissions = new SqliteVideoBusAdmissionRepository(database.connection, () => Date.parse(now));
  const intake = new VideoRequestIntake({ queue, admissions, getConfig: () => config, isModuleEnabled: () => typeof enabled === "function" ? enabled() : enabled });
  const consumer = createVideosBusConsumer({
    intake,
    streamerBot: createStreamerBotVideoIntake({ intake, queue }),
    channelPoints: createChannelPointVideoIntake({ intake, getConfig: () => config })
  });
  const journal = new SqliteEventBusJournalRepository(database.connection);
  const bus = new EventBus({ journal, consumers: [consumer], validateInput: validateVideoBusInput, now: () => new Date(now), generateReferenceId: () => "failure-ref" });
  const manual = new ManualEventService({ bus, now: () => new Date(now), validateReferences: async () => true });
  const submissions = new ManualVideoRequestService({ manualEvents: manual, admissions, journal });
  return { database, queue, intake, admissions, consumer, journal, bus, manual, submissions, setConfig: (change: Partial<VideosModuleConfig>) => { config = { ...config, ...change }; } };
}

function file() {
  const directory = mkdtempSync(join(tmpdir(), "stream-jams-video-admission-"));
  directories.push(directory);
  return join(directory, "admission.sqlite");
}

function manualVideo(): Omit<ManualBusEvent, "busId" | "sequence"> {
  return { kind: "manual", sourceKind: "manual", sourceRegistrationId: null, correlationKey: null, eventId: "crash-event", receivedAt: now,
    action: { kind: "video-request", request: { link } }, submission: { channel: "management", mayAutoplay: true }, effectTriggers: [] };
}

describe("durable Videos bus admission", () => {
  it("crash_after_insert_before_ack_does_not_duplicate", async () => {
    const path = file();
    const first = setup(path);
    await first.bus.start();
    const appended = first.journal.append(manualVideo(), "crash-bus", { duplicateSinceMs: 0, correlationSinceMs: 0 });
    if (appended.status !== "appended") throw new Error("fixture not appended");
    // Apply admission, then lose the process before the bus worker writes its outcome/cursor.
    expect(await first.consumer.handle(appended.event, { checkpoint: () => {} })).toBe("admitted");
    const itemId = first.queue.view("live").items[0]?.id;
    expect(itemId).toBeDefined();
    expect(first.journal.getCursor("videos")).toBe(0);
    first.queue.dispose(); first.database.close();
    const reopened = setup(path);
    await reopened.bus.resume();
    expect(reopened.queue.view("live").items.map(item => item.id)).toEqual([itemId]);
    expect(reopened.journal.consumerOutcomes(appended.event.sequence)).toEqual([{ consumerId: "videos", outcome: "admitted", referenceId: null }]);
  });

  it("provider_event_is_not_republished", async () => {
    const { bus, journal, queue } = setup(file());
    await bus.start();
    await bus.handleTriggers([{ kind: "streamerbot-event", sourceKey: "General", eventType: "Custom", eventId: "provider-video", occurredAt: now,
      providerId: "provider-streamerbot", summary: "Video", userName: "" }], { source: "StreamJams", type: "VideoRequest", link });
    expect(queue.view("live").items).toHaveLength(1);
    expect(journal.headSequence()).toBe(1);
    expect(journal.readAfter(0, 10)[0]?.event).toMatchObject({ sourceKind: "streamerbot", kind: "external" });
  });

  it("journal_acceptance_is_not_queue_acceptance", async () => {
    const { bus, journal, queue, manual } = setup(file(), false);
    await bus.start();
    const receipt = await manual.submit({ action: { kind: "video-request", request: { link } } }, { channel: "management" });
    expect(receipt.status).toBe("accepted");
    expect(receipt.consumers).toMatchObject([{ consumerId: "videos", outcome: "no-match" }]);
    expect(journal.headSequence()).toBe(1);
    expect(queue.view("live").items).toEqual([]);
  });

  it("prunes bounded orphan terminal receipts while queued and held items remain protected", async () => {
    const { bus, manual, admissions, database, queue } = setup(file());
    await bus.start();
    const accepted = await manual.submit({ action: { kind: "video-request", request: { link } } }, { channel: "management" });
    const held = await manual.submit({ action: { kind: "video-request", request: { link, durationSeconds: 999 } } }, { channel: "management" });
    const queued = await manual.submit({ action: { kind: "video-request", request: { link } } }, { channel: "management" });
    queue.command("live", queue.view("live").revision, { kind: "remove", itemId: queue.view("live").items[0]!.id });
    database.connection.exec("DELETE FROM event_bus_journal; DELETE FROM video_requests WHERE status = 'removed'");
    for (let index = 0; index < 300; index++) admissions.record({ busId: `orphan-${index}`, eventId: `event-${index}` }, { status: "rejected", reason: "queue-full", fields: [] });
    admissions.prune();
    expect(admissions.find(accepted.busId)).toBeNull();
    expect(admissions.find(held.busId)?.result).toMatchObject({ status: "accepted", item: { status: "held" } });
    expect(admissions.find(queued.busId)?.result).toMatchObject({ status: "accepted", item: { status: "queued" } });
    expect(Number(database.connection.prepare("SELECT COUNT(*) AS total FROM video_bus_admissions").get()!.total)).toBe(53);
    admissions.prune();
    expect(Number(database.connection.prepare("SELECT COUNT(*) AS total FROM video_bus_admissions").get()!.total)).toBe(2);
  });

  it("receipt persistence failure rolls back queue insertion and revision before publication", async () => {
    const { database, consumer, queue } = setup(file());
    const before = queue.view("live").revision;
    database.connection.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON video_bus_admissions BEGIN SELECT RAISE(ABORT, 'receipt unavailable'); END;");
    expect(await consumer.handle({ ...manualVideo(), sequence: 1, busId: "rollback-bus" }, { checkpoint: () => {} })).toBe("failed");
    expect(queue.view("live").items).toEqual([]);
    expect(queue.view("live").revision).toBe(before);
    expect(database.connection.prepare("SELECT COUNT(*) AS total FROM video_requests").get()!.total).toBe(0);
  });

  it("protects an active playback receipt after the journal is pruned", async () => {
    const { bus, manual, database, queue, admissions } = setup(file());
    await bus.start();
    const receipt = await manual.submit({ action: { kind: "video-request", request: { link, autoplay: true } } }, { channel: "management" });
    expect(queue.view("live").current).not.toBeNull();
    database.connection.exec("DELETE FROM event_bus_journal");
    admissions.prune();
    expect(admissions.find(receipt.busId)).not.toBeNull();
  });

  it("malformed persisted receipt fails closed", () => {
    const { database, admissions } = setup(file());
    database.connection.prepare("INSERT INTO video_bus_admissions VALUES (?, ?, NULL, ?, 0)").run("bad", "event", JSON.stringify({ status: "accepted", item: { id: "forged", arbitrary: "secret" } }));
    expect(() => admissions.find("bad")).toThrow();
  });

  it("returns bounded pending and exposes the late committed result without inserting again", async () => {
    let release!: (enabled: boolean) => void;
    const enabled = new Promise<boolean>(resolve => { release = resolve; });
    const { bus, submissions, queue, journal } = setup(file(), () => enabled);
    await bus.start();
    const result = await submissions.submit("live", { link }, { via: "operator", mayAutoplay: true });
    expect(result).toMatchObject({ status: "pending", busId: expect.any(String), eventId: expect.any(String) });
    if (result.status !== "pending") throw new Error("expected pending");
    expect(queue.view("live").items).toEqual([]);
    expect(submissions.submission(result.busId)).toEqual(result);
    release(true);
    await bus.waitForManualDelivery();
    const committed = submissions.submission(result.busId);
    expect(committed).toMatchObject({ status: "accepted", busId: result.busId, eventId: result.eventId, item: { submittedVia: "operator" } });
    expect(queue.view("live").items).toHaveLength(1);
    expect(journal.headSequence()).toBe(1);
  });

  it("automation permits submission only with its grant and strips autoplay without control", async () => {
    const { bus, submissions, queue, journal } = setup(file());
    await bus.start();
    await expect(submissions.submit("live", { link }, { via: "automation", mayAutoplay: true, scopes: ["timers:read"] })).rejects.toMatchObject({ reason: "forbidden" });
    expect(journal.headSequence()).toBe(0);
    const submitted = await submissions.submit("live", { link, autoplay: true }, { via: "automation", mayAutoplay: true, scopes: ["videos:read", "videos:submit"] });
    expect(submitted).toMatchObject({ status: "accepted", item: { submittedVia: "automation", autoplay: false } });
    expect(queue.view("live").current).toBeNull();
    const permitted = await submissions.submit("live", { link, autoplay: true }, { via: "automation", mayAutoplay: false, scopes: ["videos:read", "videos:submit", "videos:control"] });
    expect(permitted).toMatchObject({ status: "accepted", item: { autoplay: true } });
    expect(queue.view("live").current).not.toBeNull();
    expect(journal.headSequence()).toBe(2);
  });

  it("rejects retired manual and external test input before journal admission", async () => {
    const { bus, submissions, queue, journal } = setup(file());
    await bus.start();
    await expect(submissions.submit("test" as never, { link }, { via: "management", mayAutoplay: true })).rejects.toThrow(/retired/iu);
    await expect(bus.handleTriggers([{ kind: "streamerbot-event", sourceKey: "General", eventType: "Custom", eventId: "retired-video", occurredAt: now,
      providerId: "provider-streamerbot", summary: "Video", userName: "" }], { source: "StreamJams", type: "VideoRequest", purpose: "test", link })).rejects.toMatchObject({ code: "VIDEO_TEST_RETIRED" });
    expect(journal.headSequence()).toBe(0);
    expect(queue.view("live").items).toEqual([]);
    expect(journal.readAfter(0, 10)).toEqual([]);
    const { manual, journal: simulationJournal, queue: simulationQueue } = setup(":memory:");
    await expect(manual.submit({ action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" }, payload: { source: "StreamJams", type: "VideoRequest", purpose: "test", link } } }, { channel: "management" })).rejects.toMatchObject({ code: "VIDEO_TEST_RETIRED" });
    expect(simulationJournal.headSequence()).toBe(0); expect(simulationQueue.view("live").items).toEqual([]);
    expect(queue.view("live").items).toEqual([]);
  });

  it("receipted legacy test redelivery returns its durable outcome without touching the queue", async () => {
    const { consumer, queue, admissions, journal } = setup(":memory:");
    const item = queue.submit("live", { source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title: "Original receipt", requester: null, durationMs: null, autoplay: false, via: "streamerbot" });
    admissions.record({ busId: "legacy-accepted", eventId: "legacy-event" }, { status: "accepted", item });
    admissions.record({ busId: "legacy-rejected", eventId: "legacy-event" }, { status: "rejected", reason: "module-disabled", fields: [] });
    const before = queue.view("live");
    const event = { kind: "external" as const, sourceKind: "streamerbot" as const, sourceRegistrationId: null, correlationKey: null,
      eventId: "legacy-event", receivedAt: now, effectTriggers: [{ kind: "streamerbot-event" as const, sourceKey: "General", eventType: "Custom", eventId: "legacy-event", occurredAt: now, providerId: "provider-streamerbot", summary: "Video", userName: "" }],
      payload: { source: "StreamJams", type: "VideoRequest", purpose: "test", link } };
    const appended = journal.append(event, "legacy-accepted", { duplicateSinceMs: 0, correlationSinceMs: 0 });
    if (appended.status !== "appended") throw new Error("fixture not appended");
    expect(await consumer.handle(appended.event, { checkpoint: () => {} })).toBe("admitted");
    expect(await consumer.handle({ ...appended.event, busId: "legacy-rejected" }, { checkpoint: () => {} })).toBe("no-match");
    expect(await consumer.handle({ ...appended.event, eventId: "mismatched-event" }, { checkpoint: () => {} })).toBe("failed");
    expect(queue.view("live")).toEqual(before);
    expect(admissions.find("legacy-accepted")?.result).toEqual({ status: "accepted", item });
  });

  it("legacy journaled test replay fails closed while unrelated external identities remain admissible", async () => {
    const { consumer, queue, bus, journal } = setup(":memory:");
    await bus.start();
    const input = { kind: "external" as const, sourceKind: "streamerbot" as const, sourceRegistrationId: null, correlationKey: null,
      eventId: "legacy-test", receivedAt: now, effectTriggers: [{ kind: "streamerbot-event" as const, sourceKey: "General", eventType: "Custom", eventId: "legacy-test", occurredAt: now, providerId: "provider-streamerbot", summary: "Video", userName: "" }],
      payload: { source: "StreamJams", type: "VideoRequest", purpose: "test", link } };
    const appended = journal.append(input, "old-test", { duplicateSinceMs: 0, correlationSinceMs: 0 });
    if (appended.status !== "appended") throw new Error("fixture not appended");
    expect(await consumer.handle(appended.event, { checkpoint: () => {} })).toBe("failed");
    expect(queue.view("live").items).toEqual([]);
    await expect(bus.publish({ ...input, eventId: "unrelated", effectTriggers: [] })).resolves.toEqual({ status: "accepted" });
    expect(queue.view("live").items).toEqual([]);
  });

  it("replays rejected receipt after reopen even when module admission changes", async () => {
    const path = file();
    const first = setup(path, false);
    await first.bus.start();
    const appended = first.journal.append(manualVideo(), "rejected-bus", { duplicateSinceMs: 0, correlationSinceMs: 0 });
    if (appended.status !== "appended") throw new Error("fixture not appended");
    expect(await first.consumer.handle(appended.event, { checkpoint: () => {} })).toBe("no-match");
    first.queue.dispose(); first.database.close();
    const reopened = setup(path, true);
    await reopened.bus.resume();
    expect(reopened.submissions.submission("rejected-bus")).toMatchObject({ status: "rejected", reason: "module-disabled" });
    expect(reopened.queue.view("live").items).toEqual([]);
  });

  it("manual simulations retain their channel and normal provider admission policies", async () => {
    const { bus, manual, queue, setConfig, journal } = setup(file());
    setConfig({ rewardMappings: [{ rewardId: "video-reward" }], streamerBotAutoplay: false });
    await bus.start();
    await manual.submit({ action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" }, payload: { source: "StreamJams", type: "VideoRequest", link, autoplay: true } } }, { channel: "management" });
    await manual.submit({ action: { kind: "simulate-canonical", event: { type: "channel_point_redemption", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", actor: { id: "viewer", displayName: "Viewer" }, amount: null, message: null, metadata: {}, rewardId: "video-reward", rewardTitle: "Video", userInput: link } } }, { channel: "operator" });
    expect(queue.view("live").items.map(item => [item.submittedVia, item.autoplay])).toEqual([["management", false], ["operator", false]]);
    expect(journal.headSequence()).toBe(2);
    expect(journal.readAfter(0, 10).every(row => row.event?.sourceKind === "manual" && row.event.sourceRegistrationId === null)).toBe(true);
  });
});
