import type { OverlayAccessKey, SecretRef } from "../security/types.js";
import type { CreateOverlayKeyInput } from "../security/types.js";

export type OverlayAccessDenialReason =
  | "not-found"
  | "scope-mismatch"
  | "purpose-mismatch"
  | "module-mismatch"
  | "profile-mismatch"
  | "key-mismatch"
  | "revoked";

export interface OverlayRouteAccessRequest extends CreateOverlayKeyInput {
  readonly rawKey: string;
}

export interface OverlayAccessKeyCreateRecordInput extends CreateOverlayKeyInput {
  readonly id: string;
  readonly keyHash: string;
  readonly routeKeySecretRef: SecretRef | null;
  readonly createdAt: string;
}

export interface CreatedOverlayAccessKey {
  readonly rawKey: string;
  readonly record: OverlayAccessKey;
}

export type OverlayAccessVerification =
  | {
      readonly authorized: true;
      readonly record: OverlayAccessKey;
    }
  | {
      readonly authorized: false;
      readonly reason: OverlayAccessDenialReason;
    };

export interface OverlayAccessKeyRepository {
  create(input: OverlayAccessKeyCreateRecordInput): Promise<OverlayAccessKey>;
  findById(keyId: string): Promise<OverlayAccessKey | null>;
  findCandidates(overlayId: string): Promise<readonly OverlayAccessKey[]>;
  findByOutput(input: CreateOverlayKeyInput): Promise<readonly OverlayAccessKey[]>;
  update(record: OverlayAccessKey): Promise<OverlayAccessKey | null>;
}

export interface OverlayAccessService {
  createKey(input: CreateOverlayKeyInput): Promise<CreatedOverlayAccessKey>;
  verifyRouteAccess(request: OverlayRouteAccessRequest): Promise<OverlayAccessVerification>;
  revokeKey(keyId: string): Promise<OverlayAccessKey | null>;
}
