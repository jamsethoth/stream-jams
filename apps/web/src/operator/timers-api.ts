import type { TimerCommandResult, TimerRunState, TimerAdjustment } from "@stream-jams/core";
import { createHttpTimersApi, type TimerCommand } from "../management/timers/timers-api.js";
import type { HttpManagementClientOptions } from "../management/management-http-client.js";

export interface OperatorTimersApi {
  listStates(): Promise<readonly TimerRunState[]>;
  command(id: string, command: TimerCommand): Promise<TimerCommandResult>;
  adjust(id: string, adjustment: TimerAdjustment): Promise<TimerCommandResult>;
}
export function createHttpOperatorTimersApi(options: HttpManagementClientOptions = {}): OperatorTimersApi {
  const timers = createHttpTimersApi(options);
  return { listStates: () => timers.listStates(), command: (id, command) => timers.command(id, command), adjust: (id, input) => timers.adjust(id, input) };
}
export const defaultOperatorTimersApi = createHttpOperatorTimersApi();
