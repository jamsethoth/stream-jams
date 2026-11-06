import { startVideoMirrorReceiver, type VideoMirrorPublisherSignal, type VideoMirrorRequest } from "@stream-jams/core/videos";
import type { ReceiverId, ReceiverState } from "./check-protocol.js";
import { containRect, frameLayout, isPackedFrame, opticalCellCentres, sceneHeight, sceneWidth } from "./frame-layout.js";
import { adaptiveThreshold, decodeOpticalDelayMs } from "./optical-code.js";
import { api, listen, pairSummary, pushBounded, report, reportError, signal } from "./page-api.js";
import { decodeDelayMs } from "../video-mirror-check/timestamp-barcode.js";

/*
 * A camera effects check receiver: the OBS browser source page and the desktop overlay
 * window. It places the camera on a 1920 x 1080 scene with the current layout and, for a
 * packed frame, recombines picture and matte in its shader so the page renders transparent.
 * The encode size never depends on the layout, so moving the camera never reconnects.
 */

const params = new URLSearchParams(location.search);
const label = params.get("label") === "obs" ? "obs" : params.get("label") === "desktop" ? "desktop" : "browser";
const id = `${label}-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}` as ReceiverId;
/** Encode width cap: the scene (1920) by default, a smaller box, or none ("camera") for the 4K stress test. */
const capWidth = params.get("cap") === "camera" ? null : Math.min(3840, Math.max(640, Number(params.get("cap")) || sceneWidth));
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const video = document.getElementById("video") as HTMLVideoElement;
const status = document.getElementById("status") as HTMLDivElement;
if (label === "desktop") document.body.classList.add("desktop");
if (params.get("clean") === "1") status.hidden = true;

let state: ReceiverState = { camera: null, packed: false, layout: { x: 0, y: 0, width: sceneWidth, height: sceneHeight } };
let packed = false;
let reconnects = 0;
let connectionState = "connecting";
let peer: RTCPeerConnection | null = null;
const outputDelays: number[] = [];
const glassDelays: number[] = [];

/* Scene drawing in WebGL2: premultiplied output, so transparent pixels stay transparent in OBS. */

const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false })!;
const program = gl.createProgram();
for (const [type, source] of [[gl.VERTEX_SHADER, `#version 300 es
in vec2 aCorner;
uniform vec4 uRect;
out vec2 vUv;
void main() {
  vUv = aCorner;
  vec2 position = (uRect.xy + aCorner * uRect.zw) / vec2(${sceneWidth}.0, ${sceneHeight}.0);
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
}`], [gl.FRAGMENT_SHADER, `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uFrame;
uniform float uPacked;
uniform vec2 uPicture;
out vec4 color;
void main() {
  vec3 rgb = texture(uFrame, vec2(vUv.x, vUv.y * uPicture.y)).rgb;
  // The matte sits below the picture at half size; its grey level is the alpha.
  float alpha = uPacked > 0.5 ? texture(uFrame, vec2(vUv.x * 0.5, uPicture.y + vUv.y * (1.0 - uPicture.y))).r : 1.0;
  // The picture was drawn over black, so its colour is already premultiplied.
  color = vec4(min(rgb, vec3(alpha)), alpha);
}`]] as const) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  gl.attachShader(program, shader);
}
gl.bindAttribLocation(program, 0, "aCorner");
gl.linkProgram(program);
gl.useProgram(program);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const uRect = gl.getUniformLocation(program, "uRect");
const uPacked = gl.getUniformLocation(program, "uPacked");
const uPicture = gl.getUniformLocation(program, "uPicture");
let hasFrame = false;

function draw(upload: boolean): void {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (video.videoWidth === 0 || state.camera === null) return;
  if (upload) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); hasFrame = true; }
  if (!hasFrame) return;
  packed = isPackedFrame(video.videoWidth, video.videoHeight, state.camera.width, state.camera.height);
  const frame = frameLayout(state.camera.width, state.camera.height, packed);
  const rect = containRect(state.layout, state.camera.width, state.camera.height);
  gl.uniform4f(uRect, rect.x, rect.y, rect.width, rect.height);
  gl.uniform1f(uPacked, packed ? 1 : 0);
  gl.uniform2f(uPicture, 1, frame.picture.height / frame.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

let presented = 0;
function onFrame(): void {
  presented += 1;
  draw(true);
  video.requestVideoFrameCallback(onFrame);
}
video.requestVideoFrameCallback(onFrame);

/* Connection, through the same receiver the product's overlays use. */

function request(): VideoMirrorRequest {
  if (capWidth === null) return { media: "video" };
  // The largest placement is the whole scene; a packed frame adds the matte row below it.
  const height = Math.round(capWidth * sceneHeight / sceneWidth);
  return { media: "video", maxWidth: capWidth, maxHeight: Math.min(2160, state.packed ? Math.round(height * 3 / 2) : height) };
}

// The first hello must already ask for the packed size, or the encode starts scaled down.
state = await api<ReceiverState>("/state").catch((error: unknown) => { reportError(id, error); return state; });
const receiver = startVideoMirrorReceiver({
  connector: {
    send: message => signal("publisher", { receiverId: id, signal: message }),
    subscribe: listener => listen(`receiver:${id}`, body => listener(body as VideoMirrorPublisherSignal))
  },
  createPeerConnection: configuration => (peer = new RTCPeerConnection(configuration)),
  onStream: stream => {
    video.srcObject = stream;
    hasFrame = false;
    // A replaced stream aborts the previous play(); that is expected, anything else is reported.
    if (stream !== null) void video.play().catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) reportError(id, error); });
  },
  onState: next => {
    if (next !== "playing" && connectionState === "playing") reconnects += 1;
    connectionState = next;
    status.textContent = `Camera ${next}`;
  },
  request
});
window.addEventListener("pagehide", () => receiver.stop());

async function pollState(): Promise<void> {
  try {
    const next = await api<ReceiverState>("/state");
    const grew = next.packed !== state.packed;
    state = next;
    if (grew) receiver.refresh();
    draw(false);
  } catch (error) { reportError(id, error); }
  setTimeout(() => void pollState(), 500);
}
void pollState();

/* Delay: the output strip the pipeline stamps, and the optical code filmed off a screen. */

const sampler = document.createElement("canvas");
const sampler2d = sampler.getContext("2d", { willReadFrequently: true })!;
setInterval(() => {
  if (video.videoWidth === 0 || state.camera === null) return;
  const frame = frameLayout(state.camera.width, state.camera.height, packed);
  sampler.width = Math.ceil(video.videoWidth / 2);
  sampler.height = Math.ceil(video.videoHeight / 2);
  sampler2d.drawImage(video, 0, 0, sampler.width, sampler.height);
  const scale = sampler.width / frame.width;
  const { data } = sampler2d.getImageData(0, 0, sampler.width, sampler.height);
  const luminance = (x: number, y: number) => {
    const offset = (Math.min(sampler.height - 1, Math.max(0, Math.round(y * scale))) * sampler.width + Math.min(sampler.width - 1, Math.max(0, Math.round(x * scale)))) * 4;
    return 0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!;
  };
  const now = Date.now();
  const { x, y, cell } = frame.stamp;
  const stamp = Array.from({ length: 24 }, (_, index) => luminance(x + (index + 0.5) * cell, y + cell / 2));
  const outputDelay = decodeDelayMs(stamp, now);
  if (outputDelay !== null) pushBounded(outputDelays, outputDelay, 120);
  const optical = opticalCellCentres().map(centre => luminance(centre.x * frame.picture.width, centre.y * frame.picture.height));
  const threshold = adaptiveThreshold(optical);
  // A mirrored picture shows the grid back to front; one of the two readings is the real one.
  const glass = threshold === null ? null : decodeOpticalDelayMs(optical, now, threshold) ?? decodeOpticalDelayMs(mirrorRows(optical), now, threshold);
  if (glass !== null) pushBounded(glassDelays, glass, 120);
}, 250);

function mirrorRows(cells: readonly number[]): number[] {
  const rows: number[] = [];
  for (let start = 0; start < cells.length; start += 6) rows.push(...cells.slice(start, start + 6).reverse());
  return rows;
}

const delaySummary = (samples: readonly number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { medianMs: sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)]!, maxMs: sorted.at(-1) ?? null, samples: sorted.length };
};

let lastPresented = 0;
let lastStatsAt = performance.now();
setInterval(() => {
  void (async () => {
    const elapsed = (performance.now() - lastStatsAt) / 1000;
    const presentedFps = elapsed > 0 ? Math.round((presented - lastPresented) / elapsed * 10) / 10 : null;
    lastPresented = presented;
    lastStatsAt = performance.now();
    type Inbound = RTCInboundRtpStreamStats & { decoderImplementation?: string; powerEfficientDecoder?: boolean };
    let inbound: Inbound | null = null;
    if (peer !== null) (await peer.getStats()).forEach((item: RTCStats) => { if (item.type === "inbound-rtp" && (item as Inbound).kind === "video") inbound = item as Inbound; });
    const stats = inbound as Inbound | null;
    const output = delaySummary(outputDelays);
    const glass = delaySummary(glassDelays);
    if (params.get("clean") !== "1") status.textContent = `Camera ${connectionState}${output.medianMs === null ? "" : ` · ${output.medianMs} ms`}${glass.medianMs === null ? "" : ` · glass ${glass.medianMs} ms`}`;
    report({ kind: "receiver-stats", data: {
      receiver: id, userAgent: navigator.userAgent.includes("OBS") ? "obs" : navigator.userAgent.includes("Electron") ? "electron" : "browser",
      state: connectionState, pair: peer === null ? null : await pairSummary(peer), fps: stats?.framesPerSecond ?? null, presentedFps,
      width: video.videoWidth, height: video.videoHeight, packed, framesDropped: stats?.framesDropped ?? null,
      decoder: stats?.decoderImplementation?.slice(0, 120) ?? null, powerEfficientDecoder: stats?.powerEfficientDecoder ?? null,
      outputDelay: output, glassDelay: glass, reconnects
    } });
  })().catch((error: unknown) => reportError(id, error));
}, 2000);
