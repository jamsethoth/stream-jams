import { matchesTimerEventRule, timerEventAdjustmentMs, type BusEvent, type TimerDefinitionRepository } from "@stream-jams/core";
import type { TimerRuntimeCoordinator } from "./timer-runtime-coordinator.js";

export class TimerEventService {
  constructor(private readonly definitions: Pick<TimerDefinitionRepository, "list">,
    private readonly runtime: Pick<TimerRuntimeCoordinator, "start" | "stop" | "restart" | "adjust">) {}
  /** Applies every matching rule; resolves true when at least one rule matched. */
  async handleEvent(event: BusEvent): Promise<boolean> {
    let matched = false;
    for (const definition of this.definitions.list()) {
      for (const rule of definition.eventRules ?? []) {
        if (!matchesTimerEventRule(rule, event)) continue;
        matched = true;
        if (rule.action === "increment" || rule.action === "decrement") {
          const amountMs = timerEventAdjustmentMs(rule, event);
          if (amountMs > 0) await this.runtime.adjust(definition.id, { action: rule.action, amountMs }, rule.inactiveBehavior);
        } else await this.runtime[rule.action](definition.id);
      }
    }
    return matched;
  }
}
