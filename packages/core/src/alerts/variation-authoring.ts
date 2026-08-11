import { normalizedStreamEventSchema } from "../events/schemas.js";
import type {
  IngestProviderId,
  NormalizedStreamEvent,
  StreamEventType
} from "../events/types.js";
import {
  DefaultAlertConditionEvaluator,
  type AlertConditionEvaluator
} from "./condition-evaluator.js";
import type { AlertCondition } from "./types.js";

export type AlertConditionValueKind = "number" | "text" | "enum" | "boolean";

export interface AlertConditionOption {
  readonly label: string;
  readonly value: string;
}

export interface AlertConditionFieldDefinition {
  readonly field: string;
  readonly label: string;
  readonly valueKind: AlertConditionValueKind;
  readonly operators: readonly AlertCondition["operator"][];
  readonly minimum?: number;
  readonly options?: readonly AlertConditionOption[];
}

export interface AlertConditionValidationIssue {
  readonly conditionIndex: number;
  readonly code:
    | "unsupported-field"
    | "unsupported-operator"
    | "missing-value"
    | "invalid-value"
    | "out-of-bounds"
    | "reversed-range";
  readonly message: string;
}

export interface AlertVariationSelectionCandidate {
  readonly id: string;
  readonly enabled: boolean;
  readonly conditions?: readonly AlertCondition[] | undefined;
  readonly weight: number;
  readonly priority?: number | null | undefined;
}

export interface AlertPriorityGroup {
  readonly variationIds: readonly string[];
}

export interface AlertVariationPriorityAssignment {
  readonly variationId: string;
  readonly priority: number;
}

export interface AlertVariationSampleEvaluationCandidate {
  readonly id: string;
  readonly enabled: boolean;
  readonly conditionsMatch: boolean;
  readonly inHighestEligibleGroup: boolean;
  readonly relativeChance: {
    readonly weight: number;
    readonly totalWeight: number;
    readonly percentage: number;
  } | null;
}

export interface AlertVariationSampleEvaluation {
  readonly ruleMatches: boolean;
  readonly failedRuleConditionIndexes: readonly number[];
  readonly outcome:
    | "rule-no-match"
    | "no-enabled-candidate"
    | "default-fallback"
    | "weighted-candidates";
  readonly highestEligiblePriority: number | null;
  readonly legacyDefaultTie: boolean;
  readonly candidates: readonly AlertVariationSampleEvaluationCandidate[];
}

export interface AlertVariationSelectionProjection<
  T extends AlertVariationSelectionCandidate
> {
  readonly matching: readonly T[];
  readonly highestPriority: number | null;
  readonly topPriority: readonly T[];
  readonly totalWeight: number;
}

const numericOperators = ["equals", "min", "max", "range"] as const;
const ingestProviderDefinition = {
  field: "ingestProvider",
  label: "Event source",
  valueKind: "enum",
  operators: ["equals"],
  options: [
    { label: "Direct Twitch", value: "twitch" },
    { label: "Streamer.bot", value: "streamerbot" }
  ]
} as const satisfies AlertConditionFieldDefinition;
const tierDefinition = {
  field: "tier",
  label: "Subscription tier",
  valueKind: "enum",
  operators: ["equals"],
  options: [
    { label: "Prime", value: "prime" },
    { label: "Tier 1", value: "1000" },
    { label: "Tier 2", value: "2000" },
    { label: "Tier 3", value: "3000" }
  ]
} as const satisfies AlertConditionFieldDefinition;
const hypeTrainDefinitions = [
  numericDefinition("hypeTrainLevel", "Hype Train level", 1),
  numericDefinition("hypeTrainProgress", "Hype Train progress", 0),
  numericDefinition("total", "Hype Train total", 0)
] as const;
const pollDefinitions = [numericDefinition("pollVotes", "Poll votes", 0)] as const;
const predictionDefinitions = [
  numericDefinition("predictionPoints", "Prediction points", 0),
  numericDefinition("totalUsers", "Total users", 0)
] as const;

const conditionCatalog = {
  follow: [ingestProviderDefinition],
  subscription: [tierDefinition, ingestProviderDefinition],
  resubscription: [
    tierDefinition,
    numericDefinition("tenureMonths", "Tenure months", 1),
    ingestProviderDefinition
  ],
  cheer: [numericDefinition("cheerAmount", "Cheer amount", 1), ingestProviderDefinition],
  raid: [numericDefinition("raidViewers", "Raid viewers", 1), ingestProviderDefinition],
  channel_point_redemption: [
    textDefinition("channelPointReward", "Reward ID", ["equals"]),
    textDefinition("rewardTitle", "Reward title", ["equals", "includes"]),
    ingestProviderDefinition
  ],
  gift_subscription: [tierDefinition, ingestProviderDefinition],
  community_gift: [
    tierDefinition,
    numericDefinition("giftCount", "Gift count", 1),
    {
      field: "anonymous",
      label: "Anonymous gift",
      valueKind: "boolean",
      operators: ["equals"]
    },
    ingestProviderDefinition
  ],
  hype_train_start: [...hypeTrainDefinitions, ingestProviderDefinition],
  hype_train_progress: [...hypeTrainDefinitions, ingestProviderDefinition],
  hype_train_end: [...hypeTrainDefinitions, ingestProviderDefinition],
  poll_start: [...pollDefinitions, ingestProviderDefinition],
  poll_progress: [...pollDefinitions, ingestProviderDefinition],
  poll_end: [
    ...pollDefinitions,
    enumDefinition("terminalStatus", "Terminal status", [
      { label: "Completed", value: "completed" },
      { label: "Archived", value: "archived" },
      { label: "Terminated", value: "terminated" }
    ]),
    ingestProviderDefinition
  ],
  prediction_start: [...predictionDefinitions, ingestProviderDefinition],
  prediction_progress: [...predictionDefinitions, ingestProviderDefinition],
  prediction_lock: [...predictionDefinitions, ingestProviderDefinition],
  prediction_end: [
    ...predictionDefinitions,
    enumDefinition("terminalStatus", "Terminal status", [
      { label: "Resolved", value: "resolved" },
      { label: "Canceled", value: "canceled" }
    ]),
    ingestProviderDefinition
  ],
  stream_online: [
    enumDefinition("streamType", "Stream type", [
      { label: "Live", value: "live" },
      { label: "Watch party", value: "watch_party" },
      { label: "Premiere", value: "premiere" },
      { label: "Rerun", value: "rerun" }
    ]),
    ingestProviderDefinition
  ],
  stream_offline: [ingestProviderDefinition]
} satisfies Record<StreamEventType, readonly AlertConditionFieldDefinition[]>;

export function getAlertConditionFieldDefinitions(
  eventType: StreamEventType
): readonly AlertConditionFieldDefinition[] {
  return conditionCatalog[eventType];
}

export function validateAuthoredAlertConditions(
  eventType: StreamEventType,
  conditions: readonly AlertCondition[]
): readonly AlertConditionValidationIssue[] {
  const definitions = new Map(
    getAlertConditionFieldDefinitions(eventType).map((definition) => [definition.field, definition])
  );

  return conditions.flatMap((condition, conditionIndex) => {
    const definition = definitions.get(condition.field);
    if (definition === undefined) {
      return [issue(conditionIndex, "unsupported-field", `Condition field "${condition.field}" is not supported for ${eventType}.`)];
    }
    if (!definition.operators.includes(condition.operator)) {
      return [issue(conditionIndex, "unsupported-operator", `Operator "${condition.operator}" is not supported for ${definition.label}.`)];
    }

    const value = (condition as { readonly value?: unknown }).value;
    if (isMissingConditionValue(value)) {
      return [issue(conditionIndex, "missing-value", `${definition.label} requires a value.`)];
    }

    return validateConditionValue(definition, condition.operator, value, conditionIndex);
  });
}

export function formatAlertConditionSummary(
  eventType: StreamEventType,
  condition: AlertCondition
): string {
  const definition = getAlertConditionFieldDefinitions(eventType).find(
    (candidate) => candidate.field === condition.field
  );
  if (definition === undefined || !definition.operators.includes(condition.operator)) {
    return `Legacy condition: ${condition.field} ${condition.operator} ${formatRawValue(condition.value)}`;
  }

  if (condition.operator === "range" && Array.isArray(condition.value)) {
    return `${definition.label} is between ${String(condition.value[0])} and ${String(condition.value[1])}`;
  }

  const formattedValue = formatDefinedValue(definition, condition.value);
  switch (condition.operator) {
    case "equals":
      return `${definition.label} is ${formattedValue}`;
    case "includes":
      return `${definition.label} contains ${formattedValue}`;
    case "min":
      return `${definition.label} is at least ${formattedValue}`;
    case "max":
      return `${definition.label} is at most ${formattedValue}`;
    case "range":
      return `${definition.label} is between ${formattedValue}`;
  }
}

export function createNormalizedAlertSampleEvent(input: {
  readonly eventType: StreamEventType;
  readonly ingestProvider: IngestProviderId;
  readonly payload: Record<string, unknown>;
  readonly id: string;
  readonly occurredAt: string;
}): NormalizedStreamEvent {
  const { payload } = input;
  const actorValue = payload.actor;
  const actorRecord = recordValue(actorValue);
  const displayName = String(actorRecord.displayName ?? payload.userName ?? "Sample user");
  const amount = positiveNumber(payload.amount) ? payload.amount : 1;
  const base = {
    id: input.id,
    providerId: "twitch" as const,
    sourcePlatform: "twitch" as const,
    ingestProvider: input.ingestProvider,
    occurredAt: input.occurredAt,
    actor: {
      id: actorRecord.id === undefined ? null : String(actorRecord.id),
      displayName
    },
    message: typeof payload.message === "string" ? payload.message : null,
    metadata: { ...payload, test: true, referenceId: input.id }
  };
  const total = nonNegativeNumber(payload.total) ? payload.total : 100;
  const totalVotes = nonNegativeNumber(payload.totalVotes) ? payload.totalVotes : 0;
  const totalPoints = nonNegativeNumber(payload.totalPoints) ? payload.totalPoints : 0;
  const totalUsers = nonNegativeNumber(payload.totalUsers) ? payload.totalUsers : 0;

  const event = (() => {
    switch (input.eventType) {
      case "follow":
        return { ...base, type: "follow" as const, amount: null };
      case "subscription":
        return { ...base, type: "subscription" as const, amount, tier: readTier(payload.tier) };
      case "resubscription":
        return {
          ...base,
          type: "resubscription" as const,
          amount,
          tier: readTier(payload.tier),
          streakMonths: nonNegativeNumber(payload.tenureMonths)
            ? payload.tenureMonths
            : nonNegativeNumber(payload.streakMonths)
              ? payload.streakMonths
              : amount
        };
      case "cheer":
        return { ...base, type: "cheer" as const, amount: positiveNumber(payload.cheerAmount) ? payload.cheerAmount : amount };
      case "raid":
        return { ...base, type: "raid" as const, amount: positiveNumber(payload.raidViewers) ? payload.raidViewers : amount };
      case "channel_point_redemption":
        return {
          ...base,
          type: "channel_point_redemption" as const,
          amount: null,
          rewardId: text(payload.rewardId, "sample-reward"),
          rewardTitle: text(payload.rewardTitle, "Sample reward"),
          userInput: nullableText(payload.userInput)
        };
      case "gift_subscription": {
        const recipient = actor(payload.recipient, "Gift recipient");
        return {
          ...base,
          type: "gift_subscription" as const,
          actor: recipient,
          amount: 1 as const,
          tier: readTier(payload.tier),
          recipient,
          gifter: nullableActor(payload.gifter)
        };
      }
      case "community_gift":
        return {
          ...base,
          type: "community_gift" as const,
          amount,
          tier: readTier(payload.tier),
          cumulativeTotal: nonNegativeNumber(payload.cumulativeTotal) ? payload.cumulativeTotal : null,
          anonymous: payload.anonymous === true
        };
      case "hype_train_start":
      case "hype_train_progress":
      case "hype_train_end":
        return {
          ...base,
          type: input.eventType,
          amount: total,
          trainId: text(payload.trainId, "sample-train"),
          level: nullableNumber(payload.level),
          progress: nullableNumber(payload.progress),
          goal: nullableNumber(payload.goal),
          total,
          startedAt: nullableDate(payload.startedAt, input.occurredAt),
          expiresAt: nullableDate(payload.expiresAt, input.occurredAt),
          endedAt: input.eventType === "hype_train_end" ? nullableDate(payload.endedAt, input.occurredAt) : null,
          cooldownEndsAt: null
        };
      case "poll_start":
      case "poll_progress":
      case "poll_end":
        return {
          ...base,
          type: input.eventType,
          amount: totalVotes,
          pollId: text(payload.pollId, "sample-poll"),
          title: text(payload.title, "Sample poll"),
          choices: [{ id: "choice-1", title: "Option one", totalVotes }],
          totalVotes,
          startedAt: text(payload.startedAt, input.occurredAt),
          endsAt: text(payload.endsAt, input.occurredAt),
          status: text(payload.status, input.eventType === "poll_end" ? "completed" : "active")
        };
      case "prediction_start":
      case "prediction_progress":
      case "prediction_lock":
      case "prediction_end":
        return {
          ...base,
          type: input.eventType,
          amount: totalPoints,
          predictionId: text(payload.predictionId, "sample-prediction"),
          title: text(payload.title, "Sample prediction"),
          outcomes: [{ id: "outcome-1", title: "Option one", totalUsers, totalPoints }],
          totalUsers,
          totalPoints,
          startedAt: text(payload.startedAt, input.occurredAt),
          locksAt: input.eventType === "prediction_lock" ? nullableDate(payload.locksAt, input.occurredAt) : null,
          endedAt: input.eventType === "prediction_end" ? nullableDate(payload.endedAt, input.occurredAt) : null,
          status: text(
            payload.status,
            input.eventType === "prediction_end"
              ? "resolved"
              : input.eventType === "prediction_lock"
                ? "locked"
                : "active"
          ),
          winningOutcomeId: input.eventType === "prediction_end" ? "outcome-1" : null
        };
      case "stream_online":
        return {
          ...base,
          type: "stream_online" as const,
          amount: null,
          streamId: nullableText(payload.streamId),
          streamType: nullableText(payload.streamType),
          startedAt: nullableDate(payload.startedAt, input.occurredAt),
          endedAt: null
        };
      case "stream_offline":
        return {
          ...base,
          type: "stream_offline" as const,
          amount: null,
          streamId: nullableText(payload.streamId),
          streamType: nullableText(payload.streamType),
          startedAt: null,
          endedAt: nullableDate(payload.endedAt, input.occurredAt)
        };
    }
  })();

  return normalizedStreamEventSchema.parse(event);
}

export function buildAlertPriorityGroups(
  variations: readonly AlertVariationSelectionCandidate[]
): readonly AlertPriorityGroup[] {
  const groups = new Map<number, string[]>();
  for (const variation of variations) {
    const priority = effectivePriority(variation);
    const ids = groups.get(priority);
    if (ids === undefined) groups.set(priority, [variation.id]);
    else ids.push(variation.id);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, variationIds]) => ({ variationIds }));
}

export function areAlertPriorityGroupsEqual(
  left: readonly AlertPriorityGroup[],
  right: readonly AlertPriorityGroup[]
): boolean {
  return left.length === right.length && left.every((group, groupIndex) => {
    const rightGroup = right[groupIndex];
    return rightGroup !== undefined
      && group.variationIds.length === rightGroup.variationIds.length
      && sameVariationMembership(group.variationIds, rightGroup.variationIds);
  });
}

export function moveAlertPriorityGroup(
  groups: readonly AlertPriorityGroup[],
  fromIndex: number,
  toIndex: number
): readonly AlertPriorityGroup[] {
  const moved = cloneGroups(groups);
  if (!isGroupIndex(groups, fromIndex) || !isGroupIndex(groups, toIndex) || fromIndex === toIndex) {
    return moved;
  }
  const [group] = moved.splice(fromIndex, 1);
  moved.splice(toIndex, 0, group!);
  return moved;
}

export function moveAlertVariationToPriorityGroup(
  groups: readonly AlertPriorityGroup[],
  variationId: string,
  targetIndex: number | "new-last"
): readonly AlertPriorityGroup[] {
  const sourceIndex = groups.findIndex((group) => group.variationIds.includes(variationId));
  if (sourceIndex < 0 || (targetIndex !== "new-last" && !isGroupIndex(groups, targetIndex))) {
    return cloneGroups(groups);
  }
  if (targetIndex === sourceIndex) return cloneGroups(groups);

  const remaining = groups
    .map((group, originalIndex) => ({
      originalIndex,
      variationIds: group.variationIds.filter((id) => id !== variationId)
    }))
    .filter((group) => group.variationIds.length > 0);

  if (targetIndex === "new-last") {
    return [...remaining.map(({ variationIds }) => ({ variationIds })), { variationIds: [variationId] }];
  }

  return remaining.map((group) => ({
    variationIds: group.originalIndex === targetIndex
      ? [...group.variationIds, variationId]
      : group.variationIds
  }));
}

export function normalizeAlertPriorityGroups(
  groups: readonly AlertPriorityGroup[],
  defaultPriority: number
): readonly AlertVariationPriorityAssignment[] {
  const populatedGroups = groups.filter((group) => group.variationIds.length > 0);
  const priorityBase = Math.max(defaultPriority, 0);
  return populatedGroups.flatMap((group, index) =>
    group.variationIds.map((variationId) => ({
      variationId,
      priority: priorityBase + populatedGroups.length - index
    }))
  );
}

export function projectAlertVariationSelection<T extends AlertVariationSelectionCandidate>(
  event: NormalizedStreamEvent,
  candidates: readonly T[],
  conditionEvaluator: AlertConditionEvaluator = new DefaultAlertConditionEvaluator()
): AlertVariationSelectionProjection<T> {
  const matching = candidates.filter(
    (candidate) => candidate.enabled && candidateConditionsMatch(candidate, event, conditionEvaluator)
  );
  if (matching.length === 0) {
    return { matching, highestPriority: null, topPriority: [], totalWeight: 0 };
  }

  const highestPriority = Math.max(...matching.map(effectivePriority));
  const topPriority = matching.filter((candidate) => effectivePriority(candidate) === highestPriority);
  return {
    matching,
    highestPriority,
    topPriority,
    totalWeight: topPriority.reduce((sum, candidate) => sum + candidate.weight, 0)
  };
}

export function chooseWeightedAlertVariation<T extends AlertVariationSelectionCandidate>(
  projection: AlertVariationSelectionProjection<T>,
  randomValue: number
): T | null {
  if (projection.topPriority.length === 0) return null;

  const threshold = randomValue * projection.totalWeight;
  let cumulativeWeight = 0;
  for (const candidate of projection.topPriority) {
    cumulativeWeight += candidate.weight;
    if (threshold < cumulativeWeight) return candidate;
  }
  return projection.topPriority[projection.topPriority.length - 1] ?? null;
}

export function evaluateAlertVariationSample(input: {
  readonly event: NormalizedStreamEvent;
  readonly ruleConditions: readonly AlertCondition[];
  readonly candidates: readonly AlertVariationSelectionCandidate[];
  readonly defaultCandidateId: string;
  readonly conditionEvaluator?: AlertConditionEvaluator;
}): AlertVariationSampleEvaluation {
  const conditionEvaluator = input.conditionEvaluator ?? new DefaultAlertConditionEvaluator();
  const failedRuleConditionIndexes = input.ruleConditions.flatMap((condition, index) => (
    conditionEvaluator.evaluate(condition, input.event) ? [] : [index]
  ));
  const ruleMatches = failedRuleConditionIndexes.length === 0;
  const projection = projectAlertVariationSelection(input.event, input.candidates, conditionEvaluator);
  const highestEligible = ruleMatches ? projection.topPriority : [];
  const highestEligibleSet = new Set(highestEligible);
  const legacyDefaultTie = highestEligible.some(({ id }) => id === input.defaultCandidateId)
    && highestEligible.some(({ id }) => id !== input.defaultCandidateId);
  const outcome = !ruleMatches
    ? "rule-no-match"
    : projection.matching.length === 0
      ? "no-enabled-candidate"
      : highestEligible.length === 1 && highestEligible[0]?.id === input.defaultCandidateId
        ? "default-fallback"
        : "weighted-candidates";

  return {
    ruleMatches,
    failedRuleConditionIndexes,
    outcome,
    highestEligiblePriority: ruleMatches ? projection.highestPriority : null,
    legacyDefaultTie,
    candidates: input.candidates.map((candidate) => {
      const conditionsMatch = candidateConditionsMatch(candidate, input.event, conditionEvaluator);
      const inHighestEligibleGroup = highestEligibleSet.has(candidate);
      return {
        id: candidate.id,
        enabled: candidate.enabled,
        conditionsMatch,
        inHighestEligibleGroup,
        relativeChance: inHighestEligibleGroup
          ? {
              weight: candidate.weight,
              totalWeight: projection.totalWeight,
              percentage: (candidate.weight / projection.totalWeight) * 100
            }
          : null
      };
    })
  };
}

function numericDefinition(field: string, label: string, minimum: number): AlertConditionFieldDefinition {
  return { field, label, valueKind: "number", operators: numericOperators, minimum };
}

function textDefinition(
  field: string,
  label: string,
  operators: readonly AlertCondition["operator"][]
): AlertConditionFieldDefinition {
  return { field, label, valueKind: "text", operators };
}

function enumDefinition(
  field: string,
  label: string,
  options: readonly AlertConditionOption[]
): AlertConditionFieldDefinition {
  return { field, label, valueKind: "enum", operators: ["equals"], options };
}

function validateConditionValue(
  definition: AlertConditionFieldDefinition,
  operator: AlertCondition["operator"],
  value: unknown,
  conditionIndex: number
): readonly AlertConditionValidationIssue[] {
  if (definition.valueKind === "number") {
    const values = operator === "range" ? value : [value];
    if (!Array.isArray(values) || values.length !== (operator === "range" ? 2 : 1)
      || values.some((candidate) => typeof candidate !== "number" || !Number.isFinite(candidate))) {
      return [issue(conditionIndex, "invalid-value", `${definition.label} requires a finite numeric value.`)];
    }
    if (definition.minimum !== undefined && values.some((candidate) => (candidate as number) < definition.minimum!)) {
      return [issue(conditionIndex, "out-of-bounds", `${definition.label} must be at least ${definition.minimum}.`)];
    }
    if (operator === "range" && (values[0] as number) > (values[1] as number)) {
      return [issue(conditionIndex, "reversed-range", `${definition.label} range minimum cannot exceed its maximum.`)];
    }
    return [];
  }

  if (definition.valueKind === "boolean") {
    return typeof value === "boolean"
      ? []
      : [issue(conditionIndex, "invalid-value", `${definition.label} requires true or false.`)];
  }

  if (typeof value !== "string") {
    return [issue(conditionIndex, "invalid-value", `${definition.label} requires text.`)];
  }
  if (definition.valueKind === "enum" && !definition.options?.some((option) => option.value === value)) {
    return [issue(conditionIndex, "invalid-value", `${definition.label} has an unsupported value.`)];
  }
  return [];
}

function issue(
  conditionIndex: number,
  code: AlertConditionValidationIssue["code"],
  message: string
): AlertConditionValidationIssue {
  return { conditionIndex, code, message };
}

function isMissingConditionValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function formatDefinedValue(
  definition: AlertConditionFieldDefinition,
  value: AlertCondition["value"]
): string {
  if (definition.valueKind === "enum" && typeof value === "string") {
    return definition.options?.find((option) => option.value === value)?.label ?? value;
  }
  return formatRawValue(value);
}

function formatRawValue(value: unknown): string {
  return Array.isArray(value) ? JSON.stringify(value) : String(value);
}

function effectivePriority(candidate: AlertVariationSelectionCandidate): number {
  return candidate.priority ?? 0;
}

function candidateConditionsMatch(
  candidate: AlertVariationSelectionCandidate,
  event: NormalizedStreamEvent,
  conditionEvaluator: AlertConditionEvaluator
): boolean {
  return (candidate.conditions ?? []).every((condition) => conditionEvaluator.evaluate(condition, event));
}

function cloneGroups(groups: readonly AlertPriorityGroup[]): { variationIds: string[] }[] {
  return groups.map((group) => ({ variationIds: [...group.variationIds] }));
}

function sameVariationMembership(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((variationId, index) => variationId === sortedRight[index]);
}

function isGroupIndex(groups: readonly AlertPriorityGroup[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < groups.length;
}

function readTier(value: unknown): "1000" | "2000" | "3000" | "prime" {
  return value === "2000" || value === "3000" || value === "prime" ? value : "1000";
}

function actor(value: unknown, fallbackDisplayName: string) {
  const record = recordValue(value);
  return { id: nullableText(record.id), displayName: text(record.displayName, fallbackDisplayName) };
}

function nullableActor(value: unknown) {
  return value === null || value === undefined ? null : actor(value, "Sample gifter");
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nullableNumber(value: unknown): number | null {
  return nonNegativeNumber(value) ? value : null;
}

function nullableDate(value: unknown, fallback: string): string | null {
  return value === null ? null : text(value, fallback);
}
