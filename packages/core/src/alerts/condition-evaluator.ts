import type { NormalizedStreamEvent } from "../events/types.js";
import { readOwnPath } from "../internal/read-own-path.js";
import type { AlertCondition } from "./types.js";

export interface AlertConditionEvaluator {
  evaluate(condition: AlertCondition, event: NormalizedStreamEvent): boolean;
}

export class DefaultAlertConditionEvaluator implements AlertConditionEvaluator {
  evaluate(condition: AlertCondition, event: NormalizedStreamEvent): boolean {
    const actual = readConditionField(event, condition.field);

    switch (condition.operator) {
      case "equals":
        return actual === condition.value;
      case "includes":
        return evaluateIncludes(actual, condition.value);
      case "min":
        return evaluateNumeric(actual, condition.value, (actualNumber, expectedNumber) => actualNumber >= expectedNumber);
      case "max":
        return evaluateNumeric(actual, condition.value, (actualNumber, expectedNumber) => actualNumber <= expectedNumber);
      case "range":
        return evaluateRange(actual, condition.value);
      case "oneOf":
        return typeof actual === "string"
          && Array.isArray(condition.value)
          && condition.value.every((candidate) => typeof candidate === "string")
          && condition.value.includes(actual);
    }
  }
}

function readConditionField(event: NormalizedStreamEvent, field: string): unknown {
  const normalizedField = field.trim();

  switch (normalizedField) {
    case "tenure":
    case "tenureMonths":
      return readOwnPath(event, "streakMonths");
    case "giftCount":
      return readOwnPath(event, "amount");
    case "raidViewers":
    case "cheerAmount":
      return readOwnPath(event, "amount");
    case "channelPointReward":
      return readOwnPath(event, "rewardId");
    case "hypeTrainLevel":
      return readOwnPath(event, "level");
    case "hypeTrainProgress":
      return readOwnPath(event, "progress");
    case "pollVotes":
      return readOwnPath(event, "totalVotes");
    case "predictionPoints":
      return readOwnPath(event, "totalPoints");
    case "terminalStatus":
      return readOwnPath(event, "status");
    case "streamType":
      return readOwnPath(event, "streamType");
    default:
      return readOwnPath(event, normalizedField);
  }
}

function evaluateIncludes(actual: unknown, expected: AlertCondition["value"]): boolean {
  if (typeof actual === "string" && (typeof expected === "string" || typeof expected === "number" || typeof expected === "boolean")) {
    return actual.includes(String(expected));
  }

  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }

  return false;
}

function evaluateNumeric(
  actual: unknown,
  expected: AlertCondition["value"],
  compare: (actualNumber: number, expectedNumber: number) => boolean
): boolean {
  if (typeof actual !== "number" || typeof expected !== "number") {
    return false;
  }

  return compare(actual, expected);
}

function evaluateRange(actual: unknown, expected: AlertCondition["value"]): boolean {
  if (
    typeof actual !== "number" ||
    !Array.isArray(expected) ||
    expected.length !== 2 ||
    typeof expected[0] !== "number" ||
    typeof expected[1] !== "number"
  ) {
    return false;
  }

  return actual >= expected[0] && actual <= expected[1];
}
