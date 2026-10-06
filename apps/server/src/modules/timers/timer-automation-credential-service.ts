import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { TimerAutomationCredentialRepository } from "./timer-automation-credential-repository.js";


export interface TimerAutomationCredentialView {
  readonly configured: boolean;
  readonly createdAt: string | null;
  readonly rotatedAt: string | null;
}

export interface TimerAutomationCredentialIssue extends TimerAutomationCredentialView {
  readonly token: string;
}

interface TimerAutomationCredentialServiceOptions {
  readonly repository: TimerAutomationCredentialRepository;
  readonly now?: () => Date;
  readonly generateToken?: () => string;
}


const tokenPattern = /^tmr_[A-Za-z0-9_-]{32,}$/;
const verifierPattern = /^sha256:([a-f0-9]{64})$/;

export class TimerAutomationCredentialService {
  readonly #repository: TimerAutomationCredentialRepository;
  readonly #now: () => Date;
  readonly #generateToken: () => string;

  constructor(options: TimerAutomationCredentialServiceOptions) {
    this.#repository = options.repository;
    this.#now = options.now ?? (() => new Date());
    this.#generateToken = options.generateToken ?? (() => `tmr_${randomBytes(32).toString("base64url")}`);
  }

  status(): TimerAutomationCredentialView {
    const row = this.#repository.read();
    if (row === null || row.revokedAt !== null) return { configured: false, createdAt: null, rotatedAt: null };
    return { configured: true, createdAt: row.createdAt, rotatedAt: row.rotatedAt };
  }

  createOrRotate(): TimerAutomationCredentialIssue {
    const token = this.#generateToken();
    if (!tokenPattern.test(token)) throw new Error("Generated timer automation token has an invalid format");
    const record = this.#repository.issueOrRotate(hashToken(token), this.#now().toISOString());
    return { configured: true, createdAt: record.createdAt, rotatedAt: record.rotatedAt, token };
  }

  revoke(): void {
    this.#repository.revoke(this.#now().toISOString());
  }
  verify(token: string): boolean {
    if (!tokenPattern.test(token)) return false;
    const row = this.#repository.read();
    if (row === null || row.revokedAt !== null) return false;
    const verifierMatch = verifierPattern.exec(row.verifier);
    if (verifierMatch === null) return false;
    const candidate = createHash("sha256").update(token).digest();
    const expected = Buffer.from(verifierMatch[1]!, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

}

function hashToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}
