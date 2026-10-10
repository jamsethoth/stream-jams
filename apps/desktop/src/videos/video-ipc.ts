import { z } from "zod";
import {
  desktopVideoCommandSchema, desktopVideoEventSchema, videoMirrorPublisherSignalSchema, videoMirrorReceiverIdSchema,
  videoMirrorReceiverSignalSchema, videoSourceSchema, videoDeviceDelayMaximumMs
} from "@stream-jams/core/videos";

/* Private transport for the Videos primary player (OpenSpec add-video-request-queue 5.1). */

const generation = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Worker (local service) to main: a player command, or the lease that keeps the player owned. */
export const videoWorkerMessageSchema = z.discriminatedUnion("type", [
  z.object({ generation, requestId: z.null(), type: z.literal("video-command"), command: desktopVideoCommandSchema }).strict(),
  z.object({ generation, requestId: z.null(), type: z.literal("video-lease") }).strict()
]);
/** Main to worker: a report, signal or availability change from the player host. */
export const videoWorkerEventSchema = z.object({ generation, requestId: z.null(), type: z.literal("video-event"), event: desktopVideoEventSchema }).strict();
export type VideoWorkerMessage = z.infer<typeof videoWorkerMessageSchema>;
export type VideoWorkerEvent = z.infer<typeof videoWorkerEventSchema>;

export const VIDEO_PLAYER_COMMAND_CHANNEL = "stream-jams:video-player-command";
export const VIDEO_PLAYER_REPORT_CHANNEL = "stream-jams:video-player-report";
export const VIDEO_DEVICES_COMMAND_CHANNEL = "stream-jams:video-devices-command";
export const VIDEO_DEVICES_REPORT_CHANNEL = "stream-jams:video-devices-report";
export const OVERLAY_VIDEO_SIGNAL_CHANNEL = "stream-jams:overlay-video-signal";
/** The device receiver shares the audio player's session and origin so selected device ids resolve the same way. */
export const VIDEO_DEVICES_URL = "stream-jams-audio://player/video-devices.html";

const itemId = z.string().min(1).max(128);
const position = z.number().int().min(0).max(24 * 60 * 60 * 1000);
const providerUrl = z.string().url().max(4096).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "";
}, "Provider players load only over HTTPS on the default port");

/** Main to the player page. The page never chooses what to play. */
export const videoPlayerCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("load"), itemId, source: videoSourceSchema, url: providerUrl, positionMs: position, paused: z.boolean() }).strict(),
  z.object({ type: z.literal("play"), positionMs: position }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("seek"), positionMs: position }).strict(),
  z.object({ type: z.literal("stop") }).strict(),
  z.object({ type: z.literal("signal"), receiverId: videoMirrorReceiverIdSchema, signal: videoMirrorReceiverSignalSchema }).strict()
]);
export type VideoPlayerCommand = z.infer<typeof videoPlayerCommandSchema>;

/** The player page to main. */
export const videoPlayerReportSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("capture"), ok: z.boolean(), reason: z.string().min(1).max(200).optional() }).strict(),
  z.object({
    type: z.literal("state"), itemId, state: z.enum(["frame-loaded", "started", "progress", "ended", "failed"]),
    positionMs: position.optional(), durationMs: z.number().int().min(1).max(24 * 60 * 60 * 1000).nullable().optional(),
    reason: z.string().min(1).max(200).optional()
  }).strict(),
  z.object({ type: z.literal("signal"), receiverId: videoMirrorReceiverIdSchema, signal: videoMirrorPublisherSignalSchema }).strict()
]);
export type VideoPlayerReport = z.infer<typeof videoPlayerReportSchema>;

const deviceIdSchema = z.string().min(1).max(512).refine(id => id === id.trim() && id !== "default" && id !== "communications");

/** Main to the hidden device-output receiver. */
export const videoDevicesCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("configure"), muted: z.boolean(),
    devices: z.array(z.object({ deviceId: deviceIdSchema, delayMs: z.number().int().min(0).max(videoDeviceDelayMaximumMs) }).strict()).max(8)
  }).strict(),
  z.object({ type: z.literal("signal"), signal: videoMirrorPublisherSignalSchema }).strict()
]);
export type VideoDevicesCommand = z.infer<typeof videoDevicesCommandSchema>;

/** The device-output receiver to main. Device ids are never echoed back. */
export const videoDevicesReportSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("signal"), signal: videoMirrorReceiverSignalSchema }).strict(),
  z.object({ type: z.literal("outputs"), started: z.number().int().min(0).max(8), failed: z.number().int().min(0).max(8) }).strict()
]);
export type VideoDevicesReport = z.infer<typeof videoDevicesReportSchema>;
