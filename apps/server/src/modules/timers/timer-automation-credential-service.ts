import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { runInTransaction } from "../db/database.js";

export interface TimerAutomationCredentialView {
  readonly configured: boolean;
  readonly createdAt: string | null;
  readonly rotatedAt: string | null;
}

export interface TimerAutomationCredentialIssue extends TimerAutomationCredentialView {
  readonly token: string;
}

interface TimerAutomationCredentialServiceOptions {
  readonly connection: DatabaseSync;
  readonly now?: () => Date;
  readonly generateToken?: () => string;
}

interface CredentialRow extends Record<string, unknown> {
  readonly verifier: unknown;
  readonly created_at: unknown;
  readonly rotated_at: unknown;
  readonly revoked_at: unknown;
}

const tokenPattern = /^tmr_[A-Za-z0-9_-]{32,}$/;
const verifierPattern = /^sha256:([a-f0-9]{64})$/;

export class TimerAutomationCredentialService {
  readonly #connection: DatabaseSync;
  readonly #now: () => Date;
  readonly #generateToken: () => string;

  constructor(options: TimerAutomationCredentialServiceOptions) {
    this.#connection = options.connection;
    this.#now = options.now ?? (() => new Date());
    this.#generateToken = options.generateToken ?? (() => `tmr_${randomBytes(32).toString("base64url")}`);
  }

  status(): TimerAutomationCredentialView {
    const row = this.#read();
    if (row === null || row.revokedAt !== null) return { configured: false, createdAt: null, rotatedAt: null };
    return { configured: true, createdAt: row.createdAt, rotatedAt: row.rotatedAt };
  }

  createOrRotate(): TimerAutomationCredentialIssue {
    return runInTransaction(this.#connection, () => {
      const token = this.#generateToken();
      if (!tokenPattern.test(token)) throw new Error("Generated timer automation token has an invalid format");
      const current = this.#read();
      const timestamp = this.#now().toISOString();
      const createdAt = current === null || current.revokedAt !== null ? timestamp : current.createdAt;
      const rotatedAt = current === null || current.revokedAt !== null ? null : timestamp;
      this.#connection.prepare(`
        INSERT INTO timer_automation_credential (singleton_id, verifier, created_at, rotated_at, revoked_at)
        VALUES (1, ?, ?, ?, NULL)
        ON CONFLICT(singleton_id) DO UPDATE SET
          verifier = excluded.verifier,
          created_at = excluded.created_at,
          rotated_at = excluded.rotated_at,
          revoked_at = NULL
      `).run(hashToken(token), createdAt, rotatedAt);
      return { configured: true, createdAt, rotatedAt, token };
    });
  }

  revoke(): void {
    runInTransaction(this.#connection, () => {
      this.#connection.prepare(
        "UPDATE timer_automation_credential SET revoked_at = COALESCE(revoked_at, ?) WHERE singleton_id = 1"
      ).run(this.#now().toISOString());
    });
  }

  verify(token: string): boolean {
    if (!tokenPattern.test(token)) return false;
    const row = this.#read();
    if (row === null || row.revokedAt !== null) return false;
    const verifierMatch = verifierPattern.exec(row.verifier);
    if (verifierMatch === null) return false;
    const candidate = createHash("sha256").update(token).digest();
    const expected = Buffer.from(verifierMatch[1]!, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  #read(): { verifier: string; createdAt: string; rotatedAt: string | null; revokedAt: string | null } | null {
    const row = this.#connection.prepare(
      "SELECT verifier, created_at, rotated_at, revoked_at FROM timer_automation_credential WHERE singleton_id = 1"
    ).get() as CredentialRow | undefined;
    if (row === undefined) return null;
    if (typeof row.verifier !== "string" || typeof row.created_at !== "string") {
      throw new Error("Stored timer automation credential is invalid");
    }
    return {
      verifier: row.verifier,
      createdAt: row.created_at,
      rotatedAt: typeof row.rotated_at === "string" ? row.rotated_at : null,
      revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null
    };
  }
}

function hashToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}
