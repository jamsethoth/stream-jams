import {
  overlayModuleConfigSchema,
  timerCommandResultSchema,
  timerDefinitionInputSchema,
  timerDefinitionSchema,
  timerRunStateSchema,
  timersOverlayModuleConfigSchema,
  type OverlayModuleConfig,
  type TimerCommandResult,
  type TimerDefinition,
  type TimerDefinitionInput,
  type TimerRunState,
  type TimersOverlayModuleConfig
} from "@stream-jams/core";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

export interface TimerAutomationCredentialStatus {
  readonly configured: boolean;
  readonly createdAt: string | null;
  readonly rotatedAt: string | null;
}
export interface TimerAutomationCredentialIssue extends TimerAutomationCredentialStatus { readonly token: string; }
export type TimerCommand = "start" | "pause" | "resume" | "stop" | "restart";

export interface TimersApi {
  list(): Promise<readonly TimerDefinition[]>;
  listStates(): Promise<readonly TimerRunState[]>;
  create(input: TimerDefinitionInput): Promise<TimerDefinition>;
  update(id: string, input: TimerDefinitionInput): Promise<TimerDefinition>;
  remove(id: string): Promise<void>;
  command(id: string, command: TimerCommand): Promise<TimerCommandResult>;
  getModuleConfig(): Promise<OverlayModuleConfig<TimersOverlayModuleConfig>>;
  saveModuleConfig(enabled: boolean, config: TimersOverlayModuleConfig): Promise<OverlayModuleConfig<TimersOverlayModuleConfig>>;
  getAutomationCredential(): Promise<TimerAutomationCredentialStatus>;
  rotateAutomationCredential(): Promise<TimerAutomationCredentialIssue>;
  revokeAutomationCredential(): Promise<void>;
}

export function createHttpTimersApi(options: HttpManagementClientOptions = {}): TimersApi {
  const client = createManagementHttpClient(options);
  const timerPath = (id: string) => `/timers/${encodeURIComponent(id)}`;
  const parseModuleConfig = (candidate: unknown): OverlayModuleConfig<TimersOverlayModuleConfig> => {
    const parsed = overlayModuleConfigSchema.parse(candidate);
    if (parsed.moduleId !== "timers") throw new TypeError("Expected Timers module configuration");
    return { ...parsed, config: timersOverlayModuleConfigSchema.parse(parsed.config) };
  };
  return {
    async list() { return timerDefinitionSchema.array().parse(await client.getJson("/timers", "Unable to load timers.")); },
    async listStates() { return timerRunStateSchema.array().parse(await client.getJson("/timers/state", "Unable to load active timers.")); },
    async create(input) { return timerDefinitionSchema.parse(await client.postJson("/timers", timerDefinitionInputSchema.parse(input), "Unable to create the timer.")); },
    async update(id, input) { return timerDefinitionSchema.parse(await client.putJson(timerPath(id), timerDefinitionInputSchema.parse(input), "Unable to save the timer.")); },
    async remove(id) { await client.deleteRequest(timerPath(id), "Unable to delete the timer."); },
    async command(id, command) { return timerCommandResultSchema.parse(await client.postJson(`${timerPath(id)}/${command}`, undefined, `Unable to ${command} the timer.`)); },
    async getModuleConfig() { return parseModuleConfig(await client.getJson("/overlay-modules/timers/config", "Unable to load timer layout.")); },
    async saveModuleConfig(enabled, config) { return parseModuleConfig(await client.putJson("/overlay-modules/timers/config", {
      enabled, config: timersOverlayModuleConfigSchema.parse(config)
    }, "Unable to save timer layout.")); },
    async getAutomationCredential() { return parseCredential(await client.getJson("/timers/automation-credential", "Unable to load timer automation status."), false); },
    async rotateAutomationCredential() { return parseCredential(await client.postJson("/timers/automation-credential/rotate", undefined, "Unable to create the timer automation credential."), true); },
    async revokeAutomationCredential() { await client.deleteRequest("/timers/automation-credential", "Unable to revoke the timer automation credential."); }
  };
}

export const defaultTimersApi: TimersApi = createHttpTimersApi();

function parseCredential(candidate: unknown, issued: false): TimerAutomationCredentialStatus;
function parseCredential(candidate: unknown, issued: true): TimerAutomationCredentialIssue;
function parseCredential(candidate: unknown, issued: boolean): TimerAutomationCredentialStatus | TimerAutomationCredentialIssue {
  if (typeof candidate !== "object" || candidate === null) throw new TypeError("Invalid timer automation credential response");
  const value = candidate as Record<string, unknown>;
  const expectedKeys = issued ? ["configured", "createdAt", "rotatedAt", "token"] : ["configured", "createdAt", "rotatedAt"];
  if (Object.keys(value).some(key => !expectedKeys.includes(key)) || typeof value.configured !== "boolean" ||
    !nullableDate(value.createdAt) || !nullableDate(value.rotatedAt) || (issued && (typeof value.token !== "string" || !/^tmr_[A-Za-z0-9_-]{32,}$/u.test(value.token)))) {
    throw new TypeError("Invalid timer automation credential response");
  }
  const status = { configured: value.configured, createdAt: value.createdAt as string | null, rotatedAt: value.rotatedAt as string | null };
  return issued ? { ...status, token: value.token as string } : status;
}
function nullableDate(value: unknown): boolean { return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value))); }
