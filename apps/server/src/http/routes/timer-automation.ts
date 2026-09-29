import type { TimerCommandResult, TimerRunState } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { TimerManagementService } from "../../modules/timers/timer-management-service.js";
import type { TimerRuntimeCoordinator } from "../../modules/timers/timer-runtime-coordinator.js";
import { readEmptyBody, readTimerId, sendTimerError } from "./timers.js";

export interface TimerAutomationRouteDependencies {
  readonly timerManagementService: Pick<TimerManagementService, "listDefinitions" | "getDefinition">;
  readonly timerRuntimeCoordinator: Pick<TimerRuntimeCoordinator,
    "getState" | "start" | "pause" | "resume" | "stop" | "restart">;
  readonly timerAutomationAuthPreHandler: preHandlerHookHandler;
}

const commands = ["start", "pause", "resume", "stop", "restart"] as const;

export function registerTimerAutomationRoutes(app: FastifyInstance, dependencies: TimerAutomationRouteDependencies): void {
  const preHandler = dependencies.timerAutomationAuthPreHandler;
  app.get("/automation/timers", { preHandler }, async () => dependencies.timerManagementService.listDefinitions().map(definition => ({
    id: definition.id,
    label: definition.label,
    state: serializeAutomationState(dependencies.timerRuntimeCoordinator.getState(definition.id))
  })));
  for (const command of commands) {
    app.post(`/automation/timers/:timerId/${command}`, { preHandler }, async (request, reply) => {
      try {
        readEmptyBody(request.body);
        const timerId = readTimerId(request.params);
        dependencies.timerManagementService.getDefinition(timerId);
        const result: TimerCommandResult = await dependencies.timerRuntimeCoordinator[command](timerId);
        return { changed: result.changed, state: serializeAutomationState(result.state) };
      } catch (error) { return sendTimerError(reply, error); }
    });
  }
}

function serializeAutomationState(state: TimerRunState | null): Record<string, unknown> | null {
  if (state === null) return null;
  if (state.status === "running") return {
    status: state.status,
    generation: state.generation,
    startedAtEpochMs: state.startedAtEpochMs,
    endsAtEpochMs: state.endsAtEpochMs
  };
  if (state.status === "paused") return {
    status: state.status,
    generation: state.generation,
    remainingMs: state.remainingMs
  };
  return {
    status: state.status,
    generation: state.generation,
    completedAtEpochMs: state.completedAtEpochMs,
    expiresAtEpochMs: state.expiresAtEpochMs
  };
}
