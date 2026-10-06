import type { DatabaseSync } from "node:sqlite";
import { runInTransaction } from "../db/database.js";
import type { TimerAutomationCredentialRecord, TimerAutomationCredentialRepository } from "./timer-automation-credential-repository.js";

export class SqliteTimerAutomationCredentialRepository implements TimerAutomationCredentialRepository {
  readonly #connection: DatabaseSync;
  constructor(connection: DatabaseSync) { this.#connection = connection; }

  read(): TimerAutomationCredentialRecord | null {
    const row = this.#connection.prepare("SELECT verifier, created_at, rotated_at, revoked_at FROM timer_automation_credential WHERE singleton_id = 1").get();
    if (row === undefined) return null;
    if (typeof row.verifier !== "string" || typeof row.created_at !== "string") throw new Error("Stored timer automation credential is invalid");
    return {
      verifier: row.verifier, createdAt: row.created_at,
      rotatedAt: typeof row.rotated_at === "string" ? row.rotated_at : null,
      revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null
    };
  }

  issueOrRotate(verifier: string, timestamp: string): TimerAutomationCredentialRecord {
    return runInTransaction(this.#connection, () => {
      const current = this.read();
      const active = current !== null && current.revokedAt === null;
      const record = { verifier, createdAt: active ? current.createdAt : timestamp, rotatedAt: active ? timestamp : null, revokedAt: null };
      this.#connection.prepare(`
        INSERT INTO timer_automation_credential (singleton_id, verifier, created_at, rotated_at, revoked_at)
        VALUES (1, ?, ?, ?, NULL)
        ON CONFLICT(singleton_id) DO UPDATE SET verifier = excluded.verifier, created_at = excluded.created_at,
          rotated_at = excluded.rotated_at, revoked_at = NULL
      `).run(record.verifier, record.createdAt, record.rotatedAt);
      return record;
    });
  }

  revoke(timestamp: string): void {
    runInTransaction(this.#connection, () => {
      this.#connection.prepare("UPDATE timer_automation_credential SET revoked_at = COALESCE(revoked_at, ?) WHERE singleton_id = 1").run(timestamp);
    });
  }
}
