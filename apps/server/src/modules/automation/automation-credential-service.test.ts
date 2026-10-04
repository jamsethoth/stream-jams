import { RuntimeMaintenanceGate, RuntimeMaintenanceUnavailableError } from "../backup/runtime-maintenance-gate.js";
import { SqliteConfigurationSnapshotRepository } from "../backup/sqlite-configuration-snapshot-repository.js";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAutomationGrantRepository } from "./sqlite-automation-grant-repository.js";
import { AutomationCredentialService } from "./automation-credential-service.js";
const verifier = "a".repeat(43);
const input = { clientName: "Test client", scopes: ["timers:read", "timers:control"], codeChallenge: createHash("sha256").update(verifier).digest("base64url") };
describe("proof-bound pairing", () => {
  it("requires approval and proof, persists only hashes, rejects replay and revocation", () => {
    using db = createInMemoryStreamJamsDatabase();
    const service = new AutomationCredentialService(new SqliteAutomationGrantRepository(db.connection));
    const pending = service.createPairing(input);
    expect(() => service.exchange(pending.id, verifier)).toThrow();
    expect(() => service.pairingStatus(pending.id, "b".repeat(43))).toThrow();
    service.approve(pending.id, { scopes: ["timers:read"] });
    const grant = service.exchange(pending.id, verifier);
    expect(service.verify(grant.token)?.scopes).toEqual(["timers:read"]);
    expect(JSON.stringify(db.connection.prepare("SELECT * FROM automation_grants").all())).not.toContain(grant.token);
    expect(() => service.exchange(pending.id, verifier)).toThrow();
    service.revoke(grant.grant.id);
    expect(service.verify(grant.token)).toBeNull();
  });
  it("expires requests, bounds pending requests and rejects broadened approval or missing read scopes", () => {
    using db = createInMemoryStreamJamsDatabase();
    let now = 0;
    const service = new AutomationCredentialService(new SqliteAutomationGrantRepository(db.connection), { now: () => now });
    expect(() => service.createPairing({ ...input, scopes: ["timers:control"] })).toThrow();
    const p = service.createPairing(input);
    expect(() => service.approve(p.id, { scopes: ["playback:read"] })).toThrow();
    now = 300_000;
    expect(() => service.pairingStatus(p.id, verifier)).toThrow();
    for (let i = 0; i < 32; i++) service.createPairing(input);
    expect(() => service.createPairing(input)).toThrow();
  });
});
it("expires unclaimed exchange responses across restart but preserves claimed grants", () => {
 using db = createInMemoryStreamJamsDatabase(); let now = 0; const repository = new SqliteAutomationGrantRepository(db.connection);
 let service = new AutomationCredentialService(repository, { now: () => now });
 const exchange = () => { const p = service.createPairing(input); service.approve(p.id, { scopes: ["timers:read"] }); return service.exchange(p.id, verifier); };
 const lost = exchange(); const claimed = exchange(); expect(service.verify(claimed.token)).not.toBeNull();
 now = 300_000; service = new AutomationCredentialService(repository, { now: () => now });
 expect(service.verify(lost.token)).toBeNull(); expect(service.verify(claimed.token)).not.toBeNull();
 expect(service.listGrants().find(g => g.id === lost.grant.id)?.revokedAt).not.toBeNull();
 const pending = service.createPairing(input); service.approve(pending.id, { scopes: ["timers:read"] }); service.clearPending(); expect(() => service.exchange(pending.id, verifier)).toThrow();
});
it("blocks pairing mutations during maintenance without consuming proof requests", () => {
 using db = createInMemoryStreamJamsDatabase(); let blocked = false;
 const service = new AutomationCredentialService(new SqliteAutomationGrantRepository(db.connection), { assertAvailable: () => { if (blocked) throw new Error("maintenance"); } });
 const pending = service.createPairing(input); blocked = true;
 expect(() => service.createPairing(input)).toThrow("maintenance"); expect(() => service.approve(pending.id, { scopes: ["timers:read"] })).toThrow("maintenance"); expect(() => service.deny(pending.id)).toThrow("maintenance");
 blocked = false; service.approve(pending.id, { scopes: ["timers:read"] }); blocked = true; expect(() => service.exchange(pending.id, verifier)).toThrow("maintenance");
 blocked = false; expect(service.exchange(pending.id, verifier).token).toMatch(/^sja_/u);
});
it("guards revoke, expiry and first-use claim writes during real maintenance and rollback", async () => {
 using db = createInMemoryStreamJamsDatabase(); let now = 0;
 const gate = new RuntimeMaintenanceGate(); const repository = new SqliteAutomationGrantRepository(db.connection);
 const service = new AutomationCredentialService(repository, { now: () => now, assertAvailable: () => gate.runConfigurationMutation(() => undefined) });
 const exchange = () => { const p = service.createPairing(input); service.approve(p.id, { scopes: ["timers:read"] }); return service.exchange(p.id, verifier); };
 const claimed = exchange(); service.verify(claimed.token); const unclaimed = exchange();
 const snapshot = new SqliteConfigurationSnapshotRepository(db.connection); const restorePoint = snapshot.captureRestorePoint();
 await gate.runMaintenance(async () => {
  expect(() => service.revoke(claimed.grant.id)).toThrow(RuntimeMaintenanceUnavailableError);
  expect(() => service.verify(unclaimed.token)).toThrow(RuntimeMaintenanceUnavailableError);
  now = 300_000;
  expect(() => service.listGrants()).toThrow(RuntimeMaintenanceUnavailableError);
  expect(repository.findByHash(createHash("sha256").update(claimed.token).digest("base64url"))?.revokedAt).toBeNull();
  expect(repository.findByHash(createHash("sha256").update(unclaimed.token).digest("base64url"))?.revokedAt).toBeNull();
  snapshot.restoreRestorePoint(restorePoint);
 });
 expect(service.revoke(claimed.grant.id)).toBe(true); expect(service.verify(claimed.token)).toBeNull(); expect(service.verify(unclaimed.token)).toBeNull();
});
