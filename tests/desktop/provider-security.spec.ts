import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { cleanupFailedOverlayLaunch } from "./overlay-harness.js";
import { cp, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { alertEditorDocumentSchema, compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle, createDefaultTextWarp, type SurfaceSettingsView } from "@stream-jams/core";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { finishDesktop, windowByUrl } from "./audio-harness.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
test("packaged management and browser-source renderers preserve CSP-safe warped fonts", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-provider-security-"));
  const listener = createServer();
  await new Promise<void>(resolveListen => listener.listen(0, "127.0.0.1", resolveListen));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated port");
  const port = address.port;
  await new Promise<void>(resolveClose => listener.close(() => resolveClose()));
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }, playback: { paused: false, muted: true, doNotDisturb: false } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  const packageExecutable = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
  const executable = join(root, "app/Stream Jams.exe");
  let ownedDesktop: ElectronApplication | undefined;
  let child: ChildProcess | undefined;
  const pids: number[] = [];
  const base = `http://127.0.0.1:${port}`;
  let overlayKeyId: string | undefined;
  let headers: Record<string, string> | undefined;
  const failures: unknown[] = [];
  try {
    try { await promisify(execFile)("robocopy.exe", [dirname(packageExecutable), join(root, "app"), "/E", "/MT:8", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { timeout: 120000, windowsHide: true }); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "number" || error.code >= 8) throw error; }
    const desktop = ownedDesktop = await _electron.launch({ executablePath: executable, cwd: root, env, chromiumSandbox: true });
    child = desktop.process(); if (child.pid !== undefined) pids.push(child.pid);
    pids.push(await desktop.evaluate(() => process.pid));
    await desktop.context().addInitScript(() => {
      const violations: string[] = [];
      Object.assign(window, { privateSecurityViolations: violations });
      document.addEventListener("securitypolicyviolation", event => violations.push(event.violatedDirective));
    });
    await desktop.evaluate(({ app, BrowserWindow }) => {
      const silence = (window: Electron.BrowserWindow) => { window.hide(); window.webContents.setAudioMuted(true); window.show = () => {}; window.showInactive = () => {}; };
      BrowserWindow.getAllWindows().forEach(silence);
      app.on("browser-window-created", (_event, window) => silence(window));
    });
    const management = await windowByUrl(desktop, `${base}/manage`);
    const errors: string[] = [];
    management.on("pageerror", error => errors.push(error.message));
    const response = await fetch(`${base}/manage`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-eval");
    const session = await (await fetch(`${base}/auth/management/sessions`, { method: "POST" })).json() as { id: string; csrfToken: string };
    headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: base };
    const api = async (path: string, method = "GET", body?: unknown) => {
      const result = await fetch(base + path, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      expect(result.ok, `${method} ${path}: ${result.status} ${result.ok ? "" : await result.clone().text()}`).toBe(true); return result.json();
    };
    const set = await api("/management/alert-sets", "POST", { name: "Packaged security fixture" }) as { id: string };
    const alert = await api(`/management/alert-sets/${set.id}/alerts`, "POST", { name: "Warp fixture", eventType: "follow" }) as { id: string };
    const original = alertEditorDocumentSchema.parse(await api(`/management/alerts/${alert.id}/editor`));
    let alertDocument = alertEditorDocumentSchema.parse({ ...original, enabled: true, durationMs: 10000,
      layers: [{ id: "message", name: "Message", type: "text", visible: true, order: 0, template: "Packaged {actor.displayName}", textStyle: { ...compatibilityAlertTextStyle, warp: { ...createDefaultTextWarp(), points: createDefaultTextWarp().points.map((point, index) => index === 4 ? { ...point, x: .65 } : point) }, color: "#FF00FFFF" }, boxStyle: compatibilityAlertTextBoxStyle, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 300, delayMs: 0, easing: "ease-out" } }],
      targetProfiles: [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "message", x: 100, y: 300, width: 1000, height: 280, zIndex: 0 }] }, { id: "vertical", enabled: false, reviewState: "ready", layerLayouts: [] }],
      samplePayloads: [{ id: "fixture", label: "Fixture", kind: "built-in", payload: { actor: { displayName: "Font" } } }]
    });
    await api(`/management/alerts/${alert.id}/editor`, "PUT", { document: alertDocument });
    await management.goto(`${base}/manage/modules/alerts/editor/${alert.id}?profile=landscape`);
    await management.getByRole("button", { name: "Message Text", exact: true }).click();
    await management.locator("summary").filter({ hasText: "Typography" }).click();
    const fontImported = management.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/assets/import"));
    await management.getByLabel("Upload reusable font", { exact: true }).setInputFiles(resolve("apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2"));
    const importedFont = await fontImported;
    expect(importedFont.status()).toBe(201);
    const font = await importedFont.json() as { id: string };
    await expect(management.getByLabel("Uploaded font", { exact: true })).not.toHaveValue("");
    await expect(management.getByLabel("Uploaded font", { exact: true })).toHaveValue(font.id);
    const editorSaved = management.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/management/alerts/${alert.id}/editor`));
    await management.getByRole("button", { name: "Save", exact: true }).click();
    expect((await editorSaved).status()).toBe(200);
    alertDocument = alertEditorDocumentSchema.parse(await api(`/management/alerts/${alert.id}/editor`));
    expect(alertDocument.layers[0]).toMatchObject({ type: "text", textStyle: { fontAssetId: font.id } });
    await management.goto(`${base}/manage/modules/alerts/editor/${alert.id}?profile=landscape`);
    const preview = management.getByRole("region", { name: "Landscape alert canvas" }).getByRole("img", { name: "Packaged Font" });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
    const output = await api("/management/overlay-outputs/keys", "POST", { scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" }) as { keyId: string; url: string };
    overlayKeyId = output.keyId;
    const overlayResponse = await fetch(output.url);
    expect(overlayResponse.headers.get("content-security-policy")).toBeNull();
    expect(overlayResponse.headers.get("x-frame-options")).toBeNull();
    const opened = desktop.waitForEvent("window");
    await desktop.evaluate(async ({ BrowserWindow }, url) => {
      const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
      window.webContents.setAudioMuted(true); await window.loadURL(url);
    }, output.url);
    const overlay = await opened;
    overlay.on("pageerror", error => errors.push(error.message));
    await expect.poll(async () => (await api("/management/overlay-clients") as unknown[]).length).toBeGreaterThan(0);
    const capabilities = await api("/overlay-surfaces") as SurfaceSettingsView;
    expect(capabilities.desktop.available).toBe(true);
    const display = capabilities.desktop.displays[0];
    const surface = capabilities.surfaces.find(candidate => candidate.kind === "desktop");
    expect(display).toBeDefined(); expect(surface).toBeDefined();
    await api(`/overlay-surfaces/${surface!.id}`, "PUT", { id: surface!.id, kind: "desktop", enabled: true, displayId: display!.id, autoFollowDisplayName: false, opacity: surface!.opacity, layers: surface!.layers.map(layer => layer.moduleId === "alerts" ? { ...layer, visible: true } : layer) });
    await api(`/management/alerts/${alert.id}/editor/test`, "POST", { document: alertDocument, targetProfileId: "landscape", samplePayload: { actor: { displayName: "Renderer" } }, includeAudio: false, includeTts: false });
    const privateOverlay = await windowByUrl(desktop, "stream-jams-overlay://surface/");
    privateOverlay.on("pageerror", error => errors.push(error.message));
    const rendered = overlay.getByRole("img", { name: "Packaged Renderer" });
    await expect(rendered).toBeVisible();
    await expect.poll(() => rendered.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
    expect(await overlay.evaluate(() => [...document.fonts].some(face => face.family.startsWith("stream-jams-font-") && face.status === "loaded"))).toBe(true);
    const privateRendered = privateOverlay.getByRole("img", { name: "Packaged Renderer" });
    await expect(privateRendered).toBeVisible();
    await expect.poll(() => privateRendered.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
    expect(await privateOverlay.evaluate(() => [...document.fonts].some(face => face.family.startsWith("stream-jams-font-") && face.status === "loaded"))).toBe(true);
    expect(await privateOverlay.evaluate(() => Reflect.get(window, "privateSecurityViolations") as unknown)).toEqual([]);
    await management.evaluate(url => new Promise<void>(resolveLoad => { const frame = document.createElement("iframe"); frame.addEventListener("load", () => resolveLoad(), { once: true }); frame.src = url; document.body.append(frame); }), `${base}/operator`);
    expect(await management.locator("iframe").evaluate((frame: HTMLIFrameElement) => frame.contentDocument === null)).toBe(true);
    expect(errors).toEqual([]);
  } catch (error) { failures.push(error); } finally {
    try {
    if (overlayKeyId !== undefined && headers !== undefined) { const revoked = await fetch(`${base}/management/overlay-outputs/keys/${overlayKeyId}`, { method: "DELETE", headers }); expect(revoked.ok, `Fixture key cleanup: ${revoked.status} ${await revoked.text()}`).toBe(true); }
    } catch (error) { failures.push(error); }
    try { if (failures.length && await readFile(join(root, "config.json")).then(() => true, () => false)) { await cp(join(root, "data/logs"), test.info().outputPath("runtime-logs"), { recursive: true }).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); } }
    catch (error) { failures.push(error); }
    try {
      if (ownedDesktop !== undefined) await finishDesktop(ownedDesktop, root, pids, child);
      else { await cleanupFailedOverlayLaunch(executable); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "Packaged security acceptance failed");
});
