import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  type AlertMatchLogRecord,
  type AlertRule,
  type AlertVariant,
  type EventLogRecord,
  type NormalizedStreamEvent,
  type OverlayInstruction,
  type PlaybackLogRecord,
  type PlaybackQueueSnapshot
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { EventPipeline } from "./event-pipeline.js";
import { PlaybackCoordinator, type PlaybackEnqueueResult } from "../playback/playback-coordinator.js";

describe("EventPipeline", () => {
  it("logs received events, enqueues playback, and records alert match and playback outcomes", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator(queueResult(createFollowEvent()));
    const pipeline = createPipeline({ diagnostics, playback });

    await pipeline.handleEvent(createFollowEvent());

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

    await pipeline.handleEvent(createFollowEvent());

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

  it("does not write playback records for no-match outcomes", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = new RecordingPlaybackCoordinator({
      status: "no-matches",
      matchedRuleIds: [],
      enqueuedAlertIds: [],
      snapshot: emptySnapshot()
    });
    const pipeline = createPipeline({ diagnostics, playback });

    await pipeline.handleEvent(createFollowEvent());

    expect(diagnostics.eventLogs.map((log) => log.status)).toEqual(["received", "processed"]);
    expect(diagnostics.alertMatchLogs).toEqual([]);
    expect(diagnostics.playbackLogs).toEqual([]);
  });

  it("records failed event logs and rethrows playback failures", async () => {
    const diagnostics = new RecordingDiagnosticsRepository();
    const playback = {
      async enqueueEvent() {
        throw new Error("Playback unavailable");
      }
    };
    const pipeline = createPipeline({ diagnostics, playback });

    await expect(pipeline.handleEvent(createFollowEvent())).rejects.toThrow("Playback unavailable");

    expect(diagnostics.eventLogs.map((log) => log.status)).toEqual(["received", "failed"]);
    expect(diagnostics.eventLogs.at(-1)).toMatchObject({
      errorMessage: "Playback unavailable"
    });
  });
});

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
  readonly events: NormalizedStreamEvent[] = [];

  constructor(readonly result: PlaybackEnqueueResult) {}

  async enqueueEvent(event: NormalizedStreamEvent): Promise<PlaybackEnqueueResult> {
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
