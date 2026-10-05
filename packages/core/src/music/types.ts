import type { z } from "zod";
import type { MediaVersionSnapshot } from "../assets/media-reference.js";
import type {
  musicAlignmentSchema, musicAppearanceSchema, musicBrandingSchema, musicCapabilitiesSchema,
  musicConnectionTestResultSchema, musicCssConfigSchema, musicInsetsSchema, musicComponentRectSchema, musicComponentLayoutSchema, musicModuleConfigSchema,
  musicProfileConfigSchema, musicSnapshotSchema, musicStatusSchema, musicThemeSchema, musicTrackSchema,
  musicTypographySchema, musicViewSchema, musicWidgetProjectionSchema, musicPublicAssetReferenceSchema
} from "./schemas.js";

export type MusicSnapshot = z.infer<typeof musicSnapshotSchema>;
export type MusicTrack = z.infer<typeof musicTrackSchema>;
export type MusicStatus = z.infer<typeof musicStatusSchema>;
export type MusicCapabilities = z.infer<typeof musicCapabilitiesSchema>;
export type MusicConnectionTestResult = z.infer<typeof musicConnectionTestResultSchema>;
export type MusicModuleConfig = z.infer<typeof musicModuleConfigSchema>;
export type MusicProfileConfig = z.infer<typeof musicProfileConfigSchema>;
export type MusicAppearance = z.infer<typeof musicAppearanceSchema>;
export type MusicTypography = z.infer<typeof musicTypographySchema>;
export type MusicBranding = z.infer<typeof musicBrandingSchema>;
export type MusicInsets = z.infer<typeof musicInsetsSchema>;
export type MusicComponentRect = z.infer<typeof musicComponentRectSchema>;
export type MusicComponentLayout = z.infer<typeof musicComponentLayoutSchema>;
export type MusicCssConfig = z.infer<typeof musicCssConfigSchema>;
export type MusicView = z.infer<typeof musicViewSchema>;
export type MusicTheme = z.infer<typeof musicThemeSchema>;
export type MusicAlignment = z.infer<typeof musicAlignmentSchema>;
export type MusicWidgetProjection = z.infer<typeof musicWidgetProjectionSchema>;
export type MusicPublicAssetReference = z.infer<typeof musicPublicAssetReferenceSchema>;

/** Server construction supplies ownership; adapters publish complete bounded observations only. */
export interface MusicSourceAdapter {
  testConnection(signal: AbortSignal): Promise<MusicConnectionTestResult>;
  start(onSnapshot: (snapshot: MusicSnapshot) => void, onStatus: (status: MusicStatus) => void, signal: AbortSignal): Promise<void>;
  getSnapshot(): MusicSnapshot | null;
  stop(): Promise<void>;
}

/** The caller supplies purpose-scoped delivery. Provider artwork has no remote URL in public state. */
export interface MusicAssetResolver {
  resolveAsset(asset: MediaVersionSnapshot): string | null;
  resolveArtwork(artworkRef: string, snapshot: Pick<MusicSnapshot, "providerId" | "generation">): string | null;
}
