import { z } from "zod";
import { audioTransportCommandSchema, audioTransportResultSchema } from "@stream-jams/core";
import { overlayWorkerMessageSchema, overlayWorkerResponseSchema } from "./overlay/overlay-ipc.js";

const envelope = { generation: z.number().int().positive(), requestId: z.uuid().nullable() };
const url = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && parsed.port !== "" &&
    parsed.pathname === "/" && !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
});
export const workerRequestSchema = z.discriminatedUnion("type", [
  overlayWorkerResponseSchema,
  z.object({ ...envelope, requestId: z.uuid(), type: z.literal("audio-response"), result: audioTransportResultSchema.nullable() }).strict(),
  z.object({ ...envelope, requestId: z.uuid(), type: z.literal("start") }).strict(),
  z.object({ ...envelope, requestId: z.uuid(), type: z.literal("stop") }).strict(),
  z.object({ ...envelope, requestId: z.uuid(), type: z.literal("set-muted"), muted: z.boolean() }).strict()
]);
export const workerMessageSchema = z.discriminatedUnion("type", [
  ...overlayWorkerMessageSchema.options,
  z.object({ ...envelope, requestId: z.uuid(), type: z.literal("audio-request"), command: audioTransportCommandSchema }).strict(),
  z.object({ ...envelope, requestId: z.null(), type: z.literal("audio-lease") }).strict(),
  z.object({ ...envelope, type: z.literal("ready"), url, closeToTray: z.boolean(), muted: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal("failed"), message: z.string().min(1).max(500) }).strict(),
  z.object({ ...envelope, type: z.literal("command-failed"), message: z.string().min(1).max(500) }).strict(),
  z.object({ ...envelope, type: z.literal("stopped") }).strict(),
  z.object({ ...envelope, type: z.literal("desktop-config-changed"), closeToTray: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal("playback-state-changed"), muted: z.boolean() }).strict()
]);
export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export type WorkerMessage = z.infer<typeof workerMessageSchema>;
export const quitReplySchema = z.object({ requestId: z.uuid(), allow: z.boolean() }).strict();
