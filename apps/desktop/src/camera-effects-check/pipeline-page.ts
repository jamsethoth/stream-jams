import { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import {
  Application, CanvasSource, ColorMatrixFilter, Container, defaultFilterVert, Filter, GlProgram, Graphics, Mesh, PlaneGeometry,
  Rectangle, RenderTexture, Sprite, Texture, VideoSource, type WebGLRenderer
} from "pixi.js";
import { BulgePinchFilter, GlitchFilter } from "pixi-filters";
import {
  isLocalHostIceCandidate, videoMirrorIceServers, videoMirrorVideoEncoding, type VideoMirrorHello, type VideoMirrorReceiverSignal
} from "@stream-jams/core/videos";
import {
  defaultPipelineSettings, isSoftwareRenderer, type OpenResult, type PipelineSettings, type ProbeResult, type ReceiverId
} from "./check-protocol.js";
import { advertisedPresets, exactConstraints, formatPresets } from "./formats.js";
import { AnchorSmoother, bigEyesVertex, eyeRadius, faceAnchors, type FaceAnchors } from "./face-anchors.js";
import { frameLayout, type FrameLayout } from "./frame-layout.js";
import { base, listen, pairSummary, pushBounded, report, reportError, signal, timing } from "./page-api.js";
import { encodeTimestampBits } from "../video-mirror-check/timestamp-barcode.js";

/*
 * The camera effects check pipeline (BL-068 feasibility gate): camera -> matte (key colour
 * or MediaPipe segmentation) -> Face Landmarker -> PixiJS effects -> one canvas stream,
 * published over loopback WebRTC to every receiver. The product would run this in a hidden
 * window; the check shows it so the operator can compare the camera and the result.
 */

declare global {
  interface Window {
    cameraCheckReady?: Promise<{ renderer: string; software: boolean }>;
    cameraCheck?: {
      list(): Promise<{ deviceId: string; label: string }[]>;
      probe(deviceId: string): Promise<ProbeResult>;
      open(deviceId: string, width: number, height: number, frameRate: number): Promise<OpenResult>;
      configure(settings: PipelineSettings): void;
    };
  }
}

const video = document.getElementById("camera") as HTMLVideoElement;
const output = document.getElementById("output") as HTMLCanvasElement;
const trackingWidth = 640;
const meshColumns = 96;
const meshRows = 54;
const holdMs = 500;
const fadeMs = 500;
const maximumConnections = 16;

let settings: PipelineSettings = defaultPipelineSettings;
let cameraStream: MediaStream | null = null;
let cameraLabel = "";
let layout: FrameLayout = frameLayout(1280, 720, false);

/* GPU and renderer. */

const app = new Application();
const fileset: Parameters<typeof FaceLandmarker.createFromOptions>[0] = { wasmLoaderPath: `${base}/app/mediapipe/vision_wasm_internal.js`, wasmBinaryPath: `${base}/app/mediapipe/vision_wasm_internal.wasm` };
let landmarker: FaceLandmarker | null = null;
let delegate: "GPU" | "CPU" | null = null;
let segmenter: Promise<ImageSegmenter> | null = null;
let rendererName = "unknown";

async function createLandmarker(): Promise<FaceLandmarker> {
  const options = (chosen: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: `${base}/app/mediapipe/face_landmarker.task`, delegate: chosen },
    runningMode: "VIDEO" as const, numFaces: 1, outputFaceBlendshapes: true
  });
  try {
    const created = await FaceLandmarker.createFromOptions(fileset, options("GPU"));
    delegate = "GPU";
    return created;
  } catch (error) {
    // Reported, so the results show tracking ran on the CPU and why.
    reportError("landmarker-gpu", error);
    delegate = "CPU";
    return FaceLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

/* Stage 1: matte. Keys first so later warps move the person and the matte together. */

const matteFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uMode;
uniform vec3 uKey;
uniform float uTolerance;
vec2 chroma(vec3 c) { return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b); }
void main() {
  vec4 color = texture(uTexture, vTextureCoord);
  float alpha = 1.0;
  if (uMode > 1.5) {
    alpha = texture(uMask, vTextureCoord * uInputSize.xy / uOutputFrame.zw).r;
  } else if (uMode > 0.5) {
    vec3 rgb = color.a > 0.0 ? color.rgb / color.a : color.rgb;
    float distance = length(chroma(rgb) - chroma(uKey));
    alpha = smoothstep(uTolerance * 0.5, uTolerance * 0.5 + 0.06, distance);
  }
  finalColor = color * alpha;
}`;

const maskCanvas = document.createElement("canvas");
maskCanvas.width = 2; maskCanvas.height = 2;
const maskSource = new CanvasSource({ resource: maskCanvas });
const matteUniformsDescription = { uMode: { value: 0, type: "f32" }, uKey: { value: new Float32Array(3), type: "vec3<f32>" }, uTolerance: { value: 0.25, type: "f32" } };
const matteFilter = new Filter({
  glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: matteFragment, name: "camera-check-matte" }),
  resources: { matteUniforms: matteUniformsDescription, uMask: maskSource }
});
// Pixi copies the description into a uniform group; the live values are on the filter.
const matteUniforms = (matteFilter.resources as { matteUniforms: { uniforms: { uMode: number; uKey: Float32Array; uTolerance: number } } }).matteUniforms.uniforms;

/* Stage 2: effects. */

const bulgeLeft = new BulgePinchFilter({ radius: 60, strength: 0.6 });
const bulgeRight = new BulgePinchFilter({ radius: 60, strength: 0.6 });
const glitch = new GlitchFilter({ slices: 8, offset: 40, fillMode: 2 });
const alphaToGray = new ColorMatrixFilter();
alphaToGray.matrix = [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];

interface Scene {
  readonly width: number;
  readonly height: number;
  readonly videoSource: VideoSource;
  readonly cameraSprite: Sprite;
  readonly matteStage: Container;
  readonly matteTarget: RenderTexture;
  readonly mesh: Mesh<PlaneGeometry>;
  readonly restPositions: Float32Array;
  readonly effectStage: Container;
  readonly effectTarget: RenderTexture;
  readonly outputStage: Container;
  readonly matteSprite: Sprite;
  readonly stamp: Graphics;
}
let scene: Scene | null = null;

function buildScene(width: number, height: number): Scene {
  const videoSource = new VideoSource({ resource: video, autoPlay: false, updateFPS: 0 });
  videoSource.autoUpdate = false;
  const cameraSprite = new Sprite(new Texture({ source: videoSource }));
  const matteStage = new Container({ children: [cameraSprite] });
  matteStage.filterArea = new Rectangle(0, 0, width, height);
  const matteTarget = RenderTexture.create({ width, height });
  const geometry = new PlaneGeometry({ width, height, verticesX: meshColumns, verticesY: meshRows });
  const mesh = new Mesh({ geometry, texture: matteTarget });
  const effectStage = new Container({ children: [mesh] });
  effectStage.filterArea = new Rectangle(0, 0, width, height);
  const effectTarget = RenderTexture.create({ width, height });
  const matteSprite = new Sprite(effectTarget);
  matteSprite.filters = [alphaToGray];
  const stamp = new Graphics();
  const outputStage = new Container({ children: [new Sprite(effectTarget), matteSprite, stamp] });
  return {
    width, height, videoSource, cameraSprite, matteStage, matteTarget, mesh, restPositions: new Float32Array(geometry.positions),
    effectStage, effectTarget, outputStage, matteSprite, stamp
  };
}

function destroyScene(current: Scene): void {
  current.outputStage.destroy({ children: true });
  current.effectStage.destroy({ children: true });
  current.matteStage.destroy({ children: true });
  current.matteTarget.destroy(true);
  current.effectTarget.destroy(true);
  current.videoSource.destroy();
}

/** Applies settings that change the scene's shape: mirror, matte mode, effects, packing. */
function applySettings(): void {
  if (scene === null) return;
  const { width, height, cameraSprite, matteStage, effectStage, matteSprite } = scene;
  cameraSprite.width = width;
  cameraSprite.height = height;
  cameraSprite.scale.x = Math.abs(cameraSprite.scale.x) * (settings.mirror ? -1 : 1);
  cameraSprite.x = settings.mirror ? width : 0;
  matteUniforms.uMode = settings.matte === "segmenter" ? 2 : settings.matte === "key" ? 1 : 0;
  const key = Number.parseInt(settings.keyColor.slice(1), 16);
  matteUniforms.uKey.set([(key >> 16 & 255) / 255, (key >> 8 & 255) / 255, (key & 255) / 255]);
  matteUniforms.uTolerance = settings.keyTolerance;
  matteStage.filters = settings.matte === "none" ? [] : [matteFilter];
  effectStage.filters = [...(settings.eyeBulge ? [bulgeLeft, bulgeRight] : []), ...(settings.glitch ? [glitch] : [])];
  layout = frameLayout(width, height, settings.pack);
  matteSprite.visible = layout.matte !== null;
  if (layout.matte !== null) {
    matteSprite.position.set(layout.matte.x, layout.matte.y);
    matteSprite.setSize(layout.matte.width, layout.matte.height);
  }
  if (app.renderer.width !== layout.width || app.renderer.height !== layout.height) app.renderer.resize(layout.width, layout.height);
  if (settings.matte === "segmenter") segmenter ??= ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}/app/mediapipe/selfie_segmenter.tflite`, delegate: "GPU" },
    runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false
  });
}

/* Per-frame processing. */

const trackingCanvas = document.createElement("canvas");
const tracking2d = trackingCanvas.getContext("2d", { alpha: false })!;
const alphaCanvas = document.createElement("canvas");
alphaCanvas.width = 64; alphaCanvas.height = 36;
const alpha2d = alphaCanvas.getContext("2d", { willReadFrequently: true })!;
const smoother = new AnchorSmoother();
let anchors: FaceAnchors | null = null;
let lastFaceAt = -Infinity;
const frameTimes: number[] = [];
const trackingTimes: number[] = [];
const segmentTimes: number[] = [];
let faceFrames = 0;
let trackedFrames = 0;
let blendshapes = 0;
let processedFrames = 0;
let skippedFrames = 0;
let lastPresented: number | null = null;
let busy = false;
let windowStart = performance.now();
let windowCameraFrames = 0;
let windowProcessed = 0;
let readySegmenter: ImageSegmenter | null = null;
let maskCount = 0;
let personCoverage: number | null = null;

function track(now: number): void {
  if (landmarker === null || !settings.tracking) { anchors = null; return; }
  const started = performance.now();
  const result = landmarker.detectForVideo(trackingCanvas, now);
  pushBounded(trackingTimes, performance.now() - started);
  trackedFrames += 1;
  blendshapes = result.faceBlendshapes[0]?.categories.length ?? blendshapes;
  const face = result.faceLandmarks[0];
  const found = face === undefined || scene === null ? null : faceAnchors(face, scene.width, scene.height);
  if (found !== null) {
    faceFrames += 1;
    lastFaceAt = now;
    anchors = smoother.smooth(found, now / 1000);
  } else if (now - lastFaceAt > holdMs + fadeMs) {
    anchors = null;
    smoother.reset();
  }
}

function segment(now: number): void {
  if (settings.matte !== "segmenter" || readySegmenter === null) return;
  const started = performance.now();
  const result = readySegmenter.segmentForVideo(trackingCanvas, now);
  const masks = result.confidenceMasks ?? [];
  // Single-output selfie models give the person; two-output ones give background then person.
  const mask = masks[masks.length - 1];
  maskCount = masks.length;
  if (mask !== undefined) {
    const values = mask.getAsFloat32Array();
    let sum = 0;
    for (const value of values) sum += value;
    personCoverage = values.length === 0 ? null : Math.round(sum / values.length * 100);
    if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) { maskCanvas.width = mask.width; maskCanvas.height = mask.height; maskSource.resize(mask.width, mask.height); }
    const image = new ImageData(mask.width, mask.height);
    for (let index = 0; index < values.length; index += 1) {
      const value = Math.round((values[index] ?? 0) * 255);
      image.data[index * 4] = value; image.data[index * 4 + 1] = value; image.data[index * 4 + 2] = value; image.data[index * 4 + 3] = 255;
    }
    maskCanvas.getContext("2d")!.putImageData(image, 0, 0);
    maskSource.update();
  }
  result.close();
  pushBounded(segmentTimes, performance.now() - started);
}

/** Positions the eye effects; they hold, then fade out, after tracking loses the face. */
function placeEffects(now: number): void {
  if (scene === null) return;
  const fade = anchors === null ? 0 : Math.min(1, Math.max(0, 1 - (now - lastFaceAt - holdMs) / fadeMs));
  const radius = anchors === null ? 0 : eyeRadius(anchors.faceWidth);
  for (const [filter, eye] of [[bulgeLeft, anchors?.leftEye], [bulgeRight, anchors?.rightEye]] as const) {
    filter.strength = eye === undefined ? 0 : 0.6 * fade;
    filter.radius = Math.max(1, radius);
    if (eye !== undefined) filter.center = { x: eye.x / scene.width, y: eye.y / scene.height };
  }
  const positions = scene.mesh.geometry.positions;
  const eyes = anchors === null || !settings.bigEyes ? [] : [anchors.leftEye, anchors.rightEye];
  for (let index = 0; index < positions.length; index += 2) {
    const moved = bigEyesVertex({ x: scene.restPositions[index]!, y: scene.restPositions[index + 1]! }, eyes, radius * 1.1, 0.45 * fade);
    positions[index] = moved.x;
    positions[index + 1] = moved.y;
  }
  scene.mesh.geometry.getBuffer("aPosition").update();
  if (settings.glitch) glitch.seed = Math.random();
}

function drawStamp(): void {
  if (scene === null) return;
  const { stamp } = scene;
  const { x, y, cell } = layout.stamp;
  const bits = encodeTimestampBits(Date.now());
  stamp.clear();
  stamp.rect(x - cell / 2, y - cell / 2, (bits.length + 1) * cell, cell * 2).fill(0xffffff);
  bits.forEach((bit, index) => { if (bit) stamp.rect(x + index * cell, y, cell, cell).fill(0x000000); });
}

function processFrame(now: number): void {
  if (scene === null) return;
  const started = performance.now();
  const { width, height } = scene;
  trackingCanvas.width = Math.min(trackingWidth, width);
  trackingCanvas.height = Math.round(trackingCanvas.width * height / width);
  tracking2d.setTransform(settings.mirror ? -1 : 1, 0, 0, 1, settings.mirror ? trackingCanvas.width : 0, 0);
  tracking2d.drawImage(video, 0, 0, trackingCanvas.width, trackingCanvas.height);
  track(now);
  segment(now);
  placeEffects(now);
  scene.videoSource.update();
  app.renderer.render({ container: scene.matteStage, target: scene.matteTarget, clear: true });
  app.renderer.render({ container: scene.effectStage, target: scene.effectTarget, clear: true });
  drawStamp();
  app.renderer.render({ container: scene.outputStage });
  pushBounded(frameTimes, performance.now() - started);
  processedFrames += 1;
  windowProcessed += 1;
}

function onCameraFrame(now: number, metadata: VideoFrameCallbackMetadata): void {
  if (cameraStream === null) return;
  video.requestVideoFrameCallback(onCameraFrame);
  windowCameraFrames += 1;
  if (lastPresented !== null && metadata.presentedFrames > lastPresented + 1) skippedFrames += metadata.presentedFrames - lastPresented - 1;
  lastPresented = metadata.presentedFrames;
  if (busy) { skippedFrames += 1; return; }
  busy = true;
  try { processFrame(now); }
  catch (error) { reportError("pipeline-frame", error); }
  finally { busy = false; }
}

/* Camera control. */

function stopCamera(): void {
  for (const track of cameraStream?.getTracks() ?? []) track.stop();
  cameraStream = null;
  video.srcObject = null;
}

async function list(): Promise<{ deviceId: string; label: string }[]> {
  let devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
  if (devices.some(device => device.label === "") && cameraStream === null) {
    // Labels appear only after a camera has been opened once in this session.
    const probe = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of probe.getTracks()) track.stop();
    devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
  }
  return devices.slice(0, 32).map(device => ({ deviceId: device.deviceId, label: (device.label || "Unnamed camera").slice(0, 200) }));
}

async function probe(deviceId: string): Promise<ProbeResult> {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
  const track = stream.getVideoTracks()[0]!;
  try {
    const capabilities = track.getCapabilities();
    const range = (value: ULongRange | DoubleRange | undefined) => value === undefined ? undefined : { ...(value.min === undefined ? {} : { min: value.min }), ...(value.max === undefined ? {} : { max: value.max }) };
    const ranges = { width: range(capabilities.width), height: range(capabilities.height), frameRate: range(capabilities.frameRate) };
    const advertised = new Set(advertisedPresets(ranges).map(preset => preset.id));
    const presets: ProbeResult["presets"] = [];
    for (const preset of formatPresets) {
      if (!advertised.has(preset.id)) { presets.push({ id: preset.id, advertised: false, native: null, actual: null, error: null }); continue; }
      try {
        await track.applyConstraints(exactConstraints(deviceId, preset));
        const actual = track.getSettings();
        presets.push({ id: preset.id, advertised: true, native: true, actual: { width: actual.width ?? 0, height: actual.height ?? 0, frameRate: actual.frameRate ?? null }, error: null });
      } catch (error) {
        presets.push({ id: preset.id, advertised: true, native: false, actual: null, error: (error instanceof Error ? error.name : String(error)).slice(0, 200) });
      }
    }
    const clean = Object.fromEntries(Object.entries(ranges).filter(([, value]) => value !== undefined));
    return { label: track.label.slice(0, 200), capabilities: clean, presets };
  } finally {
    for (const stopped of stream.getTracks()) stopped.stop();
  }
}

/** Samples a small copy of the camera picture for any pixel that is not opaque. */
function cameraHasAlpha(): boolean | null {
  if (video.videoWidth === 0) return null;
  alpha2d.clearRect(0, 0, alphaCanvas.width, alphaCanvas.height);
  alpha2d.drawImage(video, 0, 0, alphaCanvas.width, alphaCanvas.height);
  const { data } = alpha2d.getImageData(0, 0, alphaCanvas.width, alphaCanvas.height);
  for (let index = 3; index < data.length; index += 4) if (data[index]! < 250) return true;
  return false;
}

async function open(deviceId: string, width: number, height: number, frameRate: number): Promise<OpenResult> {
  stopCamera();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: exactConstraints(deviceId, { width, height, frameRate }) });
  } catch (error) {
    return { ok: false, label: "", width, height, frameRate: null, alphaSurvives: null, error: (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 200) };
  }
  cameraStream = stream;
  const track = stream.getVideoTracks()[0]!;
  cameraLabel = track.label;
  video.srcObject = stream;
  await video.play();
  const actual = track.getSettings();
  const actualWidth = actual.width ?? video.videoWidth;
  const actualHeight = actual.height ?? video.videoHeight;
  landmarker ??= await createLandmarker();
  if (scene !== null) destroyScene(scene);
  scene = buildScene(actualWidth, actualHeight);
  applySettings();
  closeAllConnections();
  lastPresented = null;
  smoother.reset();
  video.requestVideoFrameCallback(onCameraFrame);
  await new Promise(resolve => setTimeout(resolve, 500));
  return { ok: true, label: cameraLabel.slice(0, 200), width: actualWidth, height: actualHeight, frameRate: actual.frameRate ?? null, alphaSurvives: cameraHasAlpha(), error: null };
}

/* Publishing over loopback WebRTC, like the Videos mirror: one encode per receiver, capped to what it shows. */

const outputTrack = output.captureStream(30).getVideoTracks()[0]!;
const outputStream = new MediaStream([outputTrack]);
interface Connection { readonly connection: number; readonly pc: RTCPeerConnection; scale: string }
const connections = new Map<ReceiverId, Connection>();

function closeConnection(receiverId: ReceiverId, entry: Connection): void {
  entry.pc.close();
  if (connections.get(receiverId) === entry) connections.delete(receiverId);
}

function closeAllConnections(): void {
  for (const [receiverId, entry] of connections) closeConnection(receiverId, entry);
}

async function capVideo(sender: RTCRtpSender, hello: VideoMirrorHello): Promise<string> {
  const encoding = videoMirrorVideoEncoding({ width: output.width, height: output.height }, hello);
  const parameters = sender.getParameters();
  const first = parameters.encodings[0];
  if (first === undefined) return "unlimited";
  Object.assign(first, encoding);
  parameters.degradationPreference = "maintain-framerate";
  await sender.setParameters(parameters);
  return [encoding.scaleResolutionDownBy, encoding.maxBitrate, encoding.maxFramerate].join(",");
}

function preferCodec(pc: RTCPeerConnection): void {
  if (settings.codec === "default") return;
  const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
  const wanted = `video/${settings.codec}`.toLowerCase();
  const sorted = [...codecs.filter(codec => codec.mimeType.toLowerCase() === wanted), ...codecs.filter(codec => codec.mimeType.toLowerCase() !== wanted)];
  for (const transceiver of pc.getTransceivers()) transceiver.setCodecPreferences(sorted);
}

async function receiverSignal(receiverId: ReceiverId, message: VideoMirrorReceiverSignal): Promise<void> {
  const existing = connections.get(receiverId);
  if (message.type === "bye") { if (existing !== undefined && message.connection === existing.connection) closeConnection(receiverId, existing); return; }
  if (message.type === "hello") {
    if (existing !== undefined) closeConnection(receiverId, existing);
    if (cameraStream === null || connections.size >= maximumConnections) { signal(`receiver:${receiverId}`, { type: "not-ready", connection: message.connection }); return; }
    const pc = new RTCPeerConnection({ iceServers: [...videoMirrorIceServers] });
    const entry: Connection = { connection: message.connection, pc, scale: "" };
    connections.set(receiverId, entry);
    pc.addEventListener("icecandidate", event => {
      const candidate = event.candidate;
      if (candidate === null || connections.get(receiverId) !== entry || !isLocalHostIceCandidate(candidate.candidate)) return;
      signal(`receiver:${receiverId}`, { type: "ice", connection: entry.connection, candidate: {
        candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: candidate.usernameFragment
      } });
    });
    pc.addEventListener("connectionstatechange", () => {
      // A failed connection is a finding (an encoder that refused the frame size shows up here), so it is reported.
      if (pc.connectionState === "failed") reportError("publisher", `connection to ${receiverId} failed at ${output.width}x${output.height} with codec ${settings.codec}`);
      if ((pc.connectionState === "failed" || pc.connectionState === "closed") && connections.get(receiverId) === entry) closeConnection(receiverId, entry);
    });
    const sender = pc.addTrack(outputTrack, outputStream);
    preferCodec(pc);
    entry.scale = await capVideo(sender, message);
    await pc.setLocalDescription(await pc.createOffer());
    const sdp = pc.localDescription?.sdp;
    if (connections.get(receiverId) === entry && sdp !== undefined) signal(`receiver:${receiverId}`, { type: "offer", connection: entry.connection, sdp });
    return;
  }
  if (existing === undefined || existing.connection !== message.connection) return;
  if (message.type === "answer") { await existing.pc.setRemoteDescription({ type: "answer", sdp: message.sdp }); return; }
  await existing.pc.addIceCandidate({
    candidate: message.candidate.candidate, sdpMid: message.candidate.sdpMid ?? null, sdpMLineIndex: message.candidate.sdpMLineIndex ?? null,
    usernameFragment: message.candidate.usernameFragment ?? null
  });
}

/* Stats every two seconds. */

async function publisherStats(): Promise<void> {
  const summary = [];
  for (const [receiver, entry] of connections) {
    const stats = await entry.pc.getStats();
    let outbound: RTCOutboundRtpStreamStats & { encoderImplementation?: string; powerEfficientEncoder?: boolean } | null = null;
    stats.forEach((item: RTCStats) => { if (item.type === "outbound-rtp" && (item as RTCOutboundRtpStreamStats).kind === "video") outbound = item as typeof outbound; });
    const out = outbound as (RTCOutboundRtpStreamStats & { encoderImplementation?: string; powerEfficientEncoder?: boolean; totalEncodeTime?: number }) | null;
    const codec = out?.codecId === undefined ? undefined : stats.get(out.codecId) as { mimeType?: string } | undefined;
    summary.push({
      receiver, state: entry.pc.connectionState, pair: await pairSummary(entry.pc), fps: out?.framesPerSecond ?? null,
      width: out?.frameWidth ?? null, height: out?.frameHeight ?? null, codec: codec?.mimeType ?? null,
      encoder: out?.encoderImplementation?.slice(0, 120) ?? null, powerEfficient: out?.powerEfficientEncoder ?? null,
      encodeMsPerFrame: out?.totalEncodeTime !== undefined && (out.framesEncoded ?? 0) > 0 ? Math.round(out.totalEncodeTime / out.framesEncoded! * 10000) / 10 : null,
      qualityLimitation: out?.qualityLimitationReason ?? null, scale: entry.scale.slice(0, 80)
    });
  }
  report({ kind: "publisher-stats", data: summary });
}

function pipelineStats(): void {
  const seconds = (performance.now() - windowStart) / 1000;
  const fps = (frames: number) => seconds > 0 ? Math.round(frames / seconds * 10) / 10 : null;
  report({ kind: "pipeline-stats", data: {
    cameraFps: fps(windowCameraFrames), processedFps: fps(windowProcessed), processedFrames, skippedFrames,
    cameraAlpha: cameraStream === null ? null : cameraHasAlpha(),
    frameMs: timing(frameTimes),
    tracking: { ...timing(trackingTimes), facePercent: trackedFrames === 0 ? null : Math.round(faceFrames / trackedFrames * 100), blendshapes, delegate },
    segmentation: settings.matte === "segmenter" ? { ...timing(segmentTimes), masks: maskCount, personPercent: personCoverage } : null,
    output: { width: output.width, height: output.height },
    webgl: { renderer: rendererName.slice(0, 200), software: isSoftwareRenderer(rendererName) },
    settings
  } });
  windowStart = performance.now();
  windowCameraFrames = 0;
  windowProcessed = 0;
}

async function init(): Promise<{ renderer: string; software: boolean }> {
  await app.init({ canvas: output, width: 1280, height: 720, preference: "webgl", background: 0x000000, backgroundAlpha: 1, antialias: false, autoStart: false, resolution: 1, powerPreference: "high-performance" });
  app.ticker.stop();
  const gl = (app.renderer as WebGLRenderer).gl;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  rendererName = String(gl.getParameter(debug === null ? gl.RENDERER : debug.UNMASKED_RENDERER_WEBGL));
  listen("publisher", async body => {
    const envelope = body as { receiverId: ReceiverId; signal: VideoMirrorReceiverSignal };
    await receiverSignal(envelope.receiverId, envelope.signal).catch((error: unknown) => {
      reportError("publisher", error);
      const entry = connections.get(envelope.receiverId);
      if (entry !== undefined && entry.connection === envelope.signal.connection) closeConnection(envelope.receiverId, entry);
    });
  });
  setInterval(() => {
    pipelineStats();
    void publisherStats().catch((error: unknown) => reportError("publisher-stats", error));
  }, 2000);
  window.cameraCheck = {
    list, probe, open,
    configure(next) {
      const codecChanged = next.codec !== settings.codec;
      settings = next;
      applySettings();
      if (codecChanged) closeAllConnections();
      if (settings.matte === "segmenter" && segmenter !== null && readySegmenter === null) {
        void segmenter.then(created => { readySegmenter = created; }, (error: unknown) => reportError("segmenter", error));
      }
    }
  };
  return { renderer: rendererName.slice(0, 200), software: isSoftwareRenderer(rendererName) };
}

window.cameraCheckReady = init();
