import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { release } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, session, type WebFrameMain } from "electron";
import { parseVideoLink } from "@stream-jams/core/videos";
import { controlPage, playerPage, providerUrl, receiverPage, type CheckSource } from "./check-pages.js";
import { SignalMailbox } from "./signal-mailbox.js";

/*
 * Windows feasibility check for the Videos desktop mirror (OpenSpec add-video-request-queue 1.2).
 * Started with `--video-mirror-check`; it runs instead of the normal app, uses its own
 * profile, and serves its pages on 127.0.0.1 only behind a per-run token.
 */

export const videoMirrorCheckSwitch = "--video-mirror-check";
export const videoMirrorCheckGpuSwitch = "--video-mirror-check-gpu";

type AudioMode = "frame" | "loopback" | "loopbackWithMute";
type Results = Record<string, unknown>;

const maximumBodyBytes = 64 * 1024;

export async function runVideoMirrorCheck(): Promise<void> {
  app.setPath("userData", join(app.getPath("temp"), "stream-jams-video-mirror-check"));
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  await app.whenReady();

  const token = randomBytes(18).toString("base64url");
  const mailbox = new SignalMailbox();
  const results: Results = {
    environment: {
      platform: process.platform, windows: release(), arch: process.arch,
      electron: process.versions.electron, chrome: process.versions.chrome,
      hardwareAcceleration: process.argv.includes(videoMirrorCheckGpuSwitch)
    },
    youtubeMessages: [] as unknown[],
    errors: [] as unknown[]
  };
  const record = (kind: string, data: unknown) => {
    if (kind === "youtube-message") { pushBounded(results.youtubeMessages as unknown[], data); return; }
    if (kind === "error") { pushBounded(results.errors as unknown[], data); return; }
    if (kind === "manual") { results.manual = { ...(results.manual as object | undefined), ...(data as object) }; return; }
    // Per-source results, so one run can compare the test pattern, YouTube and Twitch.
    const bySource = (results.bySource ??= {}) as Record<string, Record<string, unknown>>;
    const current = (bySource[sourceKind] ??= {});
    if (kind === "receiver-stats") { current.receivers = { ...(current.receivers as object | undefined), [(data as { receiver: string }).receiver]: data }; return; }
    if (kind === "publisher-stats" || kind === "fan-out" || kind === "player-loaded" || kind.startsWith("twitch-")) { current[kind] = data; return; }
    results[kind] = data;
  };
  let sourceKind = "none";

  const partition = session.fromPartition("video-mirror-check");
  let audioMode: AudioMode = "frame";
  partition.setPermissionCheckHandler(() => true);
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(true));
  partition.setDisplayMediaRequestHandler((request, callback) => {
    const frame = request.frame;
    if (frame === null || player === null || frame !== player.webContents.mainFrame) {
      record("capture-request", { granted: false, reason: "not-the-player-frame" });
      callback({});
      return;
    }
    record("capture-request", { granted: true, audioMode, audioRequested: request.audioRequested, userGesture: request.userGesture });
    callback({ video: frame, audio: audioMode === "frame" ? frame : audioMode });
  });

  let player: BrowserWindow | null = null;
  let playerSettings: { readonly host: string; readonly audioMode: AudioMode; readonly show: boolean } | null = null;
  let capturing = false;
  let origin = "";
  async function startCapture(): Promise<void> {
    if (player === null || player.isDestroyed()) throw new CheckInputError("Load the player first.");
    // getDisplayMedia needs a user gesture; the main process supplies one.
    await player.webContents.executeJavaScript("window.__startCapture()", true);
    capturing = true;
  }
  const metrics = { samples: 0, peakCpuPercent: 0, totalCpuPercent: 0, peakMemoryMb: 0 };
  setInterval(() => {
    const processes = app.getAppMetrics();
    const cpu = processes.reduce((total, metric) => total + metric.cpu.percentCPUUsage, 0);
    const memoryMb = processes.reduce((total, metric) => total + metric.memory.workingSetSize, 0) / 1024;
    metrics.samples += 1;
    metrics.totalCpuPercent += cpu;
    metrics.peakCpuPercent = Math.max(metrics.peakCpuPercent, cpu);
    metrics.peakMemoryMb = Math.max(metrics.peakMemoryMb, memoryMb);
    results.metrics = {
      averageCpuPercent: Math.round(metrics.totalCpuPercent / metrics.samples), peakCpuPercent: Math.round(metrics.peakCpuPercent),
      peakMemoryMb: Math.round(metrics.peakMemoryMb), gpuProcess: processes.some(metric => metric.type === "GPU")
    };
  }, 2000).unref();

  const commands = {
    async "load-player"(body: Record<string, unknown>) {
      const source = readSource(body.source);
      if (source === null) throw new CheckInputError("That link or ID was not recognized.");
      audioMode = body.audio === "loopback" || body.audio === "loopbackWithMute" ? body.audio : "frame";
      const host = body.host === "localhost" ? "localhost" : "127.0.0.1";
      const show = body.show === true;
      const playerOrigin = origin.replace("127.0.0.1", host);
      sourceKind = source.kind;
      if (player !== null && !player.isDestroyed() && playerSettings?.host === host && playerSettings.audioMode === audioMode && playerSettings.show === show) {
        // Same window: swap the source inside it so the capture and every mirror connection carry on.
        record("player", { source: source.kind, host, audioMode, visible: show, reused: true });
        const url = source.kind === "pattern" ? "" : providerUrl(source, playerOrigin, host);
        await player.webContents.executeJavaScript(`window.__setSource(${JSON.stringify(source)}, ${JSON.stringify(url)})`, true);
        return;
      }
      const wasCapturing = capturing;
      capturing = false;
      player?.destroy();
      // A new player page reads the publisher mailbox from the start, so old signaling must not replay.
      mailbox.clear();
      playerSettings = { host, audioMode, show };
      player = new BrowserWindow({
        width: 1280, height: 720, useContentSize: true, show: body.show === true, title: "Video mirror check player",
        webPreferences: { partition: "video-mirror-check", sandbox: true, contextIsolation: true, backgroundThrottling: false }
      });
      lockNavigation(player);
      record("player", { source: source.kind, host, audioMode, visible: show, reused: false });
      await player.loadURL(`${playerOrigin}/player?${new URLSearchParams({ t: token, source: JSON.stringify(source), host })}`);
      // A new window means a new capture; mirrors reconnect on their own once it is ready.
      if (wasCapturing) await startCapture();
    },
    async "stop-player"() {
      if (player === null || player.isDestroyed()) return;
      await player.webContents.executeJavaScript(`window.__setSource({ "kind": "none" }, "")`, true);
    },
    async "start-capture"() {
      await startCapture();
    },
    async "open-desktop-receiver"() {
      const receiver = new BrowserWindow({
        width: 960, height: 540, title: "Desktop overlay receiver",
        webPreferences: { partition: "video-mirror-check", sandbox: true, contextIsolation: true, backgroundThrottling: false }
      });
      lockNavigation(receiver);
      await receiver.loadURL(`${origin}/receiver?${new URLSearchParams({ t: token, label: "desktop" })}`);
    },
    async twitch(body: Record<string, unknown>) {
      if (player === null || player.isDestroyed()) throw new CheckInputError("Load a Twitch source first.");
      const frames = player.webContents.mainFrame.framesInSubtree.filter(isTwitchFrame);
      const op = body.op === "pause" || body.op === "play" || body.op === "seek" ? body.op : "probe";
      const outcomes: unknown[] = [];
      for (const frame of frames) outcomes.push(await frame.executeJavaScript(twitchScript(op), true).catch((error: unknown) => ({ error: String(error) })));
      record(`twitch-${op}`, { frames: frames.length, outcomes });
    }
  } satisfies Record<string, (body: Record<string, unknown>) => Promise<void>>;

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) send(response, error instanceof CheckInputError ? 400 : 500, { error: error instanceof Error ? error.message : "Request failed" });
    });
  });
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.searchParams.get("t") !== token) { send(response, 403, { error: "Forbidden" }); return; }
    const route = `${request.method ?? "GET"} ${url.pathname}`;
    if (route === "GET /control") { html(response, controlPage()); return; }
    if (route === "GET /receiver") { html(response, receiverPage()); return; }
    if (route === "GET /player") {
      const source = readSource(safeJson(url.searchParams.get("source") ?? ""));
      if (source === null) { send(response, 400, { error: "Invalid source" }); return; }
      const host = url.searchParams.get("host") === "localhost" ? "localhost" : "127.0.0.1";
      html(response, playerPage(source, origin.replace("127.0.0.1", host), host));
      return;
    }
    if (route === "GET /results") { send(response, 200, results); return; }
    const signal = /^\/signal\/([\w:.-]{1,64})$/u.exec(decodeURIComponent(url.pathname));
    if (signal !== null && request.method === "GET") { send(response, 200, mailbox.read(signal[1]!, Number(url.searchParams.get("after") ?? 0) || 0)); return; }
    const body = request.method === "POST" ? await readBody(request) : null;
    if (signal !== null && body !== null) { send(response, 200, { sequence: mailbox.post(signal[1]!, body) }); return; }
    if (route === "POST /report" && body !== null) { record(String(body.kind ?? "unknown").slice(0, 32), body.data); send(response, 200, {}); return; }
    if (route === "POST /command" && body !== null) {
      const action = commands[String(body.action) as keyof typeof commands] as ((input: Record<string, unknown>) => Promise<void>) | undefined;
      if (action === undefined) { send(response, 404, { error: "Unknown command" }); return; }
      await action(body);
      send(response, 200, {});
      return;
    }
    send(response, 404, { error: "Not found" });
  }
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const control = new BrowserWindow({
    width: 1040, height: 900, title: "Stream Jams video mirror check",
    webPreferences: { partition: "video-mirror-check", sandbox: true, contextIsolation: true }
  });
  lockNavigation(control);
  // Closing the check window ends everything, including the hidden player and its sound.
  control.on("closed", () => {
    server.close();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(0);
  });
  await control.loadURL(`${origin}/control?t=${token}`);
}

class CheckInputError extends Error {}

function readSource(value: unknown): CheckSource | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { readonly kind?: unknown; readonly value?: unknown; readonly videoId?: unknown; readonly clipSlug?: unknown };
  if (candidate.kind === "pattern") return { kind: "pattern" };
  // Accept a bare ID or slug, or a full link checked by the same allowlist the product uses.
  const raw = typeof candidate.value === "string" ? candidate.value.trim()
    : typeof candidate.videoId === "string" ? candidate.videoId : typeof candidate.clipSlug === "string" ? candidate.clipSlug : "";
  if (candidate.kind === "youtube") {
    if (/^[A-Za-z0-9_-]{11}$/u.test(raw)) return { kind: "youtube", videoId: raw };
    const parsed = parseVideoLink(raw, { allowedDirectHosts: [] });
    return parsed.status === "accepted" && parsed.source.provider === "youtube" ? { kind: "youtube", videoId: parsed.source.videoId } : null;
  }
  if (candidate.kind === "twitch-clip") {
    if (/^[A-Za-z0-9_-]{1,100}$/u.test(raw)) return { kind: "twitch-clip", clipSlug: raw };
    const parsed = parseVideoLink(raw, { allowedDirectHosts: [] });
    return parsed.status === "accepted" && parsed.source.provider === "twitch-clip" ? { kind: "twitch-clip", clipSlug: parsed.source.clipSlug } : null;
  }
  if (candidate.kind === "twitch-vod") {
    if (/^\d{1,20}$/u.test(raw)) return { kind: "twitch-vod", videoId: raw };
    const parsed = parseVideoLink(raw, { allowedDirectHosts: [] });
    return parsed.status === "accepted" && parsed.source.provider === "twitch-vod" ? { kind: "twitch-vod", videoId: parsed.source.videoId } : null;
  }
  return null;
}

function isTwitchFrame(frame: WebFrameMain): boolean {
  const host = URL.canParse(frame.url) ? new URL(frame.url).hostname : "";
  return host === "clips.twitch.tv" || host === "player.twitch.tv";
}

/** Runs inside the Twitch frame: reports what the `<video>` element allows, and applies the operation. */
function twitchScript(op: "probe" | "pause" | "play" | "seek"): string {
  return `(async () => {
    const video = document.querySelector("video");
    if (video === null) return { video: false };
    const before = { paused: video.paused, time: Math.round(video.currentTime * 10) / 10, duration: Math.round(video.duration * 10) / 10 };
    if (${JSON.stringify(op)} === "pause") video.pause();
    if (${JSON.stringify(op)} === "play") await video.play().catch(error => ({ error: String(error) }));
    if (${JSON.stringify(op)} === "seek") video.currentTime = Math.min(video.currentTime + 10, Number.isFinite(video.duration) ? video.duration - 1 : video.currentTime + 10);
    await new Promise(resolve => setTimeout(resolve, 600));
    return { video: true, before, after: { paused: video.paused, time: Math.round(video.currentTime * 10) / 10 } };
  })()`;
}

function lockNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
}

function pushBounded(list: unknown[], value: unknown): void {
  if (list.length < 40) list.push(value);
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  // error-provenance: allow expected -- a malformed source parameter is answered with 400 by the caller
  catch { return null; }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).byteLength;
    if (size > maximumBodyBytes) throw new CheckInputError("Body too large");
    chunks.push(chunk as Buffer);
  }
  const parsed = safeJson(Buffer.concat(chunks).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new CheckInputError("Expected a JSON object");
  return parsed as Record<string, unknown>;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function html(response: ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "origin" });
  response.end(body);
}
