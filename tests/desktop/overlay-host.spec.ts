import type { ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AlertEditorDocument, AlertRule, SurfaceSettingsView } from "../../packages/core/dist/index.js";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { windowByUrl } from "./audio-harness.js";

const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
const overlayUrl = "stream-jams-overlay://surface/";
// Never capture management session headers, route keys, or fixture response bodies.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("packaged production host renders an isolated silent Landscape event without OBS", async () => {
  await access(executablePath);
  const packageSha256 = createHash("sha256").update(await readFile(join(dirname(executablePath), "resources", "app.asar"))).digest("hex");
  const root = await mkdtemp(join(tmpdir(), "stream-jams-overlay-host-"));
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  const evidencePath = join(root, "process-evidence.json");
  await writeFile(configPath, JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") },
    playback: { paused: false, muted: true, doNotDisturb: false }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  env.STREAM_JAMS_SHUTDOWN_LOG = join(root, "shutdown.jsonl");
  let desktop: ElectronApplication | undefined;
  let child: ChildProcess | undefined;
  let mainPid: number | null = null;
  const pids = new Set<number>();
  const failures: unknown[] = [];
  const startedAt = new Date().toISOString();
  const evidence = async (phase: string) => writeFile(evidencePath, JSON.stringify({
    phase, executablePath, root, port, startedAt, observedAt: new Date().toISOString(),
    launcherPid: child?.pid ?? null, mainPid, packageSha256, capturedPids: [...pids], exitCode: child?.exitCode ?? null, signalCode: child?.signalCode ?? null
  }, null, 2));
  await evidence("before-launch");
  try {
    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    if (child.pid !== undefined) pids.add(child.pid);
    mainPid = await desktop.evaluate(() => process.pid);
    pids.add(mainPid);
    await evidence("launched");
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await expect(management.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    const base = `http://127.0.0.1:${port}`;
    const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
    expect(sessionResponse.ok).toBe(true);
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" };
    async function api<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, { method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(5000) });
      expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
      return response.json() as Promise<T>;
    }
    const capabilities = await api<SurfaceSettingsView>("/overlay-surfaces");
    expect(capabilities.desktop.available).toBe(true);
    const firstDisplay = capabilities.desktop.displays[0];
    expect(firstDisplay, "A connected display is required; do not silently fall back").toBeDefined();
    expect(desktop.windows().some(page => page.url() === overlayUrl)).toBe(false);
    await management.getByRole("link", { name: "Settings", exact: true }).click();
    const panel = management.getByRole("form", { name: "Desktop overlay", exact: true });
    await expect(panel.getByLabel("Desktop display")).toBeEnabled();
    await panel.getByLabel("Desktop display").selectOption(firstDisplay!.id);
    await panel.getByLabel("Enable desktop overlay").check();
    await panel.getByRole("checkbox", { name: "Show alerts on Desktop overlay", exact: true }).check();
    await panel.getByRole("button", { name: "Save Desktop overlay", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Save Desktop overlay", exact: true })).toBeDisabled();
    await expect.poll(async () => (await api<SurfaceSettingsView>("/overlay-surfaces")).surfaces.find(surface => surface.kind === "desktop")).toMatchObject({ enabled: true, displayId: firstDisplay!.id });

    const home = await api<{ activeAlertSet: { active: boolean } }>("/management/home");
    expect(home.activeAlertSet.active).toBe(true);
    const rule = (await api<AlertRule[]>("/alerts/rules")).find(candidate => candidate.eventType === "follow")!;
    const document = await api<AlertEditorDocument>(`/management/alerts/${rule.id}/editor`);
    const layer = document.layers.find(candidate => candidate.type === "text")!;
    const edited: AlertEditorDocument = {
      ...document, enabled: true, durationMs: 12000,
      layers: [{ ...layer, template: "Neutral desktop {actor.displayName}" }],
      targetProfiles: document.targetProfiles.map(profile => profile.id === "landscape" ? {
        ...profile, enabled: true, reviewState: "ready", layerLayouts: [{ layerId: layer.id, x: 100, y: 100, width: 700, height: 100, zIndex: 1 }]
      } : { ...profile, enabled: false, reviewState: "needs-review" })
    };
    await api(`/management/alerts/${rule.id}/editor`, "PUT", { document: edited, confirmLiveImpact: true });
    async function event(id: string) {
      // This protected production route resolves a normalized event via the real coordinator.
      // Provider connectivity is independently covered by runtime ingestion tests.
      const result = await api<{ status: string }>("/alerts/test", "POST", {
        id, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "streamerbot",
        occurredAt: new Date().toISOString(), type: "follow", amount: null,
        actor: { id: "fixture-viewer", displayName: "Fixture" }, message: null, metadata: {}
      });
      expect(result.status).toBe("queued");
    }
    async function configure(enabled: boolean, visible: boolean) {
      const surface = (await api<SurfaceSettingsView>("/overlay-surfaces")).surfaces.find(candidate => candidate.kind === "desktop")!;
      await api(`/overlay-surfaces/${surface.id}`, "PUT", { ...surface, enabled, layers: surface.layers.map(entry => entry.moduleId === "alerts" ? { ...entry, visible } : entry) });
    }
    await event("native-overlay-first");
    const playing = await api<{ current: { startedAt: string } }>("/playback");
    const originalStart = Date.parse(playing.current.startedAt);
    const originalDeadline = originalStart + edited.durationMs;
    const overlay = await windowByUrl(desktop, overlayUrl);
    const text = overlay.getByText("Neutral desktop Fixture", { exact: true });
    await expect(text).toBeVisible();
    expect(await overlay.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>).require,
      subscribe: typeof (globalThis as typeof globalThis & { streamJamsOverlayHost?: { onCommand: unknown } }).streamJamsOverlayHost?.onCommand
    }))).toEqual({ require: "undefined", subscribe: "function" });
    expect(await desktop.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const native = await desktop.evaluate(({ BrowserWindow, app }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL() === "stream-jams-overlay://surface/")!;
      const preferences = (window.webContents as typeof window.webContents & {
        getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean };
      }).getLastWebPreferences();
      return { pids: app.getAppMetrics().map(metric => metric.pid), visible: window.isVisible(), focusable: window.isFocusable(),
        sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration,
        appPath: app.getAppPath(), urls: BrowserWindow.getAllWindows().map(candidate => candidate.webContents.getURL()) };
    });
    native.pids.forEach(pid => pids.add(pid));
    expect(native).toMatchObject({ visible: true, focusable: false, sandbox: true, contextIsolation: true, nodeIntegration: false });
    // The installed Electron runtime omits preload from the last-preferences
    // snapshot. Prove packaged identity plus the live bridge above instead.
    expect(native.appPath).toMatch(/app\.asar$/);
    expect(native.urls.filter(url => url.startsWith("http:")).every(url => url.startsWith(`${base}/manage`))).toBe(true);
    await evidence("rendered-private-surface");
    await text.evaluate(node => { (node as HTMLElement & { overlayRetentionSentinel?: string }).overlayRetentionSentinel = "original-node"; });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))!.hide());
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))!.isVisible())).toBe(false);
    await expect(text).toBeVisible();
    await configure(true, false);
    await expect(text).toBeHidden();
    // Leave enough elapsed time to distinguish shared-deadline completion from
    // a fresh full-duration replay after visibility returns.
    await expect.poll(() => Date.now() - originalStart, { timeout: 5000 }).toBeGreaterThanOrEqual(3000);
    await configure(true, true);
    await expect(text).toBeVisible();
    expect(await text.evaluate(node => (node as HTMLElement & { overlayRetentionSentinel?: string }).overlayRetentionSentinel)).toBe("original-node");
    await expect(text).toHaveCount(0, { timeout: Math.max(1, originalDeadline - Date.now() + 1000) });
    expect(Date.now()).toBeGreaterThanOrEqual(originalDeadline - 250);
    expect(Date.now()).toBeLessThanOrEqual(originalDeadline + 1000);
    await configure(true, false);
    await event("native-overlay-hidden");
    await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current).toBeNull();
    await configure(true, true);
    await expect(text).toHaveCount(0);
    await event("native-overlay-disable");
    await expect(text).toBeVisible();
    await configure(false, true);
    await expect.poll(() => desktop!.windows().some(page => page.url() === overlayUrl)).toBe(false);
  } catch (error) { failures.push(error); }
  // Never desktop.close(), signal, force-close or delete a failed profile. Observe
  // the captured native child, not Playwright's connection-close event.
  if (desktop !== undefined && child !== undefined) {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
        const management = desktop.windows().find(page => page.url().startsWith(`http://127.0.0.1:${port}/manage`));
        await management?.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click({ timeout: 1500 }).catch(() => undefined);
        await expect.poll(() => child!.exitCode !== null || child!.signalCode !== null, { timeout: 20_000 }).toBe(true);
      }
      expect(child.exitCode).toBe(0);
      await expect.poll(() => [...pids].every(pid => {
        try { process.kill(pid, 0); return false; }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; throw error; }
      }), { timeout: 20_000 }).toBe(true);
    } catch (error) { failures.push(error); }
  } else failures.push(new Error("Native child was not captured; exit is unconfirmed."));
  await evidence(failures.length ? "failed-profile-retained" : "native-exit-confirmed");
  console.info(`Overlay host evidence retained: ${root}`);
  if (failures.length) throw new AggregateError(failures, `Overlay host regression failed; evidence retained at ${root}`);
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated TCP port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}
