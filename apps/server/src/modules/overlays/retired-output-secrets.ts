import type { SecretStore } from "@stream-jams/core";

/** Typed persistence boundary for retiring public outputs and cleaning up revoked route-key secrets. */
export interface RetiredOutputKeyRepository {
  /** Durably revokes every retired test/unified credential; already-revoked keys keep their original time. */
  revokeRetiredPublicOutputs(): void;
  listRevokedSecretReferences(): readonly { readonly id: string; readonly secretRefJson: string }[];
  /** Forgets a revoked key's secret reference after its secret was deleted; never touches active keys. */
  clearRevokedSecretReference(keyId: string): void;
}

/** Revocation is durable before best-effort keyring cleanup; failures retry on restart. */
export async function cleanupRetiredOutputSecrets(repository: RetiredOutputKeyRepository, secrets: Pick<SecretStore, "deleteSecret">): Promise<number> {
  repository.revokeRetiredPublicOutputs();
  let failures = 0;
  for (const row of repository.listRevokedSecretReferences()) {
    try {
      const ref: unknown = JSON.parse(row.secretRefJson);
      if (typeof ref !== "object" || ref === null || !("namespace" in ref) || !("accountId" in ref) || !("name" in ref)
        || ref.namespace !== "overlay" || ref.accountId !== row.id || ref.name !== "route-key" || Object.keys(ref).length !== 3) {
        failures += 1;
        continue;
      }
      await secrets.deleteSecret({ namespace: "overlay", accountId: row.id, name: "route-key" });
      repository.clearRevokedSecretReference(row.id);
    }
    // error-provenance: allow cleanup -- durable revocation survives cleanup failure; only a bounded count is reported
    catch { failures += 1; }
  }
  return failures;
}
