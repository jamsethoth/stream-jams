import { z } from "zod";
import { videoMirrorPublisherSignalSchema, videoMirrorReceiverSignalSchema } from "@stream-jams/core/videos";
import { sceneHeight, sceneWidth } from "./frame-layout.js";

/*
 * Boundary contracts for the camera effects check (BL-068 feasibility gate). Everything the
 * pages send to the check's main process is parsed here; the pages are diagnostic tooling
 * served on 127.0.0.1 behind a per-run token, but they still never get to shape the results
 * or the windows with unchecked input.
 */

/**
 * Why the check cannot run on this PC, or null when Chromium has the GPU. Effects and
 * tracking must not fall back to software rendering, so anything short of hardware WebGL
 * and GPU compositing blocks the check. (Electron reports WebGL2 under `webgl`; the page
 * also checks its real WebGL2 renderer with `isSoftwareRenderer`.)
 */
export function gpuBlockReason(featureStatus: Readonly<Record<string, string>>): string | null {
  const missing = ["webgl", "gpu_compositing"].filter(feature => !(featureStatus[feature] ?? "").startsWith("enabled"));
  return missing.length === 0 ? null
    : `GPU acceleration is not available (${missing.map(feature => `${feature}: ${featureStatus[feature] ?? "unknown"}`).join(", ")}). The camera check does not run in software.`;
}

/** True for WebGL renderers that are software, never a real GPU. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|basic render|software/iu.test(renderer);
}

export const receiverIdSchema = z.string().regex(/^(?:obs|desktop|browser)-[a-z0-9]{6,16}$/u);
export type ReceiverId = z.infer<typeof receiverIdSchema>;

/** A receiver's signal to the pipeline, tagged with who sent it. */
export const publisherEnvelopeSchema = z.object({ receiverId: receiverIdSchema, signal: videoMirrorReceiverSignalSchema }).strict();
/** The pipeline's signal to one receiver. */
export const receiverEnvelopeSchema = videoMirrorPublisherSignalSchema;

const label = z.string().max(200);
const deviceId = z.string().min(1).max(256);
const ms = z.number().min(0).max(600_000).nullable();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rate = z.number().min(0).max(1000).nullable();
const size = z.number().int().min(0).max(8192);

/** "none" passes the camera's own alpha through untouched, which is how the Broadcast question is answered. */
export const matteModes = ["none", "key", "segmenter"] as const;
export const codecPreferences = ["default", "H264", "VP9", "AV1", "VP8"] as const;

/** What the pipeline applies; every field is set from the control page. */
export const pipelineSettingsSchema = z.object({
  mirror: z.boolean(),
  matte: z.enum(matteModes),
  keyColor: z.string().regex(/^#[0-9a-f]{6}$/iu),
  keyTolerance: z.number().min(0).max(1),
  tracking: z.boolean(),
  eyeBulge: z.boolean(),
  glitch: z.boolean(),
  bigEyes: z.boolean(),
  pack: z.boolean(),
  codec: z.enum(codecPreferences)
}).strict();
export type PipelineSettings = z.infer<typeof pipelineSettingsSchema>;

export const defaultPipelineSettings: PipelineSettings = {
  mirror: false, matte: "none", keyColor: "#00ff00", keyTolerance: 0.25, tracking: true,
  eyeBulge: false, glitch: false, bigEyes: false, pack: false, codec: "H264"
};

/** Where receivers place the camera on the 1920 x 1080 scene. Changing it never reconnects. */
export const layoutSchema = z.object({
  x: z.number().int().min(-sceneWidth).max(sceneWidth),
  y: z.number().int().min(-sceneHeight).max(sceneHeight),
  width: z.number().int().min(16).max(sceneWidth * 2),
  height: z.number().int().min(16).max(sceneHeight * 2)
}).strict();
export type Layout = z.infer<typeof layoutSchema>;

export const scenarios = ["idle", "game"] as const;

/** Control page to main. */
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list-cameras") }).strict(),
  z.object({ action: z.literal("probe"), deviceId }).strict(),
  z.object({ action: z.literal("open"), deviceId, width: size, height: size, frameRate: z.number().min(1).max(60) }).strict(),
  z.object({ action: z.literal("configure"), settings: pipelineSettingsSchema }).strict(),
  z.object({ action: z.literal("layout"), layout: layoutSchema }).strict(),
  z.object({ action: z.literal("scenario"), scenario: z.enum(scenarios), game: z.string().max(120) }).strict(),
  z.object({ action: z.literal("show-pipeline"), visible: z.boolean() }).strict(),
  z.object({ action: z.literal("open-desktop-receiver") }).strict(),
  z.object({ action: z.literal("close-desktop-receiver") }).strict(),
  z.object({ action: z.literal("open-barcode-screen") }).strict()
]);
export type Command = z.infer<typeof commandSchema>;

/** Results the pipeline page returns to main for list, probe and open. */
export const cameraListSchema = z.array(z.object({ deviceId, label }).strict()).max(32);
export const probeResultSchema = z.object({
  label,
  capabilities: z.object({
    width: z.object({ min: z.number(), max: z.number() }).partial().strict().optional(),
    height: z.object({ min: z.number(), max: z.number() }).partial().strict().optional(),
    frameRate: z.object({ min: z.number(), max: z.number() }).partial().strict().optional()
  }).strict(),
  presets: z.array(z.object({
    id: z.string().max(16), advertised: z.boolean(), native: z.boolean().nullable(),
    actual: z.object({ width: size, height: size, frameRate: rate }).strict().nullable(),
    error: z.string().max(200).nullable()
  }).strict()).max(8)
}).strict();
export type ProbeResult = z.infer<typeof probeResultSchema>;
export const openResultSchema = z.object({
  ok: z.boolean(), label, width: size, height: size, frameRate: rate,
  /** Whether any camera pixel arrived with alpha below opaque: the NVIDIA Broadcast question. */
  alphaSurvives: z.boolean().nullable(),
  error: z.string().max(200).nullable()
}).strict();
export type OpenResult = z.infer<typeof openResultSchema>;

const timing = z.object({ medianMs: ms, p95Ms: ms, maxMs: ms }).strict();
const pair = z.object({ local: z.string().max(64).nullable(), remote: z.string().max(64).nullable(), rttMs: ms }).strict().nullable();
const delay = z.object({ medianMs: ms, maxMs: ms, samples: count }).strict();

export const pipelineStatsSchema = z.object({
  cameraFps: rate, processedFps: rate, processedFrames: count, skippedFrames: count,
  /** Whether camera pixels still arrive with alpha below opaque (sampled every report). */
  cameraAlpha: z.boolean().nullable(),
  frameMs: timing, tracking: timing.extend({ facePercent: rate, blendshapes: count, delegate: z.enum(["GPU", "CPU"]).nullable() }).strict(),
  /** Mask count shows which output is the person; personPercent is the share of the picture the matte keeps. */
  segmentation: timing.extend({ masks: count, personPercent: rate }).strict().nullable(), output: z.object({ width: size, height: size }).strict(),
  webgl: z.object({ renderer: label, software: z.boolean() }).strict(),
  settings: pipelineSettingsSchema
}).strict();

export const publisherStatsSchema = z.array(z.object({
  receiver: receiverIdSchema, state: z.string().max(32), pair, fps: rate, width: size.nullable(), height: size.nullable(),
  codec: z.string().max(64).nullable(), encoder: z.string().max(120).nullable(), powerEfficient: z.boolean().nullable(),
  encodeMsPerFrame: ms, qualityLimitation: z.string().max(32).nullable(), scale: z.string().max(80)
}).strict()).max(16);

export const receiverStatsSchema = z.object({
  receiver: receiverIdSchema, userAgent: z.enum(["obs", "electron", "browser"]), state: z.string().max(32), pair,
  fps: rate, presentedFps: rate, width: size, height: size, packed: z.boolean(), framesDropped: count.nullable(),
  decoder: z.string().max(120).nullable(), powerEfficientDecoder: z.boolean().nullable(),
  outputDelay: delay, glassDelay: delay, reconnects: count
}).strict();

/** Page to main, through POST /report. */
export const reportSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pipeline-stats"), data: pipelineStatsSchema }).strict(),
  z.object({ kind: z.literal("publisher-stats"), data: publisherStatsSchema }).strict(),
  z.object({ kind: z.literal("receiver-stats"), data: receiverStatsSchema }).strict(),
  z.object({ kind: z.literal("error"), data: z.object({ role: z.string().max(32), message: z.string().max(500) }).strict() }).strict(),
  z.object({ kind: z.literal("manual"), data: z.record(z.string().regex(/^[A-Za-z]{1,32}$/u), z.union([z.boolean(), z.string().max(1000)])) }).strict()
]);
export type Report = z.infer<typeof reportSchema>;

/** What receivers poll: the current camera format and layout. */
export interface ReceiverState {
  readonly camera: { readonly width: number; readonly height: number } | null;
  readonly packed: boolean;
  readonly layout: Layout;
}
