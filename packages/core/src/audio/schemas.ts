import { z } from "zod";
import type { AlertAudioOutputs, AudioOutputDevice, AudioOutputRoute, DeviceAudioBatch, DeviceAudioResult, ResolvedAlertAudio } from "./types.js";

export const audioRouteIdSchema = z.string().min(1).refine(value => value.trim() === value, "IDs must not contain surrounding whitespace");
export const explicitAudioDeviceIdSchema = audioRouteIdSchema.refine(
  id => id !== "default" && id !== "communications",
  "Choose an explicit output device, not a default or communications alias"
);
export const alertAudioOutputsSchema = z.object({
  browserSource: z.boolean(),
  deviceRouteIds: z.array(audioRouteIdSchema).refine(ids => new Set(ids).size === ids.length, "Choose each route only once")
}).strict().default(() => ({ browserSource: true, deviceRouteIds: [] })) satisfies z.ZodType<AlertAudioOutputs>;

export const audioOutputDeviceSchema = z.object({
  deviceId: explicitAudioDeviceIdSchema,
  label: z.string().trim().min(1)
}).strict() satisfies z.ZodType<AudioOutputDevice>;

export const audioOutputRouteSchema = z.object({
  id: audioRouteIdSchema,
  name: z.string().trim().min(1),
  deviceId: explicitAudioDeviceIdSchema.nullable(),
  deviceLabel: z.string().trim().min(1).nullable()
}).strict().refine(route => (route.deviceId === null) === (route.deviceLabel === null), "Device ID and label must both be set or both be null") satisfies z.ZodType<AudioOutputRoute>;

export const audioOutputRouteCreateSchema = z.object({
  name: z.string().trim().min(1),
  deviceId: explicitAudioDeviceIdSchema.nullable().default(null)
}).strict();

export const audioOutputRoutePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  deviceId: explicitAudioDeviceIdSchema.nullable().optional(),
  confirmLiveImpact: z.boolean().default(false)
}).strict().refine(patch => patch.name !== undefined || patch.deviceId !== undefined, "Choose a name or device binding to change");

export const audioOutputRouteTestSchema = z.object({}).strict().default({});
const uniqueIds = z.array(audioRouteIdSchema).refine(ids => new Set(ids).size === ids.length, "IDs must be unique");
export const resolvedAudioLayerSchema = z.object({
  layerId: audioRouteIdSchema,
  assetId: audioRouteIdSchema,
  volume: z.number().min(0).max(1)
}).strict();
const audioLayersSchema = z.array(resolvedAudioLayerSchema).refine(layers => new Set(layers.map(layer => layer.layerId)).size === layers.length, "Layer IDs must be unique");
export const resolvedAlertAudioSchema = z.object({
  documentId: audioRouteIdSchema,
  durationMs: z.number().int().min(1).max(120_000),
  outputs: alertAudioOutputsSchema,
  layers: audioLayersSchema
}).strict() satisfies z.ZodType<ResolvedAlertAudio>;
export const audioDestinationSchema = z.object({
  deviceId: explicitAudioDeviceIdSchema,
  routeIds: uniqueIds.refine(ids => ids.length > 0, "Choose at least one route")
}).strict();
export const deviceAudioBatchSchema = z.object({
  playbackId: audioRouteIdSchema,
  documentId: audioRouteIdSchema,
  durationMs: z.number().int().min(1).max(120_000),
  muted: z.boolean(),
  layers: audioLayersSchema,
  destinations: z.array(audioDestinationSchema).refine(destinations => {
    const routeIds = destinations.flatMap(destination => destination.routeIds);
    return new Set(destinations.map(destination => destination.deviceId)).size === destinations.length && new Set(routeIds).size === routeIds.length;
  }, "Each device and route must occur once")
}).strict() satisfies z.ZodType<DeviceAudioBatch>;
export const deviceAudioResultSchema = z.object({ failedRouteIds: uniqueIds }).strict() satisfies z.ZodType<DeviceAudioResult>;

export const audioDeviceCapabilitySchema = z.object({
  available: z.boolean(),
  devices: z.array(audioOutputDeviceSchema),
  reason: z.enum(["desktop-unavailable", "enumeration-failed"]).nullable(),
  nextStep: z.string().nullable()
}).strict();
export const audioRouteStatusSchema = z.object({
  route: audioOutputRouteSchema,
  state: z.enum(["ready", "unbound", "missing-device", "unavailable"])
}).strict();
export const audioOutputStatusSchema = z.object({
  capability: audioDeviceCapabilitySchema,
  muted: z.boolean(),
  routes: z.array(audioRouteStatusSchema)
}).strict();

export type AudioDeviceCapability = z.infer<typeof audioDeviceCapabilitySchema>;
export type AudioRouteStatus = z.infer<typeof audioRouteStatusSchema>;
export type AudioOutputStatus = z.infer<typeof audioOutputStatusSchema>;
