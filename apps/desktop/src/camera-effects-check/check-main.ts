import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { release } from "node:os";
import { join, resolve } from "node:path";
import { app, BrowserWindow, session } from "electron";
import { z } from "zod";
import {
  cameraListSchema, commandSchema, defaultPipelineSettings, gpuBlockReason, openResultSchema, probeResultSchema, publisherEnvelopeSchema,
  receiverEnvelopeSchema, receiverIdSchema, reportSchema, type Command, type Layout, type PipelineSettings, type ReceiverState
} from "./check-protocol.js";
import { createResults, recordMetrics, recordReport, runKey } from "./check-results.js";
import { CheckInputError, pathAfterToken, readJsonBody, sendHtml, sendJson, staticFiles } from "./check-server.js";
import { sceneHeight, sceneWidth } from "./frame-layout.js";
import { sampleGpuEngines } from "./gpu-usage.js";
import { barcodePage, blockedPage, controlPage, pipelinePage, receiverPage } from "./pages.js";
import { SignalMailbox } from "../video-mirror-check/signal-mailbox.js";

/*
 * Feasibility check for the camera effects module (BL-068). Started with
 * `--camera-effects-check`; it runs instead of the normal app, with GPU acceleration on and
 * its own temporary profile, changes no Stream Jams settings, and serves its pages on
 * 127.0.0.1 only, under a per-run token path.
 */

export const cameraEffectsCheckSwitch = "--camera-effects-check";

const partitionName = "camera-effects-check";

export async function runCameraEffectsCheck(): Promise<void> {
  app.setPath("userData", join(app.getPath("temp"), "stream-jams-camera-effects-check"));
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  await app.whenReady();

  const token = randomBytes(24).toString("base64url");
  const info = await app.getGPUInfo("basic").catch((error: unknown) => ({ error: String(error) }));
  // Feature status reads as software until the GPU process has started, a few seconds after ready.
  let featureStatus = app.getGPUFeatureStatus() as unknown as Record<string, string>;
  for (let waited = 0; waited < 15_000 && gpuBlockReason(featureStatus) !== null; waited += 250) {
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
    featureStatus = app.getGPUFeatureStatus() as unknown as Record<string, string>;
  }
  let blocked = gpuBlockReason(featureStatus);
  const results = createResults({
    platform: process.platform, windows: release(), arch: process.arch,
    electron: process.versions.electron, chrome: process.versions.chrome, date: new Date().toISOString().slice(0, 10)
  }, { featureStatus, blocked, info: (info as { gpuDevice?: unknown }).gpuDevice ?? info });

  let camera: { label: string; width: number; height: number } | null = null;
  let settings: PipelineSettings = defaultPipelineSettings;
  let layout: Layout = { x: 0, y: 0, width: sceneWidth, height: sceneHeight };
  const currentRun = () => runKey(camera, settings.pack, results.scenario);
  const recordError = (role: string, message: string) => recordReport(results, currentRun(), { kind: "error", data: { role, message: message.slice(0, 500) } });
  app.on("child-process-gone", (_event, details) => recordError("process", `${details.type} ${details.reason} (${details.exitCode})`));

  const mailbox = new SignalMailbox();
  const files = await staticFiles(resolve(import.meta.dirname, "app"));
  let serverOrigin = "";
  let origin = "";

  const partition = session.fromPartition(partitionName);
  // Only the check's own pages may use the camera.
  partition.setPermissionCheckHandler((_contents, permission, requestingOrigin) => permission === "media" && requestingOrigin === serverOrigin);
  partition.setPermissionRequestHandler((contents, permission, callback) => callback(permission === "media" && contents.getURL().startsWith(`${origin}/`)));

  const windowOptions = { partition: partitionName, sandbox: true, contextIsolation: true, backgroundThrottling: false } as const;
  let pipeline: BrowserWindow | null = null;
  let desktopReceiver: BrowserWindow | null = null;
  let barcode: BrowserWindow | null = null;

  async function callPipeline<T>(schema: z.ZodType<T>, expression: string): Promise<T> {
    if (pipeline === null || pipeline.isDestroyed()) throw new CheckInputError("The pipeline window is closed; run the check again.");
    await pipeline.webContents.executeJavaScript("window.cameraCheckReady", true);
    const parsed = schema.safeParse(await pipeline.webContents.executeJavaScript(expression, true));
    if (!parsed.success) throw new CheckInputError(`The pipeline returned an unexpected result: ${parsed.error.message.slice(0, 200)}`);
    return parsed.data;
  }
  const call = (method: string, ...args: unknown[]) => `window.cameraCheck.${method}(${args.map(arg => JSON.stringify(arg)).join(", ")})`;

  async function runCommand(command: Command): Promise<unknown> {
    switch (command.action) {
      case "list-cameras": return callPipeline(cameraListSchema, call("list"));
      case "probe": {
        camera = null;
        const probe = await callPipeline(probeResultSchema, call("probe", command.deviceId));
        if (Object.keys(results.cameras).length < 8 || probe.label in results.cameras) results.cameras[probe.label] = probe;
        return probe;
      }
      case "open": {
        const opened = await callPipeline(openResultSchema, call("open", command.deviceId, command.width, command.height, command.frameRate));
        if (results.opened.length < 40) results.opened.push(opened);
        camera = opened.ok ? { label: opened.label, width: opened.width, height: opened.height } : null;
        return opened;
      }
      case "configure":
        settings = command.settings;
        await callPipeline(z.undefined(), call("configure", settings));
        return {};
      case "layout": layout = command.layout; return {};
      case "scenario": results.scenario = { name: command.scenario, game: command.game }; return {};
      case "show-pipeline":
        if (pipeline !== null && !pipeline.isDestroyed()) { if (command.visible) pipeline.show(); else pipeline.hide(); }
        return {};
      case "open-desktop-receiver":
        desktopReceiver?.destroy();
        // Transparent and frameless like the product's desktop overlay, so a packed matte shows the desktop through.
        desktopReceiver = new BrowserWindow({ width: 960, height: 540, transparent: true, frame: false, hasShadow: false, alwaysOnTop: true, title: "Camera check desktop receiver", webPreferences: windowOptions });
        lockNavigation(desktopReceiver);
        await desktopReceiver.loadURL(`${origin}/receiver?label=desktop`);
        return {};
      case "close-desktop-receiver":
        desktopReceiver?.destroy();
        desktopReceiver = null;
        return {};
      case "open-barcode-screen":
        if (barcode === null || barcode.isDestroyed()) {
          barcode = new BrowserWindow({ width: 1280, height: 720, title: "Camera check timing screen", autoHideMenuBar: true, webPreferences: windowOptions });
          lockNavigation(barcode);
          await barcode.loadURL(`${origin}/barcode`);
        }
        barcode.show();
        return {};
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = pathAfterToken(url.pathname, token);
    if (path === null) { sendJson(response, 403, { error: "Forbidden" }); return; }
    const route = `${request.method ?? "GET"} ${path}`;
    switch (route) {
      case "GET /control": sendHtml(response, blocked === null ? controlPage() : blockedPage(blocked)); return;
      case "GET /pipeline": sendHtml(response, pipelinePage()); return;
      case "GET /receiver": sendHtml(response, receiverPage()); return;
      case "GET /barcode": sendHtml(response, barcodePage()); return;
      case "GET /results": sendJson(response, 200, results); return;
      case "GET /state": sendJson(response, 200, { camera: camera === null ? null : { width: camera.width, height: camera.height }, packed: settings.pack, layout } satisfies ReceiverState); return;
      case "POST /report": {
        const parsed = reportSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw new CheckInputError("Invalid report");
        recordReport(results, currentRun(), parsed.data);
        sendJson(response, 200, {});
        return;
      }
      case "POST /command": {
        const parsed = commandSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw new CheckInputError("Invalid command");
        sendJson(response, 200, await runCommand(parsed.data));
        return;
      }
    }
    const file = request.method === "GET" ? files.get(path) : undefined;
    if (file !== undefined) {
      response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
      response.end(await readFile(file.path));
      return;
    }
    const role = /^\/signal\/(publisher|receiver:[a-z0-9-]{1,40})$/u.exec(decodeURIComponent(path))?.[1];
    if (role === undefined || (role !== "publisher" && !receiverIdSchema.safeParse(role.slice("receiver:".length)).success)) { sendJson(response, 404, { error: "Not found" }); return; }
    if (request.method === "GET") { sendJson(response, 200, mailbox.read(role, Number(url.searchParams.get("after") ?? 0) || 0)); return; }
    if (request.method === "POST") {
      const parsed = (role === "publisher" ? publisherEnvelopeSchema : receiverEnvelopeSchema).safeParse(await readJsonBody(request));
      if (!parsed.success) throw new CheckInputError("Invalid signal");
      sendJson(response, 200, { sequence: mailbox.post(role, parsed.data) });
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Request failed";
      if (!(error instanceof CheckInputError)) recordError("server", message);
      if (!response.headersSent) sendJson(response, error instanceof CheckInputError ? 400 : 500, { error: message });
    });
  });
  await new Promise<void>(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  serverOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  origin = `${serverOrigin}/${token}`;

  let gpuSampling = false;
  let lastGpu: Awaited<ReturnType<typeof sampleGpuEngines>> = null;
  setInterval(() => {
    const processes = app.getAppMetrics();
    if (!gpuSampling) {
      gpuSampling = true;
      void sampleGpuEngines(new Set(processes.map(metric => metric.pid))).then(sample => { lastGpu = sample; gpuSampling = false; });
    }
    recordMetrics(results, currentRun(), {
      cpuPercent: processes.reduce((total, metric) => total + metric.cpu.percentCPUUsage, 0),
      memoryMb: processes.reduce((total, metric) => total + metric.memory.workingSetSize, 0) / 1024,
      gpu: lastGpu
    });
  }, 2000).unref();

  const control = new BrowserWindow({ width: 1060, height: 940, title: "Stream Jams camera effects check", webPreferences: { partition: partitionName, sandbox: true, contextIsolation: true } });
  lockNavigation(control);
  // Closing the control window ends the check, including the camera and every receiver window.
  control.on("closed", () => {
    server.close();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(0);
  });
  if (blocked === null) {
    pipeline = new BrowserWindow({ width: 1280, height: 520, title: "Camera check pipeline", webPreferences: windowOptions });
    lockNavigation(pipeline);
    pipeline.webContents.on("render-process-gone", (_event, details) => recordError("pipeline", `renderer ${details.reason}`));
    await pipeline.loadURL(`${origin}/pipeline`);
    // The pipeline's own WebGL2 context is the final word: a software renderer blocks the check too.
    const webgl = z.object({ renderer: z.string().max(200), software: z.boolean() }).safeParse(
      await pipeline.webContents.executeJavaScript("window.cameraCheckReady", true).catch((error: unknown) => ({ error: String(error) })));
    results.gpu.renderer = webgl.success ? webgl.data.renderer : "none";
    if (!webgl.success || webgl.data.software) {
      blocked = webgl.success ? `WebGL runs in software (${webgl.data.renderer}). The camera check does not run in software.` : "The pipeline could not create a WebGL2 context. The camera check does not run in software.";
      results.gpu.blocked = blocked;
      pipeline.destroy();
      pipeline = null;
    }
  }
  await control.loadURL(`${origin}/control`);
}

function lockNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
}
