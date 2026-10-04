import type { DatabaseSync } from "node:sqlite";
import { automationScopesSchema, grantView } from "./automation-credential-service.js";
import type { AutomationGrant, AutomationGrantRepository, StoredAutomationGrant } from "./automation-credential-service.js";
export class SqliteAutomationGrantRepository implements AutomationGrantRepository {
  constructor(private readonly connection: DatabaseSync) {}
  insert(g: StoredAutomationGrant): void { this.connection.prepare("INSERT INTO automation_grants(id, client_name, scopes_json, token_hash, created_at, revoked_at, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(g.id, g.clientName, JSON.stringify(g.scopes), g.tokenHash, g.createdAt, g.revokedAt, g.claimedAt); }
  findByHash(hash: string): StoredAutomationGrant | null { const row = this.connection.prepare("SELECT * FROM automation_grants WHERE token_hash = ?").get(hash); return row === undefined ? null : read(row); }
  list(): readonly AutomationGrant[] { return this.connection.prepare("SELECT * FROM automation_grants ORDER BY created_at, id").all().map(row => grantView(read(row))); }
  expireUnclaimed(cutoff: string, at: string): void { this.connection.prepare("UPDATE automation_grants SET revoked_at = ? WHERE claimed_at IS NULL AND revoked_at IS NULL AND created_at <= ?").run(at, cutoff); }
  claim(id: string, at: string): void { this.connection.prepare("UPDATE automation_grants SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL AND revoked_at IS NULL").run(at, id); }
  revoke(id: string, at: string): boolean { return this.connection.prepare("UPDATE automation_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(at, id).changes > 0; }
}
function read(row: Record<string, unknown>): StoredAutomationGrant { return { id: String(row.id), clientName: String(row.client_name), scopes: automationScopesSchema.parse(JSON.parse(String(row.scopes_json))), tokenHash: String(row.token_hash), createdAt: String(row.created_at), claimedAt: row.claimed_at === null ? null : String(row.claimed_at), revokedAt: row.revoked_at === null ? null : String(row.revoked_at) }; }
