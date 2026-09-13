import { z } from "zod";
import { desktopOverlayStatusSchema, type DesktopOverlayStatus } from "./desktop-overlay-status.js";
import { defaultAssetValidationPolicy } from "../assets/asset-validator.js";
import { surfaceConfigurationSchema, type SurfaceConfiguration } from "../overlay-modules/surface-configuration.js";
import { overlayElementLayoutSchema } from "../shared/schemas.js";
import { playbackTimingSchema } from "./playback-timing.js";
import {
  overlayInstructionSchema, overlayVisualInstructionSchema, overlayTextInstructionSchema,
  overlayShapeInstructionSchema, overlayPresetAnimationInstructionSchema
} from "./schemas.js";
import { visualRecipientKeySchema, type VisualRecipientKey } from "./visual-recipient.js";

export const maxDesktopVisualTransferBytes = 128 * 1024 * 1024;
const identity = z.string().min(1).refine(value => value === value.trim());
const layout = overlayElementLayoutSchema.strict();
const mimeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"] as const;

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

export const desktopVisualAssetSchema = z.object({
  assetId: identity,
  mimeType: z.enum(mimeTypes),
  bytes: z.instanceof(Uint8Array)
}).strict().refine(asset => asset.bytes.buffer instanceof ArrayBuffer && asset.bytes.byteOffset === 0 &&
  asset.bytes.byteLength === asset.bytes.buffer.byteLength, "Visual bytes require a dedicated exact-length buffer")
  .refine(asset => asset.bytes.byteLength > 0 && asset.bytes.byteLength <=
  defaultAssetValidationPolicy[visualMediaType(asset.mimeType)].maxSizeBytes, "Invalid visual asset byte length");

export function visualMediaType(mimeType: typeof mimeTypes[number]): "image" | "gif" | "video" {
  return mimeType === "image/gif" ? "gif" : mimeType.startsWith("video/") ? "video" : "image";
}

export const desktopVisualBatchSchema = z.object({
  key: visualRecipientKeySchema.extend({ surfaceId: z.literal("desktop:primary") }).strict(),
  timing: playbackTimingSchema,
  instructions: z.array(desktopVisualInstructionSchema),
  assets: z.array(desktopVisualAssetSchema)
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
      if (asset === undefined || visualMediaType(asset.mimeType) !== instruction.visual.mediaType) fail("Visual asset is missing or has the wrong media kind");
    }
  }
  if (batch.assets.some(asset => !referenced.has(asset.assetId))) fail("Unreferenced assets are not authorized");
  if (batch.assets.reduce((total, asset) => total + asset.bytes.byteLength, 0) > maxDesktopVisualTransferBytes) fail("Desktop transfer budget exceeded");
});

export type DesktopVisualBatch = z.infer<typeof desktopVisualBatchSchema>;
export type DesktopVisualAsset = z.infer<typeof desktopVisualAssetSchema>;
export const desktopVisualCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status") }).strict(),
  z.object({ type: z.literal("configure"), config: surfaceConfigurationSchema.refine(config => config.kind === "desktop") }).strict(),
  z.object({ type: z.literal("prepare"), batch: desktopVisualBatchSchema }).strict(),
  z.object({ type: z.literal("start"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("stop"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("retry") }).strict(),
  z.object({ type: z.literal("close") }).strict()
]);
export const desktopVisualReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: desktopOverlayStatusSchema }).strict(),
  z.object({ type: z.literal("ready"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("complete"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("error"), key: visualRecipientKeySchema }).strict(),
  z.object({ type: z.literal("ok") }).strict()
]);
export type DesktopVisualCommand = z.infer<typeof desktopVisualCommandSchema>;
export type DesktopVisualReply = z.infer<typeof desktopVisualReplySchema>;

const rendererEnvelope = { generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), requestId: z.uuid() };
export const desktopVisualRendererRequestSchema = z.object({ ...rendererEnvelope, command: desktopVisualCommandSchema }).strict();
export const desktopVisualRendererReplySchema = z.object({ ...rendererEnvelope, result: desktopVisualReplySchema.nullable() }).strict();
export type DesktopVisualRendererRequest = z.infer<typeof desktopVisualRendererRequestSchema>;
export type DesktopVisualRendererReply = z.infer<typeof desktopVisualRendererReplySchema>;

export interface DesktopOverlayTransport {
  getStatus?(): Promise<DesktopOverlayStatus>;
  configure(config: Extract<SurfaceConfiguration, { kind: "desktop" }>): Promise<void>;
  prepare(batch: DesktopVisualBatch): Promise<"ready" | "unavailable">;
  start(key: VisualRecipientKey): Promise<void>;
  stop(key: VisualRecipientKey): Promise<void>;
  retry(): Promise<void>;
  close(): Promise<void>;
}
