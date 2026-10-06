export interface TimerAutomationCredentialRecord {
  readonly verifier: string;
  readonly createdAt: string;
  readonly rotatedAt: string | null;
  readonly revokedAt: string | null;
}

export interface TimerAutomationCredentialRepository {
  read(): TimerAutomationCredentialRecord | null;
  issueOrRotate(verifier: string, timestamp: string): TimerAutomationCredentialRecord;
  revoke(timestamp: string): void;
}
