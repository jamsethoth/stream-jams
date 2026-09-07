import { z } from "zod";
import { audioPlaybackPayloadSchema, audioRouteIdSchema, audioTransportResultSchema } from "@stream-jams/core";

export const AUDIO_COMMAND_CHANNEL = "stream-jams:audio-command";
export const AUDIO_REPLY_CHANNEL = "stream-jams:audio-reply";
const envelope = { generation: z.number().int().positive(), requestId: z.uuid() };
export const audioRendererRequestSchema = z.object({ ...envelope, command: z.discriminatedUnion("type", [
  z.object({ type: z.literal("initialize"), muted: z.boolean() }).strict(),
  z.object({ type: z.literal("enumerate") }).strict(),
  z.object({ type: z.literal("play"), payload: audioPlaybackPayloadSchema }).strict(),
  z.object({ type: z.literal("stop"), playbackId: audioRouteIdSchema }).strict(),
  z.object({ type: z.literal("set-muted"), muted: z.boolean() }).strict()
]) }).strict();
export const audioRendererReplySchema = z.object({ ...envelope, result: audioTransportResultSchema.nullable() }).strict();
export type AudioRendererRequest = z.infer<typeof audioRendererRequestSchema>;
export type AudioRendererReply = z.infer<typeof audioRendererReplySchema>;
