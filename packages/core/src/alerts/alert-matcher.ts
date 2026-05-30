import type { NormalizedStreamEvent } from "../events/types.js";
import { DefaultAlertConditionEvaluator, type AlertConditionEvaluator } from "./condition-evaluator.js";
import type { AlertRule } from "./types.js";

export interface AlertMatch {
  readonly event: NormalizedStreamEvent;
  readonly rule: AlertRule;
}

export interface FindAlertMatchesInput {
  readonly event: NormalizedStreamEvent;
  readonly rules: readonly AlertRule[];
}

export interface AlertMatcher {
  findMatches(input: FindAlertMatchesInput): readonly AlertMatch[];
}

export interface AlertMatcherDependencies {
  readonly conditionEvaluator?: AlertConditionEvaluator;
}

export class DefaultAlertMatcher implements AlertMatcher {
  readonly #conditionEvaluator: AlertConditionEvaluator;

  constructor(dependencies: AlertMatcherDependencies = {}) {
    this.#conditionEvaluator = dependencies.conditionEvaluator ?? new DefaultAlertConditionEvaluator();
  }

  findMatches(input: FindAlertMatchesInput): readonly AlertMatch[] {
    const seenRuleIds = new Set<string>();
    const matches: AlertMatch[] = [];

    for (const rule of input.rules) {
      if (!rule.enabled || rule.eventType !== input.event.type) {
        continue;
      }

      const conditionsMatch = rule.conditions.every((condition) => this.#conditionEvaluator.evaluate(condition, input.event));
      if (!conditionsMatch || seenRuleIds.has(rule.id)) {
        continue;
      }

      seenRuleIds.add(rule.id);
      matches.push({
        event: input.event,
        rule
      });
    }

    return matches.sort((left, right) => {
      const priorityDifference = right.rule.priority - left.rule.priority;
      return priorityDifference === 0 ? left.rule.id.localeCompare(right.rule.id) : priorityDifference;
    });
  }
}
