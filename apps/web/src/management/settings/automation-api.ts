import { z } from "zod";
import { createManagementHttpClient, type HttpManagementClientOptions } from "../management-http-client.js";

export const automationScopeSchema = z.enum(["timers:read", "timers:control", "playback:read", "playback:pause:alerts", "playback:pause:screen-effects", "playback:skip:alerts", "playback:skip:screen-effects", "playback:clear:alerts", "playback:clear:screen-effects", "playback:mute:alerts", "playback:mute:screen-effects"]);
export type AutomationScope = z.infer<typeof automationScopeSchema>;
const pairingSchema = z.object({ id: z.uuid(), clientName: z.string(), scopes: z.array(automationScopeSchema), comparisonCode: z.string(), expiresAt: z.string(), approvalUrl: z.string(), status: z.enum(["pending", "approved", "denied"]) });
const grantSchema = z.object({ id: z.uuid(), clientName: z.string(), scopes: z.array(automationScopeSchema), createdAt: z.string(), revokedAt: z.string().nullable() });
export type AutomationPairingView = z.infer<typeof pairingSchema>;
export type AutomationGrantView = z.infer<typeof grantSchema>;
export interface AutomationSettingsApi {
  listPairings(): Promise<readonly AutomationPairingView[]>;
  listGrants(): Promise<readonly AutomationGrantView[]>;
  approve(id: string, scopes: readonly AutomationScope[]): Promise<AutomationPairingView>;
  deny(id: string): Promise<AutomationPairingView>;
  revoke(id: string): Promise<{ revoked: boolean }>;
}
export function createHttpAutomationSettingsApi(options: HttpManagementClientOptions = {}): AutomationSettingsApi {
  const client = createManagementHttpClient(options);
  const pairingPath = (id: string) => `/api/automation/pairings/${encodeURIComponent(id)}`;
  return {
    async listPairings() { return z.array(pairingSchema).parse(await client.getJson("/api/automation/pairings", "Unable to load pairing requests.")); },
    async listGrants() { return z.array(grantSchema).parse(await client.getJson("/api/automation/grants", "Unable to load automation permissions.")); },
    async approve(id, scopes) { return pairingSchema.parse(await client.postJson(`${pairingPath(id)}/approve`, { scopes }, "Unable to approve pairing.")); },
    async deny(id) { return pairingSchema.parse(await client.postJson(`${pairingPath(id)}/deny`, {}, "Unable to deny pairing.")); },
    async revoke(id) { return z.object({ revoked: z.boolean() }).parse(await client.postJson(`/api/automation/grants/${encodeURIComponent(id)}/revoke`, {}, "Unable to revoke automation permission.")); }
  };
}
export const defaultAutomationSettingsApi = createHttpAutomationSettingsApi();
