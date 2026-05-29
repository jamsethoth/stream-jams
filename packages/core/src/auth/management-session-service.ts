import type { ManagementSession } from "../security/types.js";

export type ManagementSessionDenialReason = "not-found" | "expired" | "revoked";

export type ManagementSessionVerification =
  | {
      readonly authorized: true;
      readonly session: ManagementSession;
    }
  | {
      readonly authorized: false;
      readonly reason: ManagementSessionDenialReason;
    };

export interface ManagementSessionRepository {
  save(session: ManagementSession): Promise<void>;
  findById(sessionId: string): Promise<ManagementSession | null>;
  update(session: ManagementSession): Promise<ManagementSession | null>;
}

export interface ManagementSessionService {
  createSession(): Promise<ManagementSession>;
  verifySession(sessionId: string): Promise<ManagementSessionVerification>;
  revokeSession(sessionId: string): Promise<ManagementSession | null>;
}
