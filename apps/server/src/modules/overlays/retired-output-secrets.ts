import type { DatabaseSync } from "node:sqlite";
import type { SecretStore } from "@stream-jams/core";

/** Revocation is durable before best-effort keyring cleanup; failures retry on restart. */
export async function cleanupRetiredOutputSecrets(connection: DatabaseSync, secrets: Pick<SecretStore, "deleteSecret">): Promise<number> {
  connection.prepare("UPDATE overlay_keys SET revoked_at = COALESCE(revoked_at, created_at) WHERE purpose = 'test' OR scope = 'unified'").run();
  const rows = connection.prepare("SELECT id, route_key_secret_ref_json FROM overlay_keys WHERE revoked_at IS NOT NULL AND route_key_secret_ref_json IS NOT NULL").all();
  let failures = 0;
  for (const row of rows) {
    try {
      const ref: unknown = JSON.parse(String(row.route_key_secret_ref_json));
      if (typeof ref !== "object" || ref === null || !("namespace" in ref) || !("accountId" in ref) || !("name" in ref)
        || ref.namespace !== "overlay" || ref.accountId !== row.id || ref.name !== "route-key" || Object.keys(ref).length !== 3) {
        failures += 1;
        continue;
      }
      await secrets.deleteSecret({ namespace: "overlay", accountId: String(row.id), name: "route-key" });
      connection.prepare("UPDATE overlay_keys SET route_key_secret_ref_json = NULL WHERE id = ? AND revoked_at IS NOT NULL").run(row.id!);
    }
    // error-provenance: allow cleanup -- durable revocation survives cleanup failure; only a bounded count is reported
    catch { failures += 1; }
  }
  return failures;
}
