import type { AlertTextBoxStyle, AlertTextStyle } from "../alerts/text-style.js";
import type { OverlayModuleSnapshot } from "../overlay-modules/types.js";
import type { SecretRef } from "../security/types.js";
import type {
  OverlayElementLayout,
  OverlayPurpose,
  OverlayScope,
  OverlayTargetProfileId
} from "../shared/schemas.js";
import type { TtsPlaybackInstruction } from "../tts/types.js";

export type { OverlayElementLayout, OverlayPurpose, OverlayScope, OverlayTargetProfileId };

export interface ModuleOutputRequest {
  readonly moduleId: string;
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly targetProfileId?: OverlayTargetProfileId | null;
}

export interface UnifiedOutputRequest {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly enabledModuleIds: readonly string[];
}

export interface OverlayOutputDescriptor {
  readonly overlayId: string;
  readonly scope: OverlayScope;
  readonly targetProfileId?: OverlayTargetProfileId | null;
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
  readonly connectionState: "connected" | "disconnected";
  readonly connectedAt: string;
  readonly disconnectedAt: string | null;
  readonly lastSeenAt: string;
  readonly userAgent: string | null;
}

export interface OverlayComposition {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly targetProfileId?: OverlayTargetProfileId | null;
  readonly modules: readonly OverlayModuleSnapshot[];
}

export function moduleOverlayPath(input: {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly overlayKey: string;
  readonly targetProfileId?: OverlayTargetProfileId | null;
}): string {
  return withTargetProfile(
    `/overlay/modules/${encodeURIComponent(input.moduleId)}/${input.purpose}/${encodeURIComponent(input.overlayKey)}`,
    input.targetProfileId
  );
}

export function moduleOverlayWebSocketPath(input: {
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly overlayKey: string;
  readonly targetProfileId?: OverlayTargetProfileId | null;
}): string {
  return withTargetProfile(
    `/overlay/ws/modules/${encodeURIComponent(input.moduleId)}/${input.purpose}/${encodeURIComponent(input.overlayKey)}`,
    input.targetProfileId
  );
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
  readonly textStyle?: AlertTextStyle | undefined;
  readonly boxStyle?: AlertTextBoxStyle | undefined;
}

export interface OverlayShapeInstruction {
  readonly fill: string;
  readonly layout: OverlayElementLayout;
}

export interface OverlayPresetAnimationInstruction {
  readonly mode: "preset";
  readonly entrance: string;
  readonly exit: string;
  readonly durationMs: number;
  readonly delayMs: number;
  readonly easing: string;
}

export interface OverlayInstruction {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string;
  readonly operatorTest?: true | undefined;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly targetProfileId?: OverlayTargetProfileId | null | undefined;
  readonly visual: OverlayVisualInstruction | null;
  readonly audio: OverlayAudioInstruction | null;
  readonly text: OverlayTextInstruction | null;
  readonly shape?: OverlayShapeInstruction | null | undefined;
  readonly animation?: OverlayPresetAnimationInstruction | null | undefined;
  readonly tts: TtsPlaybackInstruction | null;
  readonly durationMs: number;
}

function withTargetProfile(path: string, targetProfileId: OverlayTargetProfileId | null | undefined): string {
  return targetProfileId === null || targetProfileId === undefined
    ? path
    : `${path}?profile=${encodeURIComponent(targetProfileId)}`;
}
