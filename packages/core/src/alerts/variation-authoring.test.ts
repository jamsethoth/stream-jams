import { describe, expect, it } from "vitest";
import { normalizedStreamEventSchema } from "../events/schemas.js";
import { streamEventTypes, type StreamEventType } from "../events/types.js";
import {
  areAlertPriorityGroupsEqual,
  buildAlertPriorityGroups,
  chooseWeightedAlertVariation,
  createNormalizedAlertSampleEvent,
  evaluateAlertVariationSample,
  formatAlertConditionSummary,
  getAlertConditionFieldDefinitions,
  moveAlertPriorityGroup,
  moveAlertVariationToPriorityGroup,
  normalizeAlertPriorityGroups,
  projectAlertVariationSelection,
  validateAuthoredAlertConditions,
  type AlertVariationSelectionCandidate
} from "./variation-authoring.js";

describe("alert condition authoring catalog", () => {
  const expectedFields = {
    follow: ["ingestProvider"],
    subscription: ["tier", "ingestProvider"],
    resubscription: ["tier", "tenureMonths", "ingestProvider"],
    cheer: ["cheerAmount", "ingestProvider"],
    raid: ["raidViewers", "ingestProvider"],
    channel_point_redemption: ["channelPointReward", "rewardTitle", "ingestProvider"],
    gift_subscription: ["tier", "ingestProvider"],
    community_gift: ["tier", "giftCount", "anonymous", "ingestProvider"],
    hype_train_start: ["hypeTrainLevel", "hypeTrainProgress", "total", "ingestProvider"],
    hype_train_progress: ["hypeTrainLevel", "hypeTrainProgress", "total", "ingestProvider"],
    hype_train_end: ["hypeTrainLevel", "hypeTrainProgress", "total", "ingestProvider"],
    poll_start: ["pollVotes", "ingestProvider"],
    poll_progress: ["pollVotes", "ingestProvider"],
    poll_end: ["pollVotes", "terminalStatus", "ingestProvider"],
    prediction_start: ["predictionPoints", "totalUsers", "ingestProvider"],
    prediction_progress: ["predictionPoints", "totalUsers", "ingestProvider"],
    prediction_lock: ["predictionPoints", "totalUsers", "ingestProvider"],
    prediction_end: ["predictionPoints", "totalUsers", "terminalStatus", "ingestProvider"],
    stream_online: ["streamType", "ingestProvider"],
    stream_offline: ["ingestProvider"]
  } as const satisfies Record<StreamEventType, readonly string[]>;

  it("defines only approved normalized fields for every event type", () => {
    for (const eventType of streamEventTypes) {
      const definitions = getAlertConditionFieldDefinitions(eventType);
      expect(definitions.map(({ field }) => field), eventType).toEqual(expectedFields[eventType]);
      expect(definitions.at(-1), eventType).toEqual({
        field: "ingestProvider",
        label: "Event source",
        valueKind: "enum",
        operators: ["equals"],
        options: [
          { label: "Direct Twitch", value: "twitch" },
          { label: "Streamer.bot", value: "streamerbot" }
        ]
      });
      expect(
        definitions.every(({ field }) => !field.startsWith("metadata.") && !field.startsWith("actor")),
        eventType
      ).toBe(true);
    }
  });

  it("defines the approved controls, operators, bounds, and enum options", () => {
    expect(definition("resubscription", "tenureMonths")).toMatchObject({
      valueKind: "number",
      operators: ["equals", "min", "max", "range"],
      minimum: 1
    });
    expect(definition("channel_point_redemption", "channelPointReward")).toMatchObject({
      valueKind: "text",
      operators: ["equals", "oneOf"]
    });
    expect(definition("channel_point_redemption", "rewardTitle")).toMatchObject({
      valueKind: "text",
      operators: ["equals", "includes"]
    });
    expect(definition("community_gift", "anonymous")).toMatchObject({
      valueKind: "boolean",
      operators: ["equals"]
    });
    expect(definition("hype_train_progress", "hypeTrainLevel")).toMatchObject({ minimum: 1 });
    for (const field of ["hypeTrainProgress", "total"] as const) {
      expect(definition("hype_train_progress", field)).toMatchObject({ minimum: 0 });
    }
    expect(definition("poll_end", "terminalStatus").options).toEqual([
      { label: "Completed", value: "completed" },
      { label: "Archived", value: "archived" },
      { label: "Terminated", value: "terminated" }
    ]);
    expect(definition("prediction_end", "terminalStatus").options).toEqual([
      { label: "Resolved", value: "resolved" },
      { label: "Canceled", value: "canceled" }
    ]);
    expect(definition("stream_online", "streamType").options).toEqual([
      { label: "Live", value: "live" },
      { label: "Watch party", value: "watch_party" },
      { label: "Premiere", value: "premiere" },
      { label: "Rerun", value: "rerun" }
    ]);
    expect(definition("subscription", "tier").options).toEqual([
      { label: "Prime", value: "prime" },
      { label: "Tier 1", value: "1000" },
      { label: "Tier 2", value: "2000" },
      { label: "Tier 3", value: "3000" }
    ]);
  });

  it("validates numeric, text, enum, boolean, missing, invalid, and unsupported conditions", () => {
    expect(validateAuthoredAlertConditions("cheer", [
      { field: "cheerAmount", operator: "equals", value: 100 },
      { field: "cheerAmount", operator: "min", value: 1 },
      { field: "cheerAmount", operator: "max", value: 500 },
      { field: "cheerAmount", operator: "range", value: [1, 500] }
    ])).toEqual([]);
    expect(validateAuthoredAlertConditions("channel_point_redemption", [
      { field: "rewardTitle", operator: "includes", value: "hydrate" }
    ])).toEqual([]);
    expect(validateAuthoredAlertConditions("channel_point_redemption", [
      { field: "channelPointReward", operator: "oneOf", value: ["reward-1", "reward-2"] }
    ])).toEqual([]);
    expect(validateAuthoredAlertConditions("subscription", [
      { field: "tier", operator: "equals", value: "1000" }
    ])).toEqual([]);
    expect(validateAuthoredAlertConditions("community_gift", [
      { field: "anonymous", operator: "equals", value: false }
    ])).toEqual([]);

    expect(issueCode("cheer", { field: "cheerAmount", operator: "min", value: undefined })).toBe("missing-value");
    expect(issueCode("channel_point_redemption", { field: "rewardTitle", operator: "equals", value: "  " })).toBe("missing-value");
    expect(issueCode("cheer", { field: "cheerAmount", operator: "min", value: "100" })).toBe("invalid-value");
    expect(issueCode("community_gift", { field: "anonymous", operator: "equals", value: "false" })).toBe("invalid-value");
    expect(issueCode("subscription", { field: "tier", operator: "equals", value: "4000" })).toBe("invalid-value");
    expect(issueCode("cheer", { field: "cheerAmount", operator: "min", value: 0 })).toBe("out-of-bounds");
    expect(issueCode("cheer", { field: "cheerAmount", operator: "range", value: [100, 10] })).toBe("reversed-range");
    expect(issueCode("cheer", { field: "metadata.bits", operator: "equals", value: 100 })).toBe("unsupported-field");
    expect(issueCode("cheer", { field: "cheerAmount", operator: "includes", value: 100 })).toBe("unsupported-operator");
    expect(issueCode("channel_point_redemption", { field: "channelPointReward", operator: "oneOf", value: [] })).toBe("invalid-value");
    expect(issueCode("channel_point_redemption", { field: "rewardTitle", operator: "oneOf", value: ["Hydrate"] })).toBe("unsupported-operator");
  });

  it("formats readable summaries and displays enum labels", () => {
    expect(formatAlertConditionSummary("cheer", { field: "cheerAmount", operator: "equals", value: 100 })).toBe("Cheer amount is 100");
    expect(formatAlertConditionSummary("cheer", { field: "cheerAmount", operator: "min", value: 100 })).toBe("Cheer amount is at least 100");
    expect(formatAlertConditionSummary("cheer", { field: "cheerAmount", operator: "max", value: 500 })).toBe("Cheer amount is at most 500");
    expect(formatAlertConditionSummary("cheer", { field: "cheerAmount", operator: "range", value: [100, 500] })).toBe("Cheer amount is between 100 and 500");
    expect(formatAlertConditionSummary("channel_point_redemption", { field: "rewardTitle", operator: "includes", value: "Hydrate" })).toBe("Reward title contains Hydrate");
    expect(formatAlertConditionSummary("channel_point_redemption", { field: "channelPointReward", operator: "oneOf", value: ["reward-a", "reward-b"] })).toBe("Reward ID is one of reward-a, reward-b");
    expect(formatAlertConditionSummary("subscription", { field: "tier", operator: "equals", value: "1000" })).toBe("Subscription tier is Tier 1");
    expect(formatAlertConditionSummary("follow", { field: "metadata.vip", operator: "equals", value: true })).toBe("Legacy condition: metadata.vip equals true");
  });
});

describe("normalized alert sample events", () => {
  const payloads = {
    follow: {},
    subscription: { amount: 1, tier: "1000" },
    resubscription: { amount: 12, tier: "2000", streakMonths: 6 },
    cheer: { cheerAmount: 250, message: "Great stream" },
    raid: { raidViewers: 42 },
    channel_point_redemption: { rewardId: "reward-1", rewardTitle: "Hydrate", userInput: "water" },
    gift_subscription: { tier: "prime", recipient: { id: "recipient-1", displayName: "Recipient" }, gifter: null },
    community_gift: { amount: 5, tier: "1000", cumulativeTotal: 20, anonymous: false },
    hype_train_start: { trainId: "train-1", level: 2, progress: 10, goal: 100, total: 10 },
    hype_train_progress: { trainId: "train-1", level: 3, progress: 50, goal: 100, total: 50 },
    hype_train_end: { trainId: "train-1", level: 4, progress: 100, goal: 100, total: 100 },
    poll_start: { pollId: "poll-1", title: "Next game?", totalVotes: 0, status: "active" },
    poll_progress: { pollId: "poll-1", title: "Next game?", totalVotes: 12, status: "active" },
    poll_end: { pollId: "poll-1", title: "Next game?", totalVotes: 20, status: "completed" },
    prediction_start: { predictionId: "prediction-1", title: "Win?", totalPoints: 0, totalUsers: 0, status: "active" },
    prediction_progress: { predictionId: "prediction-1", title: "Win?", totalPoints: 500, totalUsers: 10, status: "active" },
    prediction_lock: { predictionId: "prediction-1", title: "Win?", totalPoints: 750, totalUsers: 12, status: "locked" },
    prediction_end: { predictionId: "prediction-1", title: "Win?", totalPoints: 1000, totalUsers: 15, status: "resolved" },
    stream_online: { streamId: "stream-1", streamType: "live" },
    stream_offline: { streamId: "stream-1", streamType: "live" }
  } satisfies Record<StreamEventType, Record<string, unknown>>;

  it("creates schema-valid events for every built-in and session sample shape", () => {
    for (const [index, eventType] of streamEventTypes.entries()) {
      for (const [shape, actorPayload] of [
        ["built-in", { userName: "Sample viewer" }],
        ["session", { actor: { id: "viewer-1", displayName: "Session viewer" } }]
      ] as const) {
        const event = createNormalizedAlertSampleEvent({
          eventType,
          ingestProvider: index % 2 === 0 ? "twitch" : "streamerbot",
          payload: { ...payloads[eventType], ...actorPayload },
          id: `${eventType}-${shape}`,
          occurredAt: "2026-07-26T12:00:00.000Z"
        });

        expect(normalizedStreamEventSchema.safeParse(event).success, `${eventType} ${shape}`).toBe(true);
        expect(event).toMatchObject({ id: `${eventType}-${shape}`, type: eventType });
      }
    }
  });

  it("maps authoring aliases to normalized event fields", () => {
    expect(sampleEvent("cheer", { cheerAmount: 250 }).amount).toBe(250);
    expect(sampleEvent("raid", { raidViewers: 42 }).amount).toBe(42);
    expect(sampleEvent("resubscription", { amount: 12, tenureMonths: 7, tier: "1000" })).toMatchObject({ streakMonths: 7 });
  });
});

describe("alert variation priority groups", () => {
  it("treats ID order within an ordered group as equal membership", () => {
    expect(areAlertPriorityGroupsEqual(
      [{ variationIds: ["a", "b"] }, { variationIds: ["c"] }],
      [{ variationIds: ["b", "a"] }, { variationIds: ["c"] }]
    )).toBe(true);
  });

  it("treats priority-group order changes as unequal", () => {
    expect(areAlertPriorityGroupsEqual(
      [{ variationIds: ["a", "b"] }, { variationIds: ["c"] }],
      [{ variationIds: ["c"] }, { variationIds: ["b", "a"] }]
    )).toBe(false);
  });

  it("treats priority-group membership changes as unequal", () => {
    expect(areAlertPriorityGroupsEqual(
      [{ variationIds: ["a", "b"] }, { variationIds: ["c"] }],
      [{ variationIds: ["a"] }, { variationIds: ["b", "c"] }]
    )).toBe(false);
  });

  it("groups legacy priorities stably by descending effective priority", () => {
    expect(buildAlertPriorityGroups([
      candidate("unset-a", { priority: undefined }),
      candidate("positive-a", { priority: 4 }),
      candidate("zero", { priority: 0 }),
      candidate("negative", { priority: -2 }),
      candidate("positive-b", { priority: 4 }),
      candidate("unset-b", { priority: undefined })
    ])).toEqual([
      { variationIds: ["positive-a", "positive-b"] },
      { variationIds: ["unset-a", "zero", "unset-b"] },
      { variationIds: ["negative"] }
    ]);
  });

  it("moves groups without mutating their members", () => {
    const groups = [{ variationIds: ["a", "b"] }, { variationIds: ["c"] }, { variationIds: ["d"] }];
    expect(moveAlertPriorityGroup(groups, 2, 0)).toEqual([
      { variationIds: ["d"] },
      { variationIds: ["a", "b"] },
      { variationIds: ["c"] }
    ]);
    expect(groups).toEqual([{ variationIds: ["a", "b"] }, { variationIds: ["c"] }, { variationIds: ["d"] }]);
  });

  it("joins and splits groups while removing empty source groups", () => {
    const groups = [{ variationIds: ["a"] }, { variationIds: ["b", "c"] }];
    expect(moveAlertVariationToPriorityGroup(groups, "a", 1)).toEqual([
      { variationIds: ["b", "c", "a"] }
    ]);
    expect(moveAlertVariationToPriorityGroup(groups, "b", "new-last")).toEqual([
      { variationIds: ["a"] },
      { variationIds: ["c"] },
      { variationIds: ["b"] }
    ]);
  });

  it("assigns every variation deterministically above a non-zero default", () => {
    expect(normalizeAlertPriorityGroups([
      { variationIds: ["a", "b"] },
      { variationIds: ["c"] },
      { variationIds: ["d", "e"] }
    ], 7)).toEqual([
      { variationId: "a", priority: 10 },
      { variationId: "b", priority: 10 },
      { variationId: "c", priority: 9 },
      { variationId: "d", priority: 8 },
      { variationId: "e", priority: 8 }
    ]);
  });
});

describe("alert variation selection projection", () => {
  const event = sampleEvent("cheer", { cheerAmount: 100 });

  it("filters disabled and non-matching candidates and keeps only the highest eligible group", () => {
    const candidates = [
      candidate("low", { priority: 1, weight: 100 }),
      candidate("disabled", { enabled: false, priority: 10 }),
      candidate("non-match", { priority: 10, conditions: [{ field: "cheerAmount", operator: "min", value: 500 }] }),
      candidate("top-a", { priority: 5, weight: 1 }),
      candidate("top-b", { priority: 5, weight: 3 })
    ];

    const projection = projectAlertVariationSelection(event, candidates);

    expect(projection.matching.map(({ id }) => id)).toEqual(["low", "top-a", "top-b"]);
    expect(projection.highestPriority).toBe(5);
    expect(projection.topPriority.map(({ id }) => id)).toEqual(["top-a", "top-b"]);
    expect(projection.totalWeight).toBe(4);
    expect(chooseWeightedAlertVariation(projection, 0)?.id).toBe("top-a");
    expect(chooseWeightedAlertVariation(projection, 0.25)?.id).toBe("top-b");
  });

  it("returns null when there is no enabled matching candidate", () => {
    const projection = projectAlertVariationSelection(event, [candidate("disabled", { enabled: false })]);
    expect(projection).toEqual({ matching: [], highestPriority: null, topPriority: [], totalWeight: 0 });
    expect(chooseWeightedAlertVariation(projection, 0.5)).toBeNull();
  });

  it("explains rule no-match and no-enabled-candidate outcomes", () => {
    expect(evaluateAlertVariationSample({
      event,
      ruleConditions: [{ field: "cheerAmount", operator: "min", value: 500 }],
      candidates: [candidate("default")],
      defaultCandidateId: "default"
    })).toMatchObject({ ruleMatches: false, outcome: "rule-no-match", highestEligiblePriority: null });
    expect(evaluateAlertVariationSample({
      event,
      ruleConditions: [],
      candidates: [candidate("default", { enabled: false })],
      defaultCandidateId: "default"
    })).toMatchObject({ ruleMatches: true, outcome: "no-enabled-candidate", highestEligiblePriority: null });
  });

  it("identifies only the failing shared rule conditions", () => {
    const evaluation = evaluateAlertVariationSample({
      event,
      ruleConditions: [
        { field: "cheerAmount", operator: "min", value: 50 },
        { field: "cheerAmount", operator: "max", value: 75 }
      ],
      candidates: [candidate("default")],
      defaultCandidateId: "default"
    });

    expect(evaluation).toMatchObject({
      ruleMatches: false,
      failedRuleConditionIndexes: [1],
      outcome: "rule-no-match"
    });
  });

  it("explains default fallback and a single conditional candidate at 100 percent", () => {
    const fallback = evaluateAlertVariationSample({
      event,
      ruleConditions: [],
      candidates: [
        candidate("default", { priority: 0 }),
        candidate("conditional", { priority: 2, conditions: [{ field: "cheerAmount", operator: "min", value: 500 }] })
      ],
      defaultCandidateId: "default"
    });
    expect(fallback).toMatchObject({ outcome: "default-fallback", legacyDefaultTie: false });
    expect(fallback.candidates[0]).toMatchObject({
      id: "default",
      inHighestEligibleGroup: true,
      relativeChance: { weight: 1, totalWeight: 1, percentage: 100 }
    });

    const conditional = evaluateAlertVariationSample({
      event,
      ruleConditions: [],
      candidates: [candidate("default", { priority: 0 }), candidate("conditional", { priority: 2, weight: 4 })],
      defaultCandidateId: "default"
    });
    expect(conditional).toMatchObject({ outcome: "weighted-candidates", highestEligiblePriority: 2 });
    expect(conditional.candidates[1]?.relativeChance).toEqual({ weight: 4, totalWeight: 4, percentage: 100 });
  });

  it("reports 1:3 chances and an honest legacy default tie", () => {
    const evaluation = evaluateAlertVariationSample({
      event,
      ruleConditions: [],
      candidates: [candidate("default", { weight: 1, priority: null }), candidate("variation", { weight: 3, priority: 0 })],
      defaultCandidateId: "default"
    });

    expect(evaluation).toMatchObject({
      outcome: "weighted-candidates",
      highestEligiblePriority: 0,
      legacyDefaultTie: true
    });
    expect(evaluation.candidates.map(({ relativeChance }) => relativeChance?.percentage)).toEqual([25, 75]);
  });
});

function definition(eventType: StreamEventType, field: string) {
  const result = getAlertConditionFieldDefinitions(eventType).find((candidateDefinition) => candidateDefinition.field === field);
  expect(result, `${field} must be defined for ${eventType}`).toBeDefined();
  return result!;
}

function issueCode(eventType: StreamEventType, condition: Record<string, unknown>) {
  const issues = validateAuthoredAlertConditions(eventType, [condition as never]);
  expect(issues).toHaveLength(1);
  return issues[0]?.code;
}

function sampleEvent(eventType: StreamEventType, payload: Record<string, unknown>) {
  return createNormalizedAlertSampleEvent({
    eventType,
    ingestProvider: "twitch",
    payload: { userName: "Viewer", ...payload },
    id: `event-${eventType}`,
    occurredAt: "2026-07-26T12:00:00.000Z"
  });
}

function candidate(
  id: string,
  overrides: Partial<AlertVariationSelectionCandidate> = {}
): AlertVariationSelectionCandidate {
  return { id, enabled: true, conditions: [], weight: 1, priority: 0, ...overrides };
}
