import type { OverlayPurpose, OverlayScope } from "../shared/schemas.js";

export interface SecretRef {
  readonly namespace: "twitch" | "streamerbot" | "tts" | "management" | "overlay";
  readonly accountId: string;
  readonly name: string;
}

export interface OverlayAccessKey {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly keyHash: string;
  readonly routeKeySecretRef: SecretRef | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface ManagementSession {
  readonly id: string;
  readonly csrfToken: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface CreateOverlayKeyInput {
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
}
