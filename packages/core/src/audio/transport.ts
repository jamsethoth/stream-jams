import { z } from "zod";
import { moduleMuteStateSchema } from "../playback/schemas.js";
import { trustedAudioMediaAssetSchema, privateAudioMediaAssetSchema } from "../assets/desktop-media-asset.js";
import { audioOutputDeviceSchema, audioRouteIdSchema, deviceAudioBatchSchema, deviceAudioResultSchema, explicitAudioDeviceIdSchema } from "./schemas.js";
import type { AudioDeviceHost, DeviceAudioResult } from "./types.js";

export const audioPlayerAssetSchema = trustedAudioMediaAssetSchema;
const audioPayload = <T extends z.ZodType<{ assetId: string }>>(assetSchema: T, mime: (asset: z.infer<T>) => string) => z.object({
  batch: deviceAudioBatchSchema,
  assets: z.array(assetSchema).max(64),
  startDeadlineMs: z.number().int().positive(),
  deadlineMs: z.number().int().positive()
}).strict().refine(({ batch, assets }) => {
  const ids = new Set(batch.layers.map(layer => layer.assetId));
  return new Set(assets.map(asset => asset.assetId)).size === assets.length &&
    assets.every(asset => ids.has(asset.assetId)) &&
    assets.every(asset => batch.layers.filter(layer => layer.assetId === asset.assetId).every(layer =>
      (layer.sourceKind === "video-soundtrack") === mime(asset).startsWith("video/")));
}, "Audio references must be bounded, unique and referenced by this batch")
  .refine(({ batch, deadlineMs, startDeadlineMs }) => batch.timing === undefined || (
    deadlineMs === batch.timing.endsAtEpochMs && startDeadlineMs <= deadlineMs &&
    startDeadlineMs <= batch.timing.startsAtEpochMs + 5000 &&
    batch.durationMs === batch.timing.endsAtEpochMs - batch.timing.startsAtEpochMs
  ), "Audio deadlines must match the shared occurrence timing");

export const audioPlaybackPayloadSchema = audioPayload(trustedAudioMediaAssetSchema, asset => asset.grant.snapshot.mimeType);
export const privateAudioPlaybackPayloadSchema = audioPayload(privateAudioMediaAssetSchema, asset => asset.reference.snapshot.mimeType);
export type PrivateAudioPlaybackPayload = z.infer<typeof privateAudioPlaybackPayloadSchema>;

export const audioTransportCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enumerate") }).strict(),
  z.object({ type: z.literal("prepare"), token: z.uuid(), payload: audioPlaybackPayloadSchema }).strict(),
  z.object({ type: z.literal("start"), token: z.uuid(), startsAtEpochMs: z.number().int().positive(), durationMs: z.number().int().positive().max(3600000) }).strict(),
  z.object({ type: z.literal("play"), payload: audioPlaybackPayloadSchema }).strict(),
  z.object({ type: z.literal("stop"), playbackId: audioRouteIdSchema }).strict(),
  z.object({ type: z.literal("set-muted"), muted: z.boolean() }).strict(),
  z.object({ type: z.literal("set-module-mutes"), moduleMutes: moduleMuteStateSchema }).strict(),
  z.object({ type: z.literal("test"), deviceId: explicitAudioDeviceIdSchema }).strict(),
  z.object({ type: z.literal("retry") }).strict(),
  z.object({ type: z.literal("close") }).strict()
]);
export const audioTransportResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("devices"), devices: z.array(audioOutputDeviceSchema) }).strict(),
  z.object({ type: z.literal("played"), ...deviceAudioResultSchema.shape }).strict(),
  z.object({ type: z.literal("prepared"), token: z.uuid() }).strict(),
  z.object({ type: z.literal("ok") }).strict()
]);
export type AudioPlayerAsset = z.infer<typeof audioPlayerAssetSchema>;
export type AudioPlaybackPayload = z.infer<typeof audioPlaybackPayloadSchema>;
export type AudioTransportCommand = z.infer<typeof audioTransportCommandSchema>;
export type AudioTransportResult = z.infer<typeof audioTransportResultSchema>;
export interface DesktopAudioTransport extends AudioDeviceHost {
  prepare?(payload: AudioPlaybackPayload): Promise<{ start(startsAtEpochMs: number): Promise<DeviceAudioResult> }>;
  play(payload: AudioPlaybackPayload): Promise<DeviceAudioResult>;
  stop(playbackId: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setModuleMutes?(state: import("../playback/types.js").ModuleMuteState): Promise<void>;
  retry(): Promise<void>;
  close(): Promise<void>;
}
