import type { AlertSourceEvent } from "../events/types.js";
import { DefaultAlertConditionEvaluator, type AlertConditionEvaluator } from "./condition-evaluator.js";
import type { AlertRule } from "./types.js";

export interface AlertMatch {
  readonly event: AlertSourceEvent;
  readonly rule: AlertRule;
}

export interface FindAlertMatchesInput {
  readonly event: AlertSourceEvent;
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

      const { event } = input;
      // External rules select an exact identity and never evaluate conditions against payload content.
      const conditionsMatch = event.type === "external_event"
        ? rule.externalIdentity !== undefined
          && rule.externalIdentity.providerKind === event.identity.providerKind
          && rule.externalIdentity.sourceKey === event.identity.sourceKey
          && rule.externalIdentity.eventType === event.identity.eventType
        : rule.externalIdentity === undefined
          && rule.conditions.every((condition) => this.#conditionEvaluator.evaluate(condition, event));
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
