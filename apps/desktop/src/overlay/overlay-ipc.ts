import { z } from "zod";
import { desktopVisualCommandSchema, desktopVisualReplySchema,
  desktopVisualRendererRequestSchema, desktopVisualRendererReplySchema } from "@stream-jams/core";

export const OVERLAY_COMMAND_CHANNEL = "stream-jams:overlay-command";
export const OVERLAY_REPLY_CHANNEL = "stream-jams:overlay-reply";
const envelope = { generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), requestId: z.uuid() };
export const overlayRendererRequestSchema = desktopVisualRendererRequestSchema;
export const overlayRendererReplySchema = desktopVisualRendererReplySchema;
export const overlayWorkerMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("overlay-request"), command: desktopVisualCommandSchema }).strict(),
  z.object({ generation: envelope.generation, requestId: z.null(), type: z.literal("overlay-lease") }).strict()
]);
export const overlayWorkerResponseSchema = z.object({ ...envelope, type: z.literal("overlay-response"), result: desktopVisualReplySchema.nullable() }).strict();
export type OverlayRendererRequest = z.infer<typeof overlayRendererRequestSchema>;
export type OverlayRendererReply = z.infer<typeof overlayRendererReplySchema>;
export type OverlayWorkerMessage = z.infer<typeof overlayWorkerMessageSchema>;
export type OverlayWorkerResponse = z.infer<typeof overlayWorkerResponseSchema>;
