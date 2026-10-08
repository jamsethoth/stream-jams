import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  type AlertMatchLogRecord,
  type AlertSourceEvent,
  type AlertRule,
  type AlertVariant,
  type BusEvent,
  type EventLogRecord,
  type EffectTrigger,
  type NormalizedStreamEvent,
  type OverlayInstruction,
  type PlaybackLogRecord,
  type PlaybackQueueSnapshot
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { EventPipeline } from "./event-pipeline.js";
import { PlaybackCoordinator, type PlaybackEnqueueResult } from "../playback/playback-coordinator.js";

describe("EventPipeline", () => {
  it("registers Alerts, Screen Effects, and Timers as single-attempt bus consumers", () => {
    const pipeline = createPipeline({ diagnostics: new RecordingDiagnosticsRepository(), playback: new RecordingPlaybackCoordinator(queueResult(createFollowEvent())) });
    expect(pipeline.consumers().map((consumer) => [consumer.id, consumer.maxAttempts])).toEqual([
      ["alerts", 1], ["screen-effects", 1], ["timers", 1]
    ]);
  });

  it("delivers external bus events to Alerts as allowlisted external alert events, Screen Effects and Timers", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator(queueResult(createFollowEvent()));
    const timerEvents: BusEvent[] = [];
    const effectEvents: BusEvent[] = [];
    const pipeline = new EventPipeline({
      diagnosticsLogRepository: diagnostics,
      playbackCoordinator: playback,
      timerEventSink: { async handleEvent(event) { timerEvents.push(event); } },
      effectEventSink: { async handleEvent(event) { effectEvents.push(event); } },
      generateId: (kind) => `${kind}-1`
    });
    const trigger: EffectTrigger = {
      kind: "streamerbot-event",
      eventId: "streamerbot:custom-1",
      occurredAt: "2026-05-30T12:00:00.000Z",
      providerId: "provider-streamerbot",
      sourceKey: "General",
      eventType: "Custom",
      summary: "Custom",
      userName: "Viewer"
    };
    const external: BusEvent = {
      kind: "external", sequence: 1, busId: "bus-1", eventId: trigger.eventId, sourceKind: "streamerbot",
      sourceRegistrationId: null, receivedAt: "2026-05-30T12:00:00.000Z", correlationKey: null, effectTriggers: [trigger]
    };

    for (const consumer of pipeline.consumers()) await consumer.handle(external);

    expect(effectEvents).toEqual([external]);
    expect(playback.events).toEqual([{
      id: "external:streamerbot:custom-1",
      type: "external_event",
      providerId: "streamerbot",
      ingestProvider: "streamerbot",
      occurredAt: "2026-05-30T12:00:00.000Z",
      actor: { id: null, displayName: "Viewer" },
      message: null,
      metadata: {},
      amount: null,
      identity: { providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" },
      summary: "Custom",
      userName: "Viewer"
    }]);
    expect(timerEvents).toEqual([external]);
    expect(diagnostics.eventLogs.map((log) => log.status)).toEqual(["received", "processed"]);
  });


  it("delivers events to timers and diagnoses timer failures without blocking alert admission", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator(queueResult(createFollowEvent()));
    const errors: unknown[] = [];
    const received: BusEvent[] = [];
    const failure = new Error("Timer persistence unavailable");
    const pipeline = new EventPipeline({ playbackCoordinator: playback, diagnosticsLogRepository: diagnostics,
      generateId: kind => `${kind}-test`, timerEventSink: { async handleEvent(event) { received.push(event); throw failure; } },
      onTimerError: error => { errors.push(error); }
    });
    await deliver(pipeline, createFollowEvent());
    expect(received).toEqual([busEventFor(createFollowEvent())]); expect(errors).toEqual([failure]);
    expect(playback.events).toEqual([createFollowEvent()]);
    expect(diagnostics.eventLogs.map(log => log.status)).toEqual(["received", "processed"]);
  });
  it("logs received events, enqueues playback, and records alert match and playback outcomes", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator(queueResult(createFollowEvent()));
    const pipeline = createPipeline({ diagnostics, playback });

    await deliver(pipeline, createFollowEvent());

    expect(playback.events).toEqual([createFollowEvent()]);
    expect(diagnostics.eventLogs.map((log) => log.status)).toEqual(["received", "processed"]);
    expect(diagnostics.alertMatchLogs).toEqual([
      expect.objectContaining({
        sourceEventId: "event-follow",
        ruleId: "rule-follow",
        variantId: "variant-follow"
      })
    ]);
    expect(diagnostics.playbackLogs).toEqual([
      expect.objectContaining({
        queueItemId: "queue-item-1",
        sourceEventId: "event-follow",
        alertIds: ["resolved-alert-1", "resolved-alert-2"],
        status: "queued"
      })
    ]);
  });

  it("routes a synthetic Twitch follow through matching, queueing, and overlay playback", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const deliveredInstructions: OverlayInstruction[] = [];
    const playback = createPlaybackCoordinator({
      rules: [createFollowRule()],
      deliveredInstructions
    });
    const pipeline = createPipeline({ diagnostics, playback });

    await deliver(pipeline, createFollowEvent());

    expect(deliveredInstructions.map((instruction) => instruction.scope)).toEqual(["module", "unified"]);
    expect(deliveredInstructions.map((instruction) => instruction.text?.text)).toEqual([
      "Welcome Viewer",
      "Welcome Viewer"
    ]);
    expect(diagnostics.alertMatchLogs).toEqual([
      expect.objectContaining({
        sourceEventId: "event-follow",
        ruleId: "rule-follow",
        variantId: "variant-follow"
      })
    ]);
    expect(diagnostics.playbackLogs).toEqual([
      expect.objectContaining({
        sourceEventId: "event-follow",
        alertIds: ["resolved-alert-1", "resolved-alert-3"],
        status: "queued"
      })
    ]);
  });

  it("matches equivalent Twitch and Streamer.bot lifecycle and community-gift events to the same canonical rules", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = createPlaybackCoordinator({
      rules: [createStreamOnlineRule(), createCommunityGiftRule()],
      deliveredInstructions: []
    });
    const pipeline = createPipeline({ diagnostics, playback });

    for (const event of [
      createStreamOnlineEvent("twitch", "twitch-stream-online"),
      createStreamOnlineEvent("streamerbot", "streamerbot-stream-online"),
      createCommunityGiftEvent("twitch", "twitch-community-gift"),
      createCommunityGiftEvent("streamerbot", "streamerbot-community-gift")
    ]) {
      await deliver(pipeline, event);
    }

    expect(diagnostics.alertMatchLogs.map((log) => [log.sourceEventId, log.ruleId])).toEqual([
      ["twitch-stream-online", "rule-stream-online"],
      ["streamerbot-stream-online", "rule-stream-online"],
      ["twitch-community-gift", "rule-community-gift"],
      ["streamerbot-community-gift", "rule-community-gift"]
    ]);
  });

  it("does not write playback records for no-match outcomes", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator({
      status: "no-matches",
      matchedRuleIds: [],
      enqueuedAlertIds: [],
      snapshot: emptySnapshot()
    });
    const pipeline = createPipeline({ diagnostics, playback });

    await deliver(pipeline, createFollowEvent());

    expect(diagnostics.eventLogs.map((log) => log.status)).toEqual(["received", "processed"]);
    expect(diagnostics.alertMatchLogs).toEqual([]);
    expect(diagnostics.playbackLogs).toEqual([]);
  });

  it("records failed event logs and reports playback failures to the bus", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = {
      async enqueueEvent() {
        throw new Error("Playback unavailable");
      }
    };
    const pipeline = createPipeline({ diagnostics, playback });

    await expect(deliver(pipeline, createFollowEvent())).rejects.toThrow("Playback unavailable");

    expect(diagnostics.eventLogs.map((log) => log.status)).toEqual(["received", "failed"]);
    expect(diagnostics.eventLogs.at(-1)).toMatchObject({
      errorMessage: "Playback unavailable"
    });
  });

  it("fans one accepted event out to Alerts and Screen Effects", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator({
      status: "no-matches",
      matchedRuleIds: [],
      enqueuedAlertIds: [],
      snapshot: emptySnapshot()
    });
    const effectEvents: BusEvent[] = [];
    const pipeline = new EventPipeline({
      diagnosticsLogRepository: diagnostics,
      playbackCoordinator: playback,
      effectEventSink: { async handleEvent(event) { effectEvents.push(event); } },
      generateId: (kind) => `${kind}-1`
    });
    const triggers: readonly EffectTrigger[] = [{
      kind: "streamerbot-event",
      eventId: "event-follow",
      occurredAt: "2026-05-30T12:00:00.000Z",
      providerId: "provider-streamerbot",
      sourceKey: "Custom",
      eventType: "FollowMirror",
      summary: "Follow mirror"
    }];

    await deliver(pipeline, createFollowEvent(), triggers);

    // An explicitly subscribed Streamer.bot identity on a canonical event also reaches external alert rules.
    expect(playback.events.map((event) => [event.type, event.id])).toEqual([
      ["follow", "event-follow"],
      ["external_event", "external:event-follow"]
    ]);
    expect(effectEvents).toEqual([busEventFor(createFollowEvent(), triggers)]);
    expect(diagnostics.eventLogs.map((entry) => entry.status)).toEqual(["received", "processed", "received", "processed"]);
  });

  it("keeps Alert processing successful when Screen Effects rejects a batch", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator({
      status: "no-matches",
      matchedRuleIds: [],
      enqueuedAlertIds: [],
      snapshot: emptySnapshot()
    });
    const errors: Error[] = [];
    const failedEvents: BusEvent[] = [];
    const pipeline = new EventPipeline({
      diagnosticsLogRepository: diagnostics,
      playbackCoordinator: playback,
      effectEventSink: { async handleEvent() { throw new Error("Effect queue unavailable"); } },
      onEffectError(error, event) { errors.push(error); failedEvents.push(event); },
      generateId: (kind) => `${kind}-1`
    });

    await expect(deliver(pipeline, createFollowEvent(), [{
      kind: "streamerbot-event",
      eventId: "event-follow",
      occurredAt: "2026-05-30T12:00:00.000Z",
      providerId: "provider-streamerbot",
      sourceKey: "Custom",
      eventType: "FollowMirror",
      summary: "Follow mirror"
    }])).resolves.toBeUndefined();

    expect(playback.events).toHaveLength(2);
    expect(errors.map((error) => error.message)).toEqual(["Effect queue unavailable"]);
    expect(failedEvents.map((event) => event.eventId)).toEqual(["event-follow"]);
    expect(diagnostics.eventLogs.map((entry) => entry.status)).toEqual(["received", "processed", "received", "processed"]);
  });
});

/** Delivers one canonical bus event to every consumer, isolating failures as the bus does. */
async function deliver(pipeline: EventPipeline, event: NormalizedStreamEvent, triggers: readonly EffectTrigger[] = []): Promise<void> {
  const busEvent = busEventFor(event, triggers);
  const results = await Promise.allSettled(pipeline.consumers().map((consumer) => consumer.handle(busEvent)));
  const failure = results.find((result) => result.status === "rejected");
  if (failure !== undefined) throw failure.reason;
}

function busEventFor(event: NormalizedStreamEvent, triggers: readonly EffectTrigger[] = []): BusEvent {
  return {
    kind: "canonical",
    event,
    sequence: 1,
    busId: `bus-${event.id}`,
    eventId: event.id,
    sourceKind: event.ingestProvider,
    sourceRegistrationId: null,
    receivedAt: "2026-05-30T12:00:00.000Z",
    correlationKey: null,
    effectTriggers: triggers
  };
}

function createPipeline(options: {
  readonly diagnostics: RecordingDiagnosticsRepository;
  readonly playback: { enqueueEvent(event: NormalizedStreamEvent): Promise<PlaybackEnqueueResult> };
}) {
  let nextId = 1;
  return new EventPipeline({
    diagnosticsLogRepository: options.diagnostics,
    playbackCoordinator: options.playback,
    generateId: (kind) => `${kind}-${nextId++}`,
    now: () => new Date("2026-05-30T12:00:00.000Z")
  });
}

function createPlaybackCoordinator(options: {
  readonly rules: readonly AlertRule[];
  readonly deliveredInstructions: OverlayInstruction[];
}): PlaybackCoordinator {
  let nextQueueId = 1;
  let nextResolvedId = 1;
  const clock = () => new Date("2026-05-30T12:00:00.000Z");

  return new PlaybackCoordinator({
    alertService: new RecordingAlertService(options.rules),
    matcher: new DefaultAlertMatcher(),
    resolver: new DefaultAlertResolver({
      generateId: (kind) => kind + "-" + nextResolvedId++,
      random: () => 0
    }),
    queue: new DefaultPlaybackQueue({
      clock,
      generateId: () => "queue-item-" + nextQueueId++
    }),
    cooldownService: new DefaultPlaybackCooldownService({ clock }),
    dedupeService: new DefaultPlaybackDedupeService({
      clock,
      windowMs: 60_000
    }),
    defaultTarget: {
      overlayId: "default",
      purpose: "live",
      scope: "module"
    },
    additionalTargets: [
      {
        overlayId: "default",
        purpose: "live",
        scope: "unified"
      }
    ],
    overlayPlaybackSink: {
      deliverPlaybackInstruction(instruction) {
        options.deliveredInstructions.push(instruction);
      }
    }
  });
}

class RecordingAlertService {
  constructor(readonly rules: readonly AlertRule[]) {}

  async listActiveRules(): Promise<readonly AlertRule[]> {
    return this.rules;
  }
}

class RecordingPlaybackCoordinator {
  readonly events: AlertSourceEvent[] = [];

  constructor(readonly result: PlaybackEnqueueResult) {}

  async enqueueEvent(event: AlertSourceEvent): Promise<PlaybackEnqueueResult> {
    this.events.push(event);
    return this.result;
  }
}

class RecordingDiagnosticsRepository {
  readonly alertMatchLogs: AlertMatchLogRecord[] = [];
  readonly eventLogs: EventLogRecord[] = [];
  readonly playbackLogs: PlaybackLogRecord[] = [];

  async appendEventLog(record: EventLogRecord): Promise<EventLogRecord> {
    this.eventLogs.push(record);
    return record;
  }

  async appendAlertMatchLog(record: AlertMatchLogRecord): Promise<AlertMatchLogRecord> {
    this.alertMatchLogs.push(record);
    return record;
  }

  async appendPlaybackLog(record: PlaybackLogRecord): Promise<PlaybackLogRecord> {
    this.playbackLogs.push(record);
    return record;
  }
}

function queueResult(event: NormalizedStreamEvent): PlaybackEnqueueResult {
  return {
    status: "queued",
    matchedRuleIds: ["rule-follow"],
    enqueuedAlertIds: ["resolved-alert-1", "resolved-alert-2"],
    snapshot: {
      ...emptySnapshot(),
      current: {
        id: "queue-item-1",
        sourceEvent: event,
        audio: [],
        alerts: [
          {
            id: "resolved-alert-1",
            sourceEventId: event.id,
            ruleId: "rule-follow",
            variantId: "variant-follow",
            overlayInstruction: {
              id: "overlay-instruction-1",
              overlayId: "default",
              moduleId: "alerts",
              purpose: "live",
              scope: "module",
              visual: null,
              audio: null,
              text: {
                text: "Thanks Viewer",
                layout: {
                  x: 0,
                  y: 0,
                  width: 100,
                  height: 100,
                  zIndex: 1
                }
              },
              tts: null,
              durationMs: 5_000
            }
          },
          {
            id: "resolved-alert-2",
            sourceEventId: event.id,
            ruleId: "rule-follow",
            variantId: "variant-follow",
            overlayInstruction: {
              id: "overlay-instruction-2",
              overlayId: "default",
              moduleId: "alerts",
              purpose: "live",
              scope: "unified",
              visual: null,
              audio: null,
              text: {
                text: "Thanks Viewer",
                layout: {
                  x: 0,
                  y: 0,
                  width: 100,
                  height: 100,
                  zIndex: 1
                }
              },
              tts: null,
              durationMs: 5_000
            }
          }
        ],
        priority: 1,
        sequence: 0,
        status: "playing",
        enqueuedAt: "2026-05-30T12:00:00.000Z",
        startedAt: "2026-05-30T12:00:00.000Z",
        completedAt: null
      }
    }
  };
}

function createFollowRule(): AlertRule {
  return {
    id: "rule-follow",
    name: "Follow rule",
    eventType: "follow",
    enabled: true,
    collectionIds: ["collection-1"],
    conditions: [],
    variants: [createFollowVariant()],
    cooldownSeconds: 0,
    priority: 1
  };
}

function createStreamOnlineRule(): AlertRule {
  return {
    ...createFollowRule(),
    id: "rule-stream-online",
    name: "Stream online rule",
    eventType: "stream_online",
    variants: [{ ...createFollowVariant(), id: "variant-stream-online" }]
  };
}

function createCommunityGiftRule(): AlertRule {
  return {
    ...createFollowRule(),
    id: "rule-community-gift",
    name: "Community gift rule",
    eventType: "community_gift",
    variants: [{ ...createFollowVariant(), id: "variant-community-gift" }]
  };
}

function createFollowVariant(): AlertVariant {
  return {
    id: "variant-follow",
    name: "Default",
    enabled: true,
    weight: 1,
    visualAssetId: null,
    audioAssetId: null,
    textTemplate: "Welcome {actor.displayName}",
    ttsConfig: null,
    durationMs: 5_000,
    layout: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      zIndex: 1
    }
  };
}

function emptySnapshot(): PlaybackQueueSnapshot {
  return {
    current: null,
    queued: [],
    recent: [],
    paused: false,
    muted: false,
    doNotDisturb: false
  };
}

function createFollowEvent(): NormalizedStreamEvent {
  return {
    id: "event-follow",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    type: "follow",
    occurredAt: "2026-05-30T12:00:00.000Z",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    amount: null,
    message: null,
    metadata: {}
  };
}

function createStreamOnlineEvent(
  ingestProvider: "twitch" | "streamerbot",
  id: string
): NormalizedStreamEvent {
  return {
    id,
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider,
    type: "stream_online",
    occurredAt: "2026-05-30T12:00:00.000Z",
    actor: { id: "streamer-1", displayName: "Streamer" },
    amount: null,
    streamId: "stream-1",
    streamType: "live",
    startedAt: "2026-05-30T12:00:00.000Z",
    endedAt: null,
    message: null,
    metadata: {}
  };
}

function createCommunityGiftEvent(
  ingestProvider: "twitch" | "streamerbot",
  id: string
): NormalizedStreamEvent {
  return {
    id,
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider,
    type: "community_gift",
    occurredAt: "2026-05-30T12:00:00.000Z",
    actor: { id: "gifter-1", displayName: "Gifter" },
    amount: 5,
    tier: "1000",
    cumulativeTotal: 20,
    anonymous: false,
    message: null,
    metadata: {}
  };
}
