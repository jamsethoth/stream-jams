import type { NormalizedStreamEvent } from "../events/types.js";
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
    }
  }
}

function readConditionField(event: NormalizedStreamEvent, field: string): unknown {
  const normalizedField = field.trim();

  switch (normalizedField) {
    case "tenure":
    case "tenureMonths":
      return readPath(event, "streakMonths");
    case "giftCount":
      return readPath(event, "metadata.giftCount");
    case "raidViewers":
    case "cheerAmount":
      return readPath(event, "amount");
    case "channelPointReward":
      return readPath(event, "rewardId");
    default:
      return readPath(event, normalizedField);
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

function readPath(value: unknown, path: string): unknown {
  if (path.length === 0) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || segment.length === 0) {
      return undefined;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    return Object.prototype.hasOwnProperty.call(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }, value);
}
