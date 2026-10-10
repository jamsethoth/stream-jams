import { z } from "zod";
import type { OverlayPurpose } from "../shared/schemas.js";
import type { VideoControlSupport, VideoSource } from "./types.js";
import { videoSourceSchema } from "./source-schema.js";

/*
 * Desktop mirror contract (OpenSpec add-video-request-queue D5).
 *
 * One primary player per purpose runs in the desktop app and publishes its captured
 * frames and audio over loopback WebRTC. Receivers (module and unified browser sources,
 * the desktop overlay and the desktop device output) exchange offer, answer and ICE
 * messages with it. Browser sources relay these over their overlay WebSocket; desktop
 * receivers relay them inside the desktop app. No STUN or TURN server is ever configured.
 */

/** Loopback-only ICE: no STUN or TURN servers, so only host candidates are gathered. */
export const videoMirrorIceServers: readonly never[] = [];

const maximumSdpLength = 32_768;
/** Each receiver numbers its connection attempts so late messages from an earlier attempt are ignored. */
const connectionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/**
 * Accepts only `typ host` candidates on loopback, private, link-local or mDNS (`.local`)
 * addresses. Server-reflexive, peer-reflexive and relay candidates never cross the relay.
 */
export function isLocalHostIceCandidate(candidate: string): boolean {
  if (candidate === "") return true; // End-of-candidates marker.
  if (candidate.length > 1024) return false;
  const fields = candidate.replace(/^candidate:/u, "").trim().split(/\s+/u);
  // foundation component transport priority address port "typ" type ...
  if (fields.length < 8 || fields[6] !== "typ" || fields[7] !== "host") return false;
  return isLocalAddress((fields[4] ?? "").toLowerCase());
}

function isLocalAddress(address: string): boolean {
  if (/^[0-9a-f-]{36}\.local$/u.test(address) || /^[a-z0-9-]{1,63}\.local$/u.test(address)) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(address);
  if (ipv4 !== null) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if ([a, b, Number(ipv4[3]), Number(ipv4[4])].some(octet => octet > 255)) return false;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return address === "::1" || /^fe[89ab][0-9a-f]:/u.test(address) || /^f[cd][0-9a-f]{2}:/u.test(address);
}

export const videoMirrorIceCandidateSchema = z.object({
  candidate: z.string().max(1024).refine(isLocalHostIceCandidate, "Only local host ICE candidates are allowed"),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional()
}).strict();

const sdpSchema = z.string().min(1).max(maximumSdpLength);

/** What a receiver plays: the device output needs sound only, the desktop overlay the picture only. */
export type VideoMirrorMedia = "audio" | "video" | "both";
/** The largest picture a receiver may declare; anything bigger than the capture is never upscaled. */
export const videoMirrorMaximumWidth = 3840;
export const videoMirrorMaximumHeight = 2160;

/** Messages a receiver sends to the primary player. Pure, so overlays, which only receive, drop it. */
export const videoMirrorReceiverSignalSchema = /* @__PURE__ */ (() => z.discriminatedUnion("type", [
  /*
   * `media` defaults to both. `maxWidth` and `maxHeight` are the device pixels the receiver
   * shows the picture at, so the publisher encodes no more than that.
   */
  z.object({
    type: z.literal("hello"), connection: connectionSchema,
    media: z.enum(["audio", "video", "both"]).optional(),
    maxWidth: z.number().int().min(1).max(videoMirrorMaximumWidth).optional(),
    maxHeight: z.number().int().min(1).max(videoMirrorMaximumHeight).optional()
  }).strict(),
  z.object({ type: z.literal("answer"), connection: connectionSchema, sdp: sdpSchema }).strict(),
  z.object({ type: z.literal("ice"), connection: connectionSchema, candidate: videoMirrorIceCandidateSchema }).strict(),
  z.object({ type: z.literal("bye"), connection: connectionSchema }).strict()
]))();

/** Messages the primary player sends to one receiver. */
export const videoMirrorPublisherSignalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("offer"), connection: connectionSchema, sdp: sdpSchema }).strict(),
  z.object({ type: z.literal("ice"), connection: connectionSchema, candidate: videoMirrorIceCandidateSchema }).strict(),
  /** No capture is running for this purpose yet; the receiver retries with backoff. */
  z.object({ type: z.literal("not-ready"), connection: connectionSchema }).strict()
]);

export type VideoMirrorReceiverSignal = z.infer<typeof videoMirrorReceiverSignalSchema>;
export type VideoMirrorHello = Extract<VideoMirrorReceiverSignal, { type: "hello" }>;
/** What one receiver asks the publisher for. */
export type VideoMirrorRequest = Pick<VideoMirrorHello, "media" | "maxWidth" | "maxHeight">;
export type VideoMirrorPublisherSignal = z.infer<typeof videoMirrorPublisherSignalSchema>;
export type VideoMirrorIceCandidate = z.infer<typeof videoMirrorIceCandidateSchema>;

/** Frame rate of the capture and the cap on every encode. */
export const videoMirrorFrameRate = 30;
/** Bitrate cap for a full 1920 x 1080 encode; smaller encodes get a proportional share. */
export const videoMirrorFullHdBitrate = 6_000_000;
const minimumVideoBitrate = 600_000;

/**
 * Encoding for one receiver's video: scaled down (never up) to the picture size it declared,
 * at the capture frame rate, with a bitrate cap proportional to the encoded area.
 */
export function videoMirrorVideoEncoding(capture: { readonly width: number; readonly height: number }, request: VideoMirrorRequest): {
  readonly scaleResolutionDownBy: number; readonly maxBitrate: number; readonly maxFramerate: number;
} {
  const ratio = (size: number, limit: number | undefined) => limit === undefined || !(size > 0) ? 1 : size / limit;
  // Two decimals, rounded up, so the encode is never larger than the box.
  const scale = Math.max(1, Math.ceil(Math.max(ratio(capture.width, request.maxWidth), ratio(capture.height, request.maxHeight)) * 100) / 100);
  const area = capture.width > 0 && capture.height > 0 ? capture.width * capture.height / (scale * scale) : 1920 * 1080;
  const maxBitrate = Math.round(Math.max(minimumVideoBitrate, Math.min(videoMirrorFullHdBitrate, videoMirrorFullHdBitrate * area / (1920 * 1080))) / 1000) * 1000;
  return { scaleResolutionDownBy: scale, maxBitrate, maxFramerate: videoMirrorFrameRate };
}

/** Overlay WebSocket message type for mirror signaling in both directions. */
export const videoMirrorSignalMessageType = "videos.mirror.signal";

/** Receiver ids are assigned by the relay, never by the receiver, so one output cannot speak for another. */
export const videoMirrorReceiverIdSchema = /* @__PURE__ */ (() => z.string().regex(/^(?:browser|desktop):[A-Za-z0-9_.:-]{1,120}$/u))();

export const videoDeviceDelayMaximumMs = 500;

/** Fields the desktop host IPC schemas share; built on demand so browser routes never construct them. */
function desktopVideoFields() {
  return {
    purposeSchema: z.enum(["live", "test"]),
    itemIdSchema: z.string().min(1).max(128),
    positionSchema: z.number().int().min(0).max(24 * 60 * 60 * 1000)
  };
}

/** Commands from the server's videos runtime to the desktop player host. Pure, so browser routes drop it. */
export const desktopVideoCommandSchema = /* @__PURE__ */ (() => {
  const { purposeSchema, itemIdSchema, positionSchema } = desktopVideoFields();
  const deviceIdSchema = z.string().min(1).max(512).refine(id => id === id.trim() && id !== "default" && id !== "communications");
  return z.discriminatedUnion("type", [
    z.object({ type: z.literal("load"), purpose: purposeSchema, itemId: itemIdSchema, source: videoSourceSchema, positionMs: positionSchema, paused: z.boolean() }).strict(),
    z.object({ type: z.literal("play"), purpose: purposeSchema, itemId: itemIdSchema, positionMs: positionSchema }).strict(),
    z.object({ type: z.literal("pause"), purpose: purposeSchema, itemId: itemIdSchema }).strict(),
    z.object({ type: z.literal("seek"), purpose: purposeSchema, itemId: itemIdSchema, positionMs: positionSchema }).strict(),
    z.object({ type: z.literal("stop"), purpose: purposeSchema }).strict(),
    z.object({
      type: z.literal("set-output"), purpose: purposeSchema, muted: z.boolean(),
      devices: z.array(z.object({ deviceId: deviceIdSchema, delayMs: z.number().int().min(0).max(videoDeviceDelayMaximumMs) }).strict()).max(8)
        .refine(devices => new Set(devices.map(device => device.deviceId)).size === devices.length, "Devices must be unique")
    }).strict(),
    z.object({ type: z.literal("signal"), purpose: purposeSchema, receiverId: videoMirrorReceiverIdSchema, signal: videoMirrorReceiverSignalSchema }).strict()
  ]);
})();

/** Events from the desktop player host back to the server. Pure, so browser routes drop it. */
export const desktopVideoEventSchema = /* @__PURE__ */ (() => {
  const { purposeSchema, itemIdSchema, positionSchema } = desktopVideoFields();
  const controlsSchema = z.object({ pause: z.boolean(), seek: z.boolean() }).strict();
  return z.discriminatedUnion("type", [
    z.object({ type: z.literal("status"), available: z.boolean() }).strict(),
    z.object({
      type: z.literal("report"), purpose: purposeSchema, itemId: itemIdSchema,
      state: z.enum(["started", "progress", "ended", "failed"]),
      positionMs: positionSchema.optional(),
      durationMs: z.number().int().min(1).max(24 * 60 * 60 * 1000).nullable().optional(),
      controls: controlsSchema.optional(),
      reason: z.string().min(1).max(200).optional()
    }).strict(),
    z.object({ type: z.literal("signal"), purpose: purposeSchema, receiverId: videoMirrorReceiverIdSchema, signal: videoMirrorPublisherSignalSchema }).strict()
  ]);
})();

export type DesktopVideoCommand =
  | { readonly type: "load"; readonly purpose: OverlayPurpose; readonly itemId: string; readonly source: VideoSource; readonly positionMs: number; readonly paused: boolean }
  | { readonly type: "play"; readonly purpose: OverlayPurpose; readonly itemId: string; readonly positionMs: number }
  | { readonly type: "pause"; readonly purpose: OverlayPurpose; readonly itemId: string }
  | { readonly type: "seek"; readonly purpose: OverlayPurpose; readonly itemId: string; readonly positionMs: number }
  | { readonly type: "stop"; readonly purpose: OverlayPurpose }
  | { readonly type: "set-output"; readonly purpose: OverlayPurpose; readonly muted: boolean; readonly devices: readonly { readonly deviceId: string; readonly delayMs: number }[] }
  | { readonly type: "signal"; readonly purpose: OverlayPurpose; readonly receiverId: string; readonly signal: VideoMirrorReceiverSignal };

export type DesktopVideoEvent =
  | { readonly type: "status"; readonly available: boolean }
  | {
      readonly type: "report"; readonly purpose: OverlayPurpose; readonly itemId: string;
      readonly state: "started" | "progress" | "ended" | "failed";
      readonly positionMs?: number | undefined;
      readonly durationMs?: number | null | undefined;
      readonly controls?: VideoControlSupport | undefined;
      readonly reason?: string | undefined;
    }
  | { readonly type: "signal"; readonly purpose: OverlayPurpose; readonly receiverId: string; readonly signal: VideoMirrorPublisherSignal };

/**
 * Private transport between the server's videos runtime and the desktop player host.
 * Commands are fire-and-forget; the host answers with reports and signals.
 */
export interface DesktopVideoTransport {
  /** True while the desktop player host is owned and able to play. */
  readonly available: boolean;
  send(command: DesktopVideoCommand): void;
  subscribe(listener: (event: DesktopVideoEvent) => void): () => void;
}

/** Fields of a YouTube iframe API message that Stream Jams uses; anything else is ignored. */
export interface YouTubePlayerMessage {
  readonly playerState: number | null;
  readonly currentTime: number | null;
  /** Present only when the message carried a usable duration. */
  readonly duration?: number;
}

/** Reads a YouTube `enablejsapi=1` postMessage (`onStateChange` or `infoDelivery`); returns null for anything else. */
export function parseYouTubeMessage(data: string): YouTubePlayerMessage | null {
  let parsed: unknown;
  try { parsed = JSON.parse(data); }
  // error-provenance: allow expected -- unrelated or malformed provider messages are ignored by design
  catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as { readonly event?: unknown; readonly info?: unknown };
  if (message.event === "onStateChange" && typeof message.info === "number") return { playerState: message.info, currentTime: null };
  if (message.event !== "infoDelivery" || typeof message.info !== "object" || message.info === null) return null;
  const info = message.info as { readonly playerState?: unknown; readonly currentTime?: unknown; readonly duration?: unknown };
  return {
    playerState: typeof info.playerState === "number" ? info.playerState : null,
    currentTime: typeof info.currentTime === "number" && Number.isFinite(info.currentTime) ? info.currentTime : null,
    ...(typeof info.duration === "number" && Number.isFinite(info.duration) && info.duration > 0 ? { duration: info.duration } : {})
  };
}
