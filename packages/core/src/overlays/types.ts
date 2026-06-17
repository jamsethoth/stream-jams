import type { OverlayModuleSnapshot } from "../overlay-modules/types.js";
import type { SecretRef } from "../security/types.js";
import type { OverlayElementLayout, OverlayPurpose, OverlayScope } from "../shared/schemas.js";
import type { TtsPlaybackInstruction } from "../tts/types.js";

export type { OverlayElementLayout, OverlayPurpose, OverlayScope };

export interface ModuleOutputRequest {
  readonly moduleId: string;
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
}

export interface UnifiedOutputRequest {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly enabledModuleIds: readonly string[];
}

export interface OverlayOutputDescriptor {
  readonly overlayId: string;
  readonly scope: OverlayScope;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
}

export interface OverlayOutputView extends OverlayOutputDescriptor {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly keyId: string | null;
  readonly url: string | null;
  readonly copyableUrlStatus: "available" | "create-required" | "regenerate-required";
}

export type CreateOverlayOutputKeyInput = OverlayOutputDescriptor;

export interface OverlayOutputKeyResult {
  readonly output: OverlayOutputView;
  readonly keyId: string;
  readonly url: string;
}

export interface OverlayRouteKeySecret {
  readonly ref: SecretRef;
}

export interface OverlayClientView extends OverlayOutputDescriptor {
  readonly id: string;
  readonly connectedAt: string;
  readonly lastSeenAt: string;
  readonly userAgent: string | null;
}

export interface OverlayComposition {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly modules: readonly OverlayModuleSnapshot[];
}

export function moduleOverlayPath(input: {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly overlayKey: string;
}): string {
  return `/overlay/modules/${encodeURIComponent(input.moduleId)}/${input.purpose}/${encodeURIComponent(input.overlayKey)}`;
}

export function moduleOverlayWebSocketPath(input: {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly overlayKey: string;
}): string {
  return `/overlay/ws/modules/${encodeURIComponent(input.moduleId)}/${input.purpose}/${encodeURIComponent(input.overlayKey)}`;
}

export function unifiedOverlayPath(input: { readonly purpose: OverlayPurpose; readonly overlayKey: string }): string {
  return `/overlay/unified/${input.purpose}/${encodeURIComponent(input.overlayKey)}`;
}

export function unifiedOverlayWebSocketPath(input: { readonly purpose: OverlayPurpose; readonly overlayKey: string }): string {
  return `/overlay/ws/unified/${input.purpose}/${encodeURIComponent(input.overlayKey)}`;
}

export interface OverlayVisualInstruction {
  readonly assetId: string;
  readonly mediaType: "image" | "gif" | "video";
  readonly layout: OverlayElementLayout;
}

export interface OverlayAudioInstruction {
  readonly assetId: string;
  readonly volume: number;
}

export interface OverlayTextInstruction {
  readonly text: string;
  readonly layout: OverlayElementLayout;
}

export interface OverlayInstruction {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly visual: OverlayVisualInstruction | null;
  readonly audio: OverlayAudioInstruction | null;
  readonly text: OverlayTextInstruction | null;
  readonly tts: TtsPlaybackInstruction | null;
  readonly durationMs: number;
}
