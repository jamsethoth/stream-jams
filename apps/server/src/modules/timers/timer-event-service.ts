import { matchesTimerEventRule, timerEventAdjustmentMs, type NormalizedStreamEvent, type TimerDefinitionRepository } from "@stream-jams/core";
import type { TimerRuntimeCoordinator } from "./timer-runtime-coordinator.js";

export class TimerEventService {
  constructor(private readonly definitions: Pick<TimerDefinitionRepository, "list">,
    private readonly runtime: Pick<TimerRuntimeCoordinator, "start" | "stop" | "restart" | "adjust">) {}
  async handleEvent(event: NormalizedStreamEvent): Promise<void> {
    for (const definition of this.definitions.list()) {
      for (const rule of definition.eventRules ?? []) {
        if (!matchesTimerEventRule(rule, event)) continue;
        if (rule.action === "increment" || rule.action === "decrement") {
          const amountMs = timerEventAdjustmentMs(rule, event);
          if (amountMs > 0) await this.runtime.adjust(definition.id, { action: rule.action, amountMs }, rule.inactiveBehavior);
        } else await this.runtime[rule.action](definition.id);
      }
    }
  }
}
