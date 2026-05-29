import type { ManagementSessionRepository } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { InMemoryManagementSessionRepository, LocalManagementSessionService } from "./management-session-service.js";

const now = new Date("2026-05-29T12:00:00.000Z");
const sessionTtlMs = 15 * 60 * 1000;

describe("LocalManagementSessionService", () => {
  it("creates opaque expiring management sessions and verifies fresh sessions", async () => {
    const repository = new InMemoryManagementSessionRepository();
    const service = new LocalManagementSessionService({
      repository,
      clock: () => now,
      generateId: () => "mgmt_generated-session-id",
      sessionTtlMs
    });

    const session = await service.createSession();
    const verification = await service.verifySession("mgmt_generated-session-id");

    expect(session).toEqual({
      id: "mgmt_generated-session-id",
      createdAt: "2026-05-29T12:00:00.000Z",
      expiresAt: "2026-05-29T12:15:00.000Z",
      revokedAt: null
    });
    expect(session.id).toMatch(/^mgmt_[A-Za-z0-9_-]+$/);
    expect(verification).toEqual({
      authorized: true,
      session
    });
  });

  it("denies unknown, expired, revoked, and overlay-shaped session ids", async () => {
    const repository = new InMemoryManagementSessionRepository();
    const service = new LocalManagementSessionService({
      repository,
      clock: createMutableClock(now),
      generateId: () => "mgmt_revocable-session",
      sessionTtlMs
    });

    expect(await service.verifySession("mgmt_missing")).toEqual({
      authorized: false,
      reason: "not-found"
    });
    expect(await service.verifySession("ovl_not-a-management-session")).toEqual({
      authorized: false,
      reason: "not-found"
    });

    const session = await service.createSession();
    await service.revokeSession(session.id);

    expect(await service.verifySession(session.id)).toEqual({
      authorized: false,
      reason: "revoked"
    });

    const expiredRepository = new InMemoryManagementSessionRepository();
    const mutableClock = createMutableClock(now);
    const expiringService = new LocalManagementSessionService({
      repository: expiredRepository,
      clock: mutableClock,
      generateId: () => "mgmt_expiring-session",
      sessionTtlMs
    });
    const expiringSession = await expiringService.createSession();

    mutableClock.set(new Date("2026-05-29T12:15:00.001Z"));

    expect(await expiringService.verifySession(expiringSession.id)).toEqual({
      authorized: false,
      reason: "expired"
    });
  });

  it("replaces sessions immutably in the repository when revoked", async () => {
    const repository = new InMemoryManagementSessionRepository();
    const service = new LocalManagementSessionService({
      repository,
      clock: () => now,
      generateId: () => "mgmt_repository-session",
      sessionTtlMs
    });

    const session = await service.createSession();
    await service.revokeSession(session.id);

    await expect(repository.findById(session.id)).resolves.toMatchObject({
      id: session.id,
      revokedAt: "2026-05-29T12:00:00.000Z"
    });
    expect(session.revokedAt).toBeNull();
  });
});

function createMutableClock(initial: Date): (() => Date) & { set(next: Date): void } {
  let current = initial;
  const clock = (() => current) as (() => Date) & { set(next: Date): void };
  clock.set = (next: Date) => {
    current = next;
  };
  return clock;
}

class UnusedRepositoryContractCheck implements ManagementSessionRepository {
  async save(): Promise<void> {}

  async findById(): Promise<null> {
    return null;
  }

  async update(): Promise<null> {
    return null;
  }
}

void UnusedRepositoryContractCheck;
