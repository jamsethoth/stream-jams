import { barcodeBits, barcodeCellPx, decodeDelayMs, encodeTimestampBits } from "./timestamp-barcode.js";

/*
 * Pages for the Windows video mirror feasibility check (OpenSpec add-video-request-queue 1.2).
 * They are served only on 127.0.0.1 behind a per-run token and talk to the check's main
 * process over plain local HTTP. This is diagnostic tooling, not product UI.
 */

export type CheckSource =
  | { readonly kind: "pattern" }
  | { readonly kind: "youtube"; readonly videoId: string }
  | { readonly kind: "twitch-clip"; readonly clipSlug: string }
  | { readonly kind: "twitch-vod"; readonly videoId: string };

const shared = `
const token = new URLSearchParams(location.search).get("t");
async function api(path, body) {
  const response = await fetch(path + (path.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(token), body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(path + " failed with " + response.status);
  return response.json();
}
function report(kind, data) { return api("/report", { kind, data }).catch(() => undefined); }
function listen(role, handler) {
  let after = 0;
  (async function loop() {
    for (;;) {
      try {
        const messages = await api("/signal/" + encodeURIComponent(role) + "?after=" + after);
        for (const message of messages) { after = message.sequence; await handler(message.body); }
      } catch (error) { report("error", { role, message: String(error && error.message || error) }); }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  })();
}
function send(role, body) { return api("/signal/" + encodeURIComponent(role), body); }
function candidateKind(candidate) {
  if (!candidate) return null;
  const address = String(candidate.address || candidate.ip || "");
  const where = address.endsWith(".local") ? "mdns" : address === "127.0.0.1" || address === "::1" ? "loopback" : address === "" ? "hidden" : "lan";
  return candidate.candidateType + ":" + where + ":" + candidate.protocol;
}
async function pairSummary(pc) {
  const stats = await pc.getStats();
  let pair = null;
  stats.forEach(report => { if (report.type === "candidate-pair" && report.nominated && report.state === "succeeded") pair = report; });
  if (pair === null) return null;
  return { local: candidateKind(stats.get(pair.localCandidateId)), remote: candidateKind(stats.get(pair.remoteCandidateId)), rttMs: pair.currentRoundTripTime === undefined ? null : Math.round(pair.currentRoundTripTime * 1000) };
}
`;

const page = (title: string, style: string, body: string, script: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>${style}</style></head><body>${body}
<script>
${shared}
${script}
</script></body></html>`;

export function playerPage(source: CheckSource, origin: string, parentHost: string): string {
  // One long-lived player page: sources are swapped inside it, so the capture and every mirror connection survive.
  return page("Video mirror check player", `
    html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #000; }
    #stage > * { position: absolute; inset: 0; width: 1280px; height: 720px; border: 0; }
    #barcode { position: absolute; left: 16px; top: 16px; display: flex; z-index: 2; outline: 4px solid #fff; }
    #barcode div { width: ${barcodeCellPx}px; height: ${barcodeCellPx}px; }
  `, `<div id="stage"></div><div id="barcode"></div><div id="sinks" hidden></div>`, `
${encodeTimestampBits.toString()}
const cells = [];
const barcode = document.getElementById("barcode");
for (let index = 0; index < ${barcodeBits}; index += 1) { const cell = document.createElement("div"); barcode.append(cell); cells.push(cell); }
function paint() {
  const bits = encodeTimestampBits(Date.now());
  bits.forEach((bit, index) => { cells[index].style.background = bit ? "#000" : "#fff"; });
}
setInterval(paint, 16);
paint();

const youtubeOrigin = "https://www.youtube-nocookie.com";
let source = null;
let patternTimer = null;
let audioContext = null;
let toneGain = null;

function startTone() {
  if (audioContext === null) {
    audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    toneGain = audioContext.createGain();
    oscillator.frequency.value = 440;
    oscillator.connect(toneGain).connect(audioContext.destination);
    oscillator.start();
  }
  toneGain.gain.value = 0.2;
  void audioContext.resume();
}
function stopTone() { if (toneGain !== null) toneGain.gain.value = 0; if (audioContext !== null) void audioContext.suspend(); }

window.__setSource = (next, url) => {
  source = next;
  const stage = document.getElementById("stage");
  clearInterval(patternTimer);
  stopTone();
  if (next.kind === "none") {
    stage.replaceChildren();
    report("player-stopped", {});
    return;
  }
  if (next.kind === "pattern") {
    const canvas = document.createElement("canvas");
    canvas.width = 1280; canvas.height = 720;
    stage.replaceChildren(canvas);
    const context = canvas.getContext("2d");
    patternTimer = setInterval(() => {
      const t = Date.now() / 1000;
      context.fillStyle = "hsl(" + Math.floor(t * 40 % 360) + ", 60%, 35%)";
      context.fillRect(0, 0, 1280, 720);
      context.fillStyle = "#fff";
      context.font = "bold 96px sans-serif";
      context.fillText("Stream Jams test pattern", 120, 360 + Math.sin(t * 2) * 120);
    }, 33);
    if (captured !== null) startTone();
    report("player-loaded", { kind: "pattern" });
    return;
  }
  const frame = document.createElement("iframe");
  frame.id = "provider";
  frame.allow = "autoplay; fullscreen";
  frame.referrerPolicy = "origin";
  frame.src = url;
  frame.addEventListener("load", () => {
    report("player-loaded", { kind: next.kind });
    if (next.kind === "youtube") frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), youtubeOrigin);
  });
  stage.replaceChildren(frame);
};

// YouTube iframe API: record the first message shapes and accept test commands.
const seenShapes = new Set();
window.addEventListener("message", event => {
  const provider = document.getElementById("provider");
  if (provider === null || event.source !== provider.contentWindow || event.origin !== youtubeOrigin || typeof event.data !== "string") return;
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  const shape = message.event + ":" + (message.info && typeof message.info === "object" ? Object.keys(message.info).sort().join(",") : typeof message.info);
  if (!seenShapes.has(shape) && seenShapes.size < 12) { seenShapes.add(shape); report("youtube-message", { shape, playerState: message.info && message.info.playerState, currentTime: message.info && message.info.currentTime }); }
});
function youtubeCommand(func, args) {
  const provider = document.getElementById("provider");
  provider?.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: args || [], id: 1, channel: "widget" }), youtubeOrigin);
}

let captured = null;
const connections = new Map();
window.__startCapture = async () => {
  if (captured !== null && captured.getTracks().every(track => track.readyState === "live")) return;
  const started = performance.now();
  try {
    captured = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, width: 1280, height: 720 },
      // Music, not a call: no voice processing, keep stereo. The hidden player must not also play
      // its own sound on the default device, or every output is heard twice at different delays.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, suppressLocalAudioPlayback: true }
    });
    const video = captured.getVideoTracks()[0];
    const audio = captured.getAudioTracks()[0];
    if (source !== null && source.kind === "pattern") startTone();
    report("capture", { ok: true, ms: Math.round(performance.now() - started), video: video ? video.getSettings() : null, audio: audio ? { label: "captured", settings: audio.getSettings() } : null });
    send("control", { type: "capture-ready" });
  } catch (error) {
    report("capture", { ok: false, name: error && error.name, message: String(error && error.message || error) });
  }
};

listen("publisher", async body => {
  if (body.type === "hello") {
    if (captured === null) { await send("receiver:" + body.id, { type: "not-ready" }); return; }
    connections.get(body.id)?.close();
    const pc = new RTCPeerConnection({ iceServers: [] });
    connections.set(body.id, pc);
    for (const track of captured.getTracks()) pc.addTrack(track, captured);
    pc.onicecandidate = event => { if (event.candidate) send("receiver:" + body.id, { type: "ice", candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => report("publisher-connection", { receiver: body.id, state: pc.connectionState });
    await pc.setLocalDescription(await pc.createOffer());
    await send("receiver:" + body.id, { type: "offer", sdp: pc.localDescription.sdp });
  } else if (body.type === "answer") {
    await connections.get(body.id)?.setRemoteDescription({ type: "answer", sdp: body.sdp });
  } else if (body.type === "ice") {
    await connections.get(body.id)?.addIceCandidate(body.candidate).catch(error => report("error", { role: "publisher", message: "ICE: " + error.message }));
  } else if (body.type === "youtube") {
    youtubeCommand(body.func, body.args);
  }
});

setInterval(async () => {
  const summary = [];
  for (const [id, pc] of connections) {
    const stats = await pc.getStats();
    let outbound = null;
    stats.forEach(entry => { if (entry.type === "outbound-rtp" && entry.kind === "video") outbound = entry; });
    summary.push({ receiver: id, state: pc.connectionState, pair: await pairSummary(pc), fps: outbound && outbound.framesPerSecond, encoder: outbound && outbound.encoderImplementation, qualityLimitation: outbound && outbound.qualityLimitationReason });
  }
  if (summary.length > 0) report("publisher-stats", summary);
}, 2000);

window.__setSource(${JSON.stringify(source)}, ${JSON.stringify(source.kind === "pattern" ? "" : providerUrl(source, origin, parentHost))});
`);
}

export function receiverPage(): string {
  return page("Video mirror check receiver", `
    html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: transparent; }
    video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    #status { position: absolute; right: 12px; bottom: 12px; font: 600 18px sans-serif; color: #fff; background: rgba(0,0,0,.6); padding: 6px 10px; border-radius: 6px; }
  `, `<video id="video" playsinline autoplay></video><div id="status">Connecting</div>`, `
${decodeDelayMs.toString()}
const params = new URLSearchParams(location.search);
const id = (params.get("label") || "receiver") + "-" + Math.random().toString(36).slice(2, 8);
const video = document.getElementById("video");
const status = document.getElementById("status");
if (params.get("clean") === "1") status.hidden = true;
let pc = null;
let stream = null;
let analyser = null;
const delays = [];
let peakLevel = 0;
let audioBlocked = false;

listen("receiver:" + id, async body => {
  if (body.type === "not-ready") { status.textContent = "Waiting for capture"; setTimeout(() => send("publisher", { type: "hello", id }), 1000); return; }
  if (body.type === "offer") {
    pc?.close();
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.ontrack = event => {
      // ontrack fires once per track; setting srcObject again would abort the first play() and look like blocked audio.
      if (stream !== event.streams[0]) {
        stream = event.streams[0];
        video.srcObject = stream;
        // The desktop overlay and the device output window never play through the default device.
        if (params.get("label") === "desktop" || params.get("label") === "devices") video.muted = true;
        video.play().catch(error => {
          if (error && error.name === "NotAllowedError") { audioBlocked = true; video.muted = true; return video.play(); }
          return undefined;
        });
      }
      if (event.track.kind === "audio" && params.get("label") === "devices") void fanOut(event.streams[0]);
      if (event.track.kind === "audio" && analyser === null) {
        const context = new AudioContext();
        analyser = context.createAnalyser();
        context.createMediaStreamSource(new MediaStream([event.track])).connect(analyser);
      }
    };
    pc.onicecandidate = event => { if (event.candidate) send("publisher", { type: "ice", id, candidate: event.candidate.toJSON() }); };
    const connection = pc;
    connection.onconnectionstatechange = () => {
      status.textContent = "Mirror " + connection.connectionState;
      report("receiver-connection", { receiver: id, state: connection.connectionState });
      // The product mirror must recover on its own, so the check does too: drop the stale picture and ask again.
      if (connection === pc && (connection.connectionState === "failed" || connection.connectionState === "closed")) reconnect();
      if (connection === pc && connection.connectionState === "disconnected") setTimeout(() => { if (connection === pc && connection.connectionState === "disconnected") reconnect(); }, 3000);
    };
    await pc.setRemoteDescription({ type: "offer", sdp: body.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await send("publisher", { type: "answer", id, sdp: pc.localDescription.sdp });
  } else if (body.type === "ice") {
    await pc?.addIceCandidate(body.candidate).catch(error => report("error", { role: "receiver", message: "ICE: " + error.message }));
  }
});
// Device fan-out lives in its own window, outside the captured player, so its sound is
// never captured back into the mirror.
const sinks = document.createElement("div");
sinks.hidden = true;
document.body.append(sinks);
async function fanOut(source) {
  for (const element of sinks.querySelectorAll("audio")) { element.pause(); element.srcObject = null; }
  sinks.replaceChildren();
  const audioTrack = source.getAudioTracks()[0];
  if (!audioTrack) { report("fan-out", { ok: false, message: "No audio track yet." }); return; }
  const results = [];
  for (const deviceId of (params.get("devices") || "").split(",").filter(Boolean)) {
    const element = document.createElement("audio");
    element.srcObject = new MediaStream([audioTrack]);
    sinks.append(element);
    try { await element.setSinkId(deviceId); await element.play(); results.push({ device: deviceId.slice(0, 8), ok: true, sinkId: element.sinkId === deviceId }); }
    catch (error) { results.push({ device: deviceId.slice(0, 8), ok: false, message: String(error && error.message || error) }); }
  }
  report("fan-out", { ok: results.length > 0 && results.every(result => result.ok), devices: results });
}

let reconnects = 0;
function reconnect() {
  reconnects += 1;
  pc?.close();
  pc = null;
  stream = null;
  analyser = null;
  delays.length = 0;
  peakLevel = 0;
  video.srcObject = null;
  status.textContent = "Reconnecting";
  setTimeout(() => send("publisher", { type: "hello", id }), 1000);
}
send("publisher", { type: "hello", id });

const canvas = document.createElement("canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
setInterval(() => {
  if (analyser !== null) {
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    peakLevel = Math.max(peakLevel, Math.sqrt(sum / samples.length));
  }
  if (video.videoWidth === 0) return;
  const scale = video.videoWidth / 1280;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0);
  const luminances = [];
  for (let index = 0; index < ${barcodeBits}; index += 1) {
    const x = Math.round((16 + index * ${barcodeCellPx} + ${barcodeCellPx} / 2) * scale);
    const y = Math.round((16 + ${barcodeCellPx} / 2) * scale);
    const [r, g, b] = context.getImageData(x, y, 1, 1).data;
    luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  const delay = decodeDelayMs(luminances, Date.now());
  if (delay !== null) { delays.push(delay); if (delays.length > 120) delays.shift(); }
}, 250);

setInterval(async () => {
  if (pc === null) return;
  const stats = await pc.getStats();
  let inbound = null;
  stats.forEach(entry => { if (entry.type === "inbound-rtp" && entry.kind === "video") inbound = entry; });
  const sorted = [...delays].sort((a, b) => a - b);
  const median = sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
  if (median !== null && params.get("clean") !== "1") status.textContent = "Mirror " + pc.connectionState + " · " + median + " ms";
  report("receiver-stats", {
    receiver: id, userAgent: navigator.userAgent.includes("OBS") ? "obs" : navigator.userAgent.includes("Electron") ? "electron" : "browser",
    state: pc.connectionState, pair: await pairSummary(pc), fps: inbound && inbound.framesPerSecond,
    width: video.videoWidth, height: video.videoHeight, delayMedianMs: median, delayMaxMs: sorted.at(-1) ?? null,
    readableFrames: delays.length, audioPeak: Math.round(peakLevel * 1000) / 1000, audioBlocked, reconnects
  });
}, 2000);
`);
}

export function controlPage(): string {
  return page("Stream Jams video mirror check", `
    body { font: 15px/1.45 system-ui, sans-serif; margin: 24px; color: #1d2330; background: #f6f7f9; max-width: 980px; }
    h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 24px; }
    fieldset { border: 1px solid #c9cfda; border-radius: 8px; margin: 12px 0; padding: 12px 16px; background: #fff; }
    label { display: block; margin: 6px 0; } input[type=text] { width: 420px; }
    button { margin: 6px 8px 6px 0; padding: 6px 12px; }
    code, textarea { font: 13px ui-monospace, monospace; } textarea { width: 100%; height: 260px; }
    .hint { color: #4b5566; }
  `, `
<h1>Video mirror check</h1>
<p class="hint">Runs each step of the Videos mirror on this PC. Nothing here changes Stream Jams settings. When you are done, press <b>Copy results</b> and paste them in the thread.</p>
<fieldset><legend>1. Source</legend>
  <label><input type="radio" name="kind" value="pattern" checked> Test pattern with a tone (no internet needed)</label>
  <label><input type="radio" name="kind" value="youtube"> YouTube video ID or link <input type="text" id="youtube" placeholder="https://www.youtube.com/watch?v=..."></label>
  <label><input type="radio" name="kind" value="twitch-clip"> Twitch clip slug or link <input type="text" id="clip" placeholder="https://clips.twitch.tv/..."></label>
  <label><input type="radio" name="kind" value="twitch-vod"> Twitch VOD number or link <input type="text" id="vod" placeholder="https://www.twitch.tv/videos/..."></label>
  <label>Player host <select id="host"><option value="127.0.0.1">127.0.0.1</option><option value="localhost">localhost</option></select> <span class="hint">(Twitch checks this as the embed parent)</span></label>
  <label>Audio capture <select id="audio"><option value="frame">Player window only (preferred)</option><option value="loopbackWithMute">All system audio, muted locally</option><option value="loopback">All system audio</option></select></label>
  <label><input type="checkbox" id="show"> Show the player window (normally hidden)</label>
  <button id="load">Load player</button><button id="capture">Start capture</button><button id="stop">Stop playback</button>
  <label><input type="checkbox" id="mutePlayer"> Mute the player window itself (try only if you still hear the sound twice)</label>
</fieldset>
<fieldset><legend>2. Outputs</legend>
  <p>OBS: add a <b>Browser Source</b> (1280×720, tick <i>Control audio via OBS</i>) with this URL:</p>
  <p><code id="obsUrl"></code> <button id="copyUrl">Copy URL</button></p>
  <button id="desktopReceiver">Open desktop overlay receiver</button>
  <p>Audio devices for fan-out:</p><div id="devices"></div><button id="fanout">Play captured audio on ticked devices</button>
</fieldset>
<fieldset><legend>3. Player control</legend>
  <button data-twitch="probe">Twitch: find video</button><button data-twitch="pause">Twitch: pause</button><button data-twitch="play">Twitch: play</button><button data-twitch="seek">Twitch: jump +10 s</button><br>
  <button data-youtube="pauseVideo">YouTube: pause</button><button data-youtube="playVideo">YouTube: play</button><button data-youtube="seekTo">YouTube: jump to 0:30</button>
</fieldset>
<fieldset><legend>4. What you saw and heard</legend>
  <label><input type="checkbox" data-manual="obsVideo"> The video shows in OBS</label>
  <label><input type="checkbox" data-manual="obsAudio"> Its sound plays in OBS (the source's meter moves)</label>
  <label><input type="checkbox" data-manual="desktopVideo"> The desktop receiver window shows the video</label>
  <label><input type="checkbox" data-manual="devicesAudio"> Each ticked device plays the sound</label>
  <label><input type="checkbox" data-manual="inSync"> Sound and picture stay in sync in OBS</label>
  <label><input type="checkbox" data-manual="singleCopy"> With OBS monitoring off, the sound plays once on each device: no echo, doubling or stutter</label>
  <label><input type="checkbox" data-manual="stopsCleanly"> Stop playback silences everything, including the ticked devices</label>
  <label><input type="checkbox" data-manual="twitchControl"> Twitch pause, play and jump worked</label>
  <label><input type="checkbox" data-manual="youtubeControl"> YouTube pause, play and jump worked</label>
  <label>Notes <input type="text" id="notes" placeholder="Anything odd"></label>
</fieldset>
<h2>Results</h2>
<button id="copy">Copy results</button><span id="copied" class="hint"></span>
<textarea id="results" readonly></textarea>
`, `
const obsUrl = location.origin + "/receiver?label=obs&t=" + encodeURIComponent(token);
document.getElementById("obsUrl").textContent = obsUrl;
document.getElementById("copyUrl").onclick = () => navigator.clipboard.writeText(obsUrl);
function source() {
  const kind = document.querySelector("input[name=kind]:checked").value;
  const value = kind === "youtube" ? document.getElementById("youtube").value : kind === "twitch-clip" ? document.getElementById("clip").value : kind === "twitch-vod" ? document.getElementById("vod").value : "";
  return { kind, value };
}
async function command(body) {
  try { await api("/command", body); } catch (error) { alert(String(error.message || error)); }
}
document.getElementById("load").onclick = () => command({ action: "load-player", source: source(), host: document.getElementById("host").value, audio: document.getElementById("audio").value, show: document.getElementById("show").checked });
document.getElementById("capture").onclick = () => command({ action: "start-capture" });
document.getElementById("stop").onclick = () => command({ action: "stop-player" });
document.getElementById("mutePlayer").onchange = event => command({ action: "mute-player", muted: event.target.checked });
document.getElementById("desktopReceiver").onclick = () => command({ action: "open-desktop-receiver" });
for (const button of document.querySelectorAll("[data-twitch]")) button.onclick = () => command({ action: "twitch", op: button.dataset.twitch });
for (const button of document.querySelectorAll("[data-youtube]")) button.onclick = () => send("publisher", { type: "youtube", func: button.dataset.youtube, args: button.dataset.youtube === "seekTo" ? [30, true] : [] });
document.getElementById("fanout").onclick = () => command({ action: "open-device-output", deviceIds: [...document.querySelectorAll("#devices input:checked")].map(input => input.value) });
for (const input of document.querySelectorAll("[data-manual]")) input.onchange = () => report("manual", { [input.dataset.manual]: input.checked });
document.getElementById("notes").onchange = event => report("manual", { notes: event.target.value.slice(0, 500) });
navigator.mediaDevices.enumerateDevices().then(devices => {
  const host = document.getElementById("devices");
  for (const device of devices.filter(candidate => candidate.kind === "audiooutput" && candidate.deviceId !== "default" && candidate.deviceId !== "communications")) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox"; input.value = device.deviceId;
    label.append(input, " " + (device.label || "Unnamed output"));
    host.append(label);
  }
});
let latest = "";
setInterval(async () => {
  try { latest = JSON.stringify(await api("/results"), null, 2); document.getElementById("results").value = latest; } catch {}
}, 1000);
document.getElementById("copy").onclick = async () => {
  await navigator.clipboard.writeText(latest);
  document.getElementById("copied").textContent = " Copied.";
};
`);
}

export function providerUrl(source: Exclude<CheckSource, { kind: "pattern" }>, origin: string, parentHost: string): string {
  switch (source.kind) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${source.videoId}?${new URLSearchParams({ enablejsapi: "1", autoplay: "1", playsinline: "1", rel: "0", origin }).toString()}`;
    case "twitch-clip":
      return `https://clips.twitch.tv/embed?${new URLSearchParams({ clip: source.clipSlug, parent: parentHost, autoplay: "true", muted: "false" }).toString()}`;
    case "twitch-vod":
      return `https://player.twitch.tv/?${new URLSearchParams({ video: `v${source.videoId}`, parent: parentHost, autoplay: "true", muted: "false" }).toString()}`;
  }
}

