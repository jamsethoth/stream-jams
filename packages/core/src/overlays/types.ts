import type { OverlayModuleSnapshot } from "../overlay-modules/types.js";
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

export interface OverlayComposition {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly modules: readonly OverlayModuleSnapshot[];
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
