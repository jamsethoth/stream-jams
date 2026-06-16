import { randomBytes } from "node:crypto";
import type {
  ManagementSession,
  ManagementSessionRepository,
  ManagementSessionService,
  ManagementSessionVerification
} from "@stream-jams/core";

export interface LocalManagementSessionServiceOptions {
  readonly repository?: ManagementSessionRepository;
  readonly clock?: () => Date;
  readonly generateId?: () => string;
  readonly generateCsrfToken?: () => string;
  readonly sessionTtlMs?: number;
}

const defaultSessionTtlMs = 60 * 60 * 1000;

/** Stores MVP management sessions in process memory until the SQLite repository slice lands. */
export class InMemoryManagementSessionRepository implements ManagementSessionRepository {
  readonly #sessions = new Map<string, ManagementSession>();

  async save(session: ManagementSession): Promise<void> {
    this.#sessions.set(session.id, session);
  }

  async findById(sessionId: string): Promise<ManagementSession | null> {
    return this.#sessions.get(sessionId) ?? null;
  }

  async update(session: ManagementSession): Promise<ManagementSession | null> {
    if (!this.#sessions.has(session.id)) {
      return null;
    }

    this.#sessions.set(session.id, session);
    return session;
  }
}

/** Creates and verifies opaque localhost management sessions independent of HTTP handlers. */
export class LocalManagementSessionService implements ManagementSessionService {
  readonly #repository: ManagementSessionRepository;
  readonly #clock: () => Date;
  readonly #generateId: () => string;
  readonly #generateCsrfToken: () => string;
  readonly #sessionTtlMs: number;

  constructor(options: LocalManagementSessionServiceOptions = {}) {
    this.#repository = options.repository ?? new InMemoryManagementSessionRepository();
    this.#clock = options.clock ?? (() => new Date());
    this.#generateId = options.generateId ?? generateManagementSessionId;
    this.#generateCsrfToken = options.generateCsrfToken ?? generateManagementCsrfToken;
    this.#sessionTtlMs = options.sessionTtlMs ?? defaultSessionTtlMs;
  }

  async createSession(): Promise<ManagementSession> {
    const createdAt = this.#clock();
    const session: ManagementSession = {
      id: this.#generateId(),
      csrfToken: this.#generateCsrfToken(),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.#sessionTtlMs).toISOString(),
      revokedAt: null
    };

    await this.#repository.save(session);
    return session;
  }

  async verifySession(sessionId: string): Promise<ManagementSessionVerification> {
    const session = await this.#repository.findById(sessionId);
    if (session === null) {
      return {
        authorized: false,
        reason: "not-found" as const
      };
    }

    if (session.revokedAt !== null) {
      return {
        authorized: false,
        reason: "revoked" as const
      };
    }

    if (Date.parse(session.expiresAt) <= this.#clock().getTime()) {
      return {
        authorized: false,
        reason: "expired" as const
      };
    }

    return {
      authorized: true,
      session
    };
  }

  async revokeSession(sessionId: string): Promise<ManagementSession | null> {
    const session = await this.#repository.findById(sessionId);
    if (session === null) {
      return null;
    }

    const revokedSession = {
      ...session,
      revokedAt: this.#clock().toISOString()
    };
    return this.#repository.update(revokedSession);
  }
}

export function generateManagementSessionId(): string {
  return `mgmt_${randomBytes(32).toString("base64url")}`;
}

export function generateManagementCsrfToken(): string {
  return `csrf_${randomBytes(32).toString("base64url")}`;
}
