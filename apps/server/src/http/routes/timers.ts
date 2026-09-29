import { timerDefinitionInputSchema, type TimerCommandResult } from "@stream-jams/core";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  ActiveTimerDefinitionError,
  TimerDefinitionNotFoundError,
  type TimerManagementService
} from "../../modules/timers/timer-management-service.js";
import type { TimerRuntimeCoordinator } from "../../modules/timers/timer-runtime-coordinator.js";
import type { TimerAutomationCredentialService } from "../../modules/timers/timer-automation-credential-service.js";
import type { OutputReadinessService } from "../../modules/overlays/output-readiness-service.js";
import { TimerDefinitionReferenceError } from "../../modules/timers/sqlite-timer-definition-repository.js";
import { sendHttpError } from "../errors.js";
import { RuntimeMaintenanceUnavailableError } from "../../modules/backup/runtime-maintenance-gate.js";

export interface TimerRouteDependencies {
  readonly timerManagementService: Pick<TimerManagementService,
    "listDefinitions" | "getDefinition" | "createDefinition" | "updateDefinition" | "deleteDefinition">;
  readonly timerRuntimeCoordinator: Pick<TimerRuntimeCoordinator,
    "listStates" | "start" | "pause" | "resume" | "stop" | "restart">;
  readonly timerAutomationCredentialService: Pick<TimerAutomationCredentialService,
    "status" | "createOrRotate" | "revoke">;
  readonly outputReadinessService: Pick<OutputReadinessService, "listTimerBrowserSources">;
  readonly managementAuthPreHandler: preHandlerHookHandler;
  readonly managementRateLimitPreHandler: preHandlerHookHandler;
}

const commands = ["start", "pause", "resume", "stop", "restart"] as const;

export function registerTimerRoutes(app: FastifyInstance, dependencies: TimerRouteDependencies): void {
  const preHandler = [dependencies.managementRateLimitPreHandler, dependencies.managementAuthPreHandler];
  app.get("/timers", { preHandler }, async () => dependencies.timerManagementService.listDefinitions());
  app.get("/timers/state", { preHandler }, async () => dependencies.timerRuntimeCoordinator.listStates());
  app.get("/timers/browser-sources", { preHandler }, async (request) =>
    dependencies.outputReadinessService.listTimerBrowserSources(`http://${request.headers.host ?? "127.0.0.1"}`));
  app.get("/timers/automation-credential", { preHandler }, async () => dependencies.timerAutomationCredentialService.status());
  app.post("/timers/automation-credential/rotate", { preHandler }, async (request, reply) => {
    try {
      readEmptyBody(request.body);
      return reply.status(201).send(dependencies.timerAutomationCredentialService.createOrRotate());
    } catch (error) { return sendTimerError(reply, error); }
  });
  app.delete("/timers/automation-credential", { preHandler }, async (_request, reply) => {
    dependencies.timerAutomationCredentialService.revoke();
    return reply.status(204).send();
  });
  app.get("/timers/:timerId", { preHandler }, async (request, reply) => {
    try { return dependencies.timerManagementService.getDefinition(readTimerId(request.params)); }
    catch (error) { return sendTimerError(reply, error); }
  });
  app.post("/timers", { preHandler }, async (request, reply) => {
    try {
      return reply.status(201).send(dependencies.timerManagementService.createDefinition(timerDefinitionInputSchema.parse(request.body)));
    } catch (error) { return sendTimerError(reply, error); }
  });
  app.put("/timers/:timerId", { preHandler }, async (request, reply) => {
    try {
      return dependencies.timerManagementService.updateDefinition(readTimerId(request.params), timerDefinitionInputSchema.parse(request.body));
    } catch (error) { return sendTimerError(reply, error); }
  });
  app.delete("/timers/:timerId", { preHandler }, async (request, reply) => {
    try {
      dependencies.timerManagementService.deleteDefinition(readTimerId(request.params));
      return reply.status(204).send();
    } catch (error) { return sendTimerError(reply, error); }
  });
  for (const command of commands) {
    app.post(`/timers/:timerId/${command}`, { preHandler }, async (request, reply) => {
      try {
        readEmptyBody(request.body);
        const timerId = readTimerId(request.params);
        dependencies.timerManagementService.getDefinition(timerId);
        const result: TimerCommandResult = await dependencies.timerRuntimeCoordinator[command](timerId);
        return result;
      } catch (error) { return sendTimerError(reply, error); }
    });
  }
}

export function readTimerId(params: unknown): string {
  const value = (params as { readonly timerId?: unknown }).timerId;
  if (typeof value !== "string" || value.length === 0 || value.length > 120 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError("Invalid timer ID");
  }
  return value;
}

export function readEmptyBody(body: unknown): void {
  if (body === undefined || body === null) return;
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    throw new TypeError("Timer command body must be absent or an empty object");
  }
}

export function sendTimerError(reply: Parameters<typeof sendHttpError>[0], error: unknown) {
  if (error instanceof RuntimeMaintenanceUnavailableError) {
    return sendHttpError(reply, 409, { code: "TIMER_MAINTENANCE_ACTIVE", message: "Timer commands are unavailable during maintenance or shutdown. Wait for maintenance to finish or restart the app." });
  }
  if (error instanceof TimerDefinitionNotFoundError) {
    return sendHttpError(reply, 404, { code: "TIMER_NOT_FOUND", message: error.message });
  }
  if (error instanceof ActiveTimerDefinitionError) {
    return sendHttpError(reply, 409, { code: "TIMER_ACTIVE", message: error.message });
  }
  if (error instanceof TimerDefinitionReferenceError) {
    return sendHttpError(reply, 409, { code: "TIMER_REFERENCE_UNAVAILABLE", message: error.message });
  }
  if (error instanceof TypeError || (error instanceof Error && error.name === "ZodError")) {
    return sendHttpError(reply, 400, { code: "INVALID_TIMER_REQUEST", message: "Invalid timer request" });
  }
  throw error;
}
