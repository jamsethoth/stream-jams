import { z } from "zod";
import { audioOutputDeviceSchema, audioRouteIdSchema, deviceAudioBatchSchema, deviceAudioResultSchema, explicitAudioDeviceIdSchema } from "./schemas.js";
import type { AudioDeviceHost, DeviceAudioResult } from "./types.js";

export const maxAudioTransportAssetBytes = 25 * 1024 * 1024;
export const maxAudioTransportBatchBytes = 100 * 1024 * 1024;
export const audioPlayerAssetSchema = z.object({
  assetId: audioRouteIdSchema,
  mimeType: z.enum(["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "video/webm", "video/mp4"]),
  bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= maxAudioTransportAssetBytes)
}).strict();
export const audioPlaybackPayloadSchema = z.object({
  batch: deviceAudioBatchSchema,
  assets: z.array(audioPlayerAssetSchema),
  startDeadlineMs: z.number().int().positive(),
  deadlineMs: z.number().int().positive()
}).strict().refine(({ batch, assets }) => {
  const ids = new Set(batch.layers.map(layer => layer.assetId));
  return new Set(assets.map(asset => asset.assetId)).size === assets.length &&
    assets.every(asset => ids.has(asset.assetId)) &&
    assets.every(asset => batch.layers.filter(layer => layer.assetId === asset.assetId).every(layer =>
      (layer.sourceKind === "video-soundtrack") === asset.mimeType.startsWith("video/"))) &&
    assets.reduce((size, asset) => size + asset.bytes.byteLength, 0) <= maxAudioTransportBatchBytes;
}, "Audio bytes must be bounded, unique and referenced by this batch")
  .refine(({ batch, deadlineMs, startDeadlineMs }) => batch.timing === undefined || (
    deadlineMs === batch.timing.endsAtEpochMs && startDeadlineMs <= deadlineMs &&
    startDeadlineMs <= batch.timing.startsAtEpochMs + 5000 &&
    batch.durationMs === batch.timing.endsAtEpochMs - batch.timing.startsAtEpochMs
  ), "Audio deadlines must match the shared occurrence timing");

export const audioTransportCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enumerate") }).strict(),
  z.object({ type: z.literal("play"), payload: audioPlaybackPayloadSchema }).strict(),
  z.object({ type: z.literal("stop"), playbackId: audioRouteIdSchema }).strict(),
  z.object({ type: z.literal("set-muted"), muted: z.boolean() }).strict(),
  z.object({ type: z.literal("test"), deviceId: explicitAudioDeviceIdSchema }).strict(),
  z.object({ type: z.literal("retry") }).strict(),
  z.object({ type: z.literal("close") }).strict()
]);
export const audioTransportResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("devices"), devices: z.array(audioOutputDeviceSchema) }).strict(),
  z.object({ type: z.literal("played"), ...deviceAudioResultSchema.shape }).strict(),
  z.object({ type: z.literal("ok") }).strict()
]);
export type AudioPlayerAsset = z.infer<typeof audioPlayerAssetSchema>;
export type AudioPlaybackPayload = z.infer<typeof audioPlaybackPayloadSchema>;
export type AudioTransportCommand = z.infer<typeof audioTransportCommandSchema>;
export type AudioTransportResult = z.infer<typeof audioTransportResultSchema>;
export interface DesktopAudioTransport extends AudioDeviceHost {
  play(payload: AudioPlaybackPayload): Promise<DeviceAudioResult>;
  stop(playbackId: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  retry(): Promise<void>;
  close(): Promise<void>;
}
