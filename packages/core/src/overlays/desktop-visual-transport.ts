import { z } from "zod";
import { playbackTimingDiagnosticsSchema, type PlaybackTimingDiagnostics } from "../diagnostics/playback-timing-diagnostics.js";
import { desktopOverlayStatusSchema, type DesktopOverlayStatus } from "./desktop-overlay-status.js";
import { trustedVisualMediaAssetSchema, privateVisualMediaAssetSchema } from "../assets/desktop-media-asset.js";
import type { MediaVersionSnapshot } from "../assets/media-reference.js";
import { surfaceConfigurationSchema, type SurfaceConfiguration } from "../overlay-modules/surface-configuration.js";
import { overlayElementLayoutSchema } from "../shared/schemas.js";
import { playbackTimingSchema, type PlaybackTiming } from "./playback-timing.js";
import {
  overlayInstructionSchema, overlayVisualInstructionSchema, overlayTextInstructionSchema,
  overlayShapeInstructionSchema, overlayPresetAnimationInstructionSchema
} from "./schemas.js";
import { visualRecipientKeySchema, type VisualRecipientKey } from "./visual-recipient.js";
import { overlayPlaybackFailureSchema } from "./playback-failure.js";
import { overlayModulePresentationSchema, type OverlayModulePresentation } from "../overlay-modules/presentation.js";

const identity = z.string().min(1).refine(value => value === value.trim());
const layout = overlayElementLayoutSchema.strict();
const musicArtworkRef = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);
export const trustedDesktopMusicArtworkSchema = z.object({
  ref: musicArtworkRef,
  grant: z.object({ handle: z.string().regex(/^mart_[A-Za-z0-9_-]{43}$/), expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict()
}).strict();
export const privateDesktopMusicArtworkSchema = z.object({
  ref: musicArtworkRef,
  handle: z.string().regex(/^private_[A-Za-z0-9_-]{43}$/)
}).strict();
export type TrustedDesktopMusicArtwork = z.infer<typeof trustedDesktopMusicArtworkSchema>;
export type PrivateDesktopMusicArtwork = z.infer<typeof privateDesktopMusicArtworkSchema>;
export function privateDesktopMusicArtworkUrl(artwork: PrivateDesktopMusicArtwork): string {
  return `stream-jams-overlay://surface/music-artwork/${privateDesktopMusicArtworkSchema.parse(artwork).handle}`;
}

export const desktopVisualInstructionSchema = overlayInstructionSchema.extend({
  id: identity,
  moduleId: identity,
  targetProfileId: z.literal("landscape").nullable().optional(),
  audio: z.null(),
  tts: z.null(),
  visual: overlayVisualInstructionSchema.extend({ assetId: identity, layout }).strict().nullable(),
  text: overlayTextInstructionSchema.extend({ layout }).strict().nullable(),
  shape: overlayShapeInstructionSchema.extend({ layout }).strict().nullable().optional(),
  animation: overlayPresetAnimationInstructionSchema.strict().nullable().optional()
}).strict();

export const desktopVisualAssetSchema = trustedVisualMediaAssetSchema;

export function visualMediaType(mimeType: string): "image" | "gif" | "video" {
  return mimeType === "image/gif" ? "gif" : mimeType.startsWith("video/") ? "video" : "image";
}

const visualBatch = <T extends z.ZodType<{ assetId: string }>>(assetSchema: T, mime: (asset: z.infer<T>) => string) => z.object({
  deferredStart: z.boolean().optional(),
  key: visualRecipientKeySchema.extend({ surfaceId: z.literal("desktop:primary") }).strict(),
  timing: playbackTimingSchema,
  instructions: z.array(desktopVisualInstructionSchema).max(64),
  assets: z.array(assetSchema).max(64)
}).strict().superRefine((batch, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (new Set(batch.instructions.map(instruction => instruction.id)).size !== batch.instructions.length) fail("Instruction IDs must be unique");
  const assets = new Map(batch.assets.map(asset => [asset.assetId, asset]));
  if (assets.size !== batch.assets.length) fail("Asset IDs must be unique");
  const referenced = new Set<string>();
  for (const instruction of batch.instructions) {
    if (instruction.timing !== undefined && (instruction.timing.startsAtEpochMs !== batch.timing.startsAtEpochMs || instruction.timing.endsAtEpochMs !== batch.timing.endsAtEpochMs)) fail("Instruction timing must match its occurrence");
    if (instruction.moduleId !== batch.key.moduleId || instruction.durationMs !== batch.timing.endsAtEpochMs - batch.timing.startsAtEpochMs) {
      fail("Instruction identity and duration must match its occurrence");
    }
    if (instruction.visual !== null) {
      referenced.add(instruction.visual.assetId);
      const asset = assets.get(instruction.visual.assetId);
      if (asset === undefined || !/^(image|video)\//.test(mime(asset)) || visualMediaType(mime(asset)) !== instruction.visual.mediaType) fail("Visual asset is missing or has the wrong media kind");
    }
    const fontId = instruction.text?.textStyle?.fontAssetId;
    if (fontId) {
      referenced.add(fontId);
      const asset = assets.get(fontId);
      if (asset === undefined || !mime(asset).startsWith("font/")) fail("Text font asset is missing or incompatible");
    }
  }
  if (batch.assets.some(asset => !referenced.has(asset.assetId))) fail("Unreferenced assets are not authorized");
});

export const desktopVisualBatchSchema = visualBatch(trustedVisualMediaAssetSchema, asset => asset.grant.snapshot.mimeType);
export const privateDesktopVisualBatchSchema = visualBatch(privateVisualMediaAssetSchema, asset => asset.reference.snapshot.mimeType);
export type PrivateDesktopVisualBatch = z.infer<typeof privateDesktopVisualBatchSchema>;
export type DesktopVisualBatch = z.infer<typeof desktopVisualBatchSchema>;
export type DesktopVisualAsset = z.infer<typeof desktopVisualAssetSchema>;
const moduleSync = <T extends z.ZodType<{ assetId: string }>, A extends z.ZodType<{ ref: string }>>(assetSchema: T, artworkSchema: A, mime: (asset: z.infer<T>) => string, version: (asset: z.infer<T>) => string, snapshot: (asset: z.infer<T>) => MediaVersionSnapshot) => z.object({
  moduleId: z.enum(["timers", "music"]),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  presentation: overlayModulePresentationSchema.nullable(),
  assets: z.array(assetSchema).max(64),
  artwork: artworkSchema.nullable().optional()
}).strict().superRefine((sync, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (sync.presentation?.kind === "video-shoutout") {
    fail("Video shoutout presentation is browser-source only");
  } else if (sync.presentation !== null) {
    if (sync.presentation.kind === "timer-stack" && sync.moduleId !== "timers") fail("Timer presentation requires the Timers module");
    if (sync.presentation.kind === "music-widget" && sync.moduleId !== "music") fail("Music presentation requires the Music module");
    const targetProfileId = sync.presentation.kind === "timer-stack" ? sync.presentation.stack.targetProfileId : sync.presentation.widget.targetProfileId;
    if (targetProfileId !== "landscape") fail("Desktop module presentation must target landscape");
  }
  const referenced = new Set<string>();
  const assets = new Map(sync.assets.map(asset => [JSON.stringify([asset.assetId, version(asset)]), asset]));
  if (assets.size !== sync.assets.length) fail("Asset versions must be unique");
  for (const card of sync.presentation?.kind === "timer-stack" ? sync.presentation.stack.cards : []) {
    if (card.iconAssetId === null) continue;
    const asset = card.iconVersion === undefined ? sync.assets.find(asset => asset.assetId === card.iconAssetId) : assets.get(JSON.stringify([card.iconAssetId, card.iconVersion]));
    if (asset === undefined || !mime(asset).startsWith("image/")) fail("Timer icon asset version is missing or has the wrong media kind");
    else referenced.add(JSON.stringify([asset.assetId, version(asset)]));
  }
  if (sync.presentation?.kind === "music-widget") {
    for (const reference of sync.presentation.widget.assets) {
      const asset = assets.get(JSON.stringify([reference.assetId, reference.version]));
      if (asset === undefined || mime(asset) !== reference.mimeType ||
        snapshot(asset).sizeBytes !== reference.sizeBytes || snapshot(asset).durationMs !== reference.durationMs) {
        fail("Music asset snapshot does not match its authorized grant");
      }
      else referenced.add(JSON.stringify([reference.assetId, reference.version]));
    }
  }
  if (sync.artwork !== undefined && sync.artwork !== null) {
    if (sync.moduleId !== "music" || sync.presentation?.kind !== "music-widget" ||
      sync.presentation.widget.snapshot.track?.artworkRef !== sync.artwork.ref) fail("Music artwork grant does not match the current presentation");
  }
  if (sync.presentation === null && sync.artwork != null) fail("Cleared modules cannot retain artwork");
  if (sync.assets.some(asset => !referenced.has(JSON.stringify([asset.assetId, version(asset)])))) fail("Unreferenced assets are not authorized");
});
export const desktopModuleSyncSchema = moduleSync(trustedVisualMediaAssetSchema, trustedDesktopMusicArtworkSchema, asset => asset.grant.snapshot.mimeType, asset => asset.grant.snapshot.version, asset => asset.grant.snapshot);
export const privateDesktopModuleSyncSchema = moduleSync(privateVisualMediaAssetSchema, privateDesktopMusicArtworkSchema, asset => asset.reference.snapshot.mimeType, asset => asset.reference.snapshot.version, asset => asset.reference.snapshot);
export type PrivateDesktopModuleSync = z.infer<typeof privateDesktopModuleSyncSchema>;
export interface DesktopModuleSync {
  readonly moduleId: "timers" | "music";
  readonly revision: number;
  readonly presentation: OverlayModulePresentation | null;
  readonly assets: readonly DesktopVisualAsset[];
  readonly artwork?: TrustedDesktopMusicArtwork | null | undefined;
}
const visualCommands = <B extends z.ZodType, S extends z.ZodRawShape>(batch: B, sync: z.ZodObject<S>) => z.discriminatedUnion("type", [
  z.object({ type: z.literal("status") }).strict(),
  z.object({ type: z.literal("configure"), config: surfaceConfigurationSchema.refine(config => config.kind === "desktop") }).strict(),
  z.object({ type: z.literal("prepare"), batch }).strict(),
  z.object({ type: z.literal("sync-module"), ...sync.shape }).strict().superRefine((value, context) => {
    const candidate = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "type"));
    const result = sync.safeParse(candidate);
    if (!result.success) for (const issue of result.error.issues) context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }),
  z.object({ type: z.literal("start"), key: visualRecipientKeySchema, timing: playbackTimingSchema.optional() }).strict(),
  z.object({ type: z.literal("stop"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("retry") }).strict(),
  z.object({ type: z.literal("close") }).strict()
]);
export const desktopVisualCommandSchema = visualCommands(desktopVisualBatchSchema, desktopModuleSyncSchema);
export const privateDesktopVisualCommandSchema = visualCommands(privateDesktopVisualBatchSchema, privateDesktopModuleSyncSchema);
export type PrivateDesktopVisualCommand = z.infer<typeof privateDesktopVisualCommandSchema>;
export const desktopVisualReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: desktopOverlayStatusSchema }).strict(),
  z.object({ type: z.literal("ready"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("complete"), key: visualRecipientKeySchema, diagnostics: playbackTimingDiagnosticsSchema.optional() }).strict(),
  z.object({ type: z.literal("error"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("ok") }).strict()
]);
export type DesktopVisualCommand =
  | { readonly type: "status" }
  | { readonly type: "configure"; readonly config: Extract<SurfaceConfiguration, { kind: "desktop" }> }
  | { readonly type: "prepare"; readonly batch: DesktopVisualBatch }
  | ({ readonly type: "sync-module" } & DesktopModuleSync)
  | { readonly type: "start"; readonly key: VisualRecipientKey; readonly timing?: PlaybackTiming | undefined }
  | { readonly type: "stop"; readonly key: VisualRecipientKey }
  | { readonly type: "retry" }
  | { readonly type: "close" };
export type DesktopVisualReply = z.infer<typeof desktopVisualReplySchema>;

const rendererEnvelope = { protocolVersion: z.literal(1), generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), requestId: z.uuid() };
export const desktopVisualRendererRequestSchema = z.object({ ...rendererEnvelope, command: privateDesktopVisualCommandSchema }).strict();
export const desktopVisualRendererReplySchema = z.object({ ...rendererEnvelope, result: desktopVisualReplySchema.nullable(), failure: overlayPlaybackFailureSchema.optional() }).strict();
export interface DesktopVisualRendererRequest {
  readonly protocolVersion: 1;
  readonly generation: number;
  readonly requestId: string;
  readonly command: PrivateDesktopVisualCommand;
}
export type DesktopVisualRendererReply = z.infer<typeof desktopVisualRendererReplySchema>;

export interface DesktopOverlayTransport {
  getStatus?(): Promise<DesktopOverlayStatus>;
  configure(config: Extract<SurfaceConfiguration, { kind: "desktop" }>): Promise<void>;
  syncModule(sync: DesktopModuleSync): Promise<void>;
  prepare(batch: DesktopVisualBatch): Promise<"ready" | "unavailable">;
  start(key: VisualRecipientKey, timing?: PlaybackTiming): Promise<void | PlaybackTimingDiagnostics>;
  stop(key: VisualRecipientKey): Promise<void>;
  retry(): Promise<void>;
  close(): Promise<void>;
}
