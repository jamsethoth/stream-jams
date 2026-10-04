import { z } from "zod";
import { moduleMuteStateSchema } from "@stream-jams/core";
import { privateAudioPlaybackPayloadSchema, audioRouteIdSchema, audioTransportResultSchema, serializedExceptionSchema } from "@stream-jams/core";

export const AUDIO_COMMAND_CHANNEL = "stream-jams:audio-command";
export const AUDIO_REPLY_CHANNEL = "stream-jams:audio-reply";
const envelope = { protocolVersion: z.literal(1), generation: z.number().int().positive(), requestId: z.uuid() };
export const audioRendererRequestSchema = z.object({ ...envelope, command: z.discriminatedUnion("type", [
  z.object({ type: z.literal("initialize"), protocolVersion: z.literal(1), muted: z.boolean(), moduleMutes: moduleMuteStateSchema.optional() }).strict(),
  z.object({ type: z.literal("test"), deviceId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("enumerate") }).strict(),
  z.object({ type: z.literal("prepare"), token: z.uuid(), payload: privateAudioPlaybackPayloadSchema }).strict(),
  z.object({ type: z.literal("start"), token: z.uuid(), startsAtEpochMs: z.number().int().positive(), durationMs: z.number().int().positive().max(3600000) }).strict(),
  z.object({ type: z.literal("play"), payload: privateAudioPlaybackPayloadSchema }).strict(),
  z.object({ type: z.literal("stop"), playbackId: audioRouteIdSchema }).strict(),
  z.object({ type: z.literal("set-muted"), muted: z.boolean() }).strict(),
  z.object({ type: z.literal("set-module-mutes"), moduleMutes: moduleMuteStateSchema }).strict()
]) }).strict();
export const audioRendererReplySchema = z.object({ ...envelope, result: audioTransportResultSchema.nullable(), exception: serializedExceptionSchema.optional() }).strict();
export type AudioRendererRequest = z.infer<typeof audioRendererRequestSchema>;
export type AudioRendererReply = z.infer<typeof audioRendererReplySchema>;
