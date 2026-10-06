import { SqliteTimerAutomationCredentialRepository } from "./sqlite-timer-automation-credential-repository.js";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { TimerAutomationCredentialService } from "./timer-automation-credential-service.js";

describe("TimerAutomationCredentialService", () => {
  it("does not issue a token when a substitute repository rejects persistence", () => {
    const service = new TimerAutomationCredentialService({
      repository: {
        read: () => null,
        issueOrRotate: () => { throw new Error("write failed"); },
        revoke: () => {}
      },
      generateToken: () => "tmr_first-generated-token_1234567890"
    });
    expect(() => service.createOrRotate()).toThrow("write failed");
    expect(service.verify("tmr_first-generated-token_1234567890")).toBe(false);
  });

  it("returns the raw token only on issue while storing one hash-only verifier", () => {
    using database = createInMemoryStreamJamsDatabase();
    const service = new TimerAutomationCredentialService({
      repository: new SqliteTimerAutomationCredentialRepository(database.connection),
      now: () => new Date("2026-09-29T01:00:00.000Z"),
      generateToken: () => "tmr_first-generated-token_1234567890"
    });

    expect(service.status()).toEqual({ configured: false, createdAt: null, rotatedAt: null });
    const issued = service.createOrRotate();
    expect(issued).toEqual({
      configured: true,
      createdAt: "2026-09-29T01:00:00.000Z",
      rotatedAt: null,
      token: "tmr_first-generated-token_1234567890"
    });
    expect(service.status()).toEqual({ configured: true, createdAt: issued.createdAt, rotatedAt: null });
    expect(service.verify(issued.token)).toBe(true);
    const row = database.connection.prepare("SELECT * FROM timer_automation_credential").get() as Record<string, unknown>;
    expect(row.verifier).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(issued.token);
  });

  it("rotates atomically, invalidates the old token, and preserves creation metadata", () => {
    using database = createInMemoryStreamJamsDatabase();
    const tokens = ["tmr_first-generated-token_1234567890", "tmr_second-generated-token_123456789"];
    let now = new Date("2026-09-29T01:00:00.000Z");
    const service = new TimerAutomationCredentialService({
      repository: new SqliteTimerAutomationCredentialRepository(database.connection),
      now: () => now,
      generateToken: () => tokens.shift()!
    });
    const first = service.createOrRotate();
    now = new Date("2026-09-29T02:00:00.000Z");
    const second = service.createOrRotate();

    expect(second).toMatchObject({ createdAt: first.createdAt, rotatedAt: "2026-09-29T02:00:00.000Z" });
    expect(service.verify(first.token)).toBe(false);
    expect(service.verify(second.token)).toBe(true);
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM timer_automation_credential").get()).toEqual({ count: 1 });
  });

  it("revokes idempotently and rejects malformed or revoked bearer values", () => {
    using database = createInMemoryStreamJamsDatabase();
    const service = new TimerAutomationCredentialService({
      repository: new SqliteTimerAutomationCredentialRepository(database.connection),
      generateToken: () => "tmr_revocable-generated-token_123456"
    });
    const issued = service.createOrRotate();
    expect(service.verify("short")).toBe(false);
    expect(service.verify("ovl_not-a-timer-token_1234567890")).toBe(false);
    service.revoke();
    service.revoke();
    expect(service.status()).toEqual({ configured: false, createdAt: null, rotatedAt: null });
    expect(service.verify(issued.token)).toBe(false);
  });
});
