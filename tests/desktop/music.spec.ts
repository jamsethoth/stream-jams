import { access, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SurfaceSettingsView, TimerDefinition } from "../../packages/core/dist/index.js";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

const executablePath = resolve(process.env.STREAM_JAMS_TEST_EXECUTABLE ?? "apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
test.use({ trace: "off", screenshot: "off", video: "off" });

test("packaged desktop keeps Music opt-in, transparent without a source, and independent of safety controls", async () => {
  await access(executablePath);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-music-"));
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("No disposable desktop port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  await writeFile(join(root, "config.json"), JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") },
    playback: { paused: false, muted: true, doNotDisturb: false }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = join(root, "config.json");
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  let desktop: ElectronApplication | undefined;
  let child: ReturnType<ElectronApplication["process"]> | undefined;
  const ownedPids: number[] = [];
  await withCleanup(async () => {
    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    ownedPids.push(...await desktop.evaluate(({ app }) => app.getAppMetrics().map((entry: { pid: number }) => entry.pid)));
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    const base = `http://127.0.0.1:${port}`;
    const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
    expect(sessionResponse.ok).toBe(true);
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
      expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
      return response.status === 204 ? undefined as T : response.json() as Promise<T>;
    }
    const defaults = await api<{ enabled: boolean; config: unknown }>("/overlay-modules/music/config");
    expect(defaults.enabled).toBe(false);
    await management.goto(`${base}/manage/modules/music`);
    await expect(management.getByLabel("Initial view")).toBeVisible();
    await management.getByRole("button", { name: "Edit layout", exact: true }).click();
    await expect(management.getByLabel("Title width (px)")).toBeVisible();
    await expect(management.getByRole("button", { name: "Resize Title", exact: true })).toBeVisible();
    await expect(management.getByRole("checkbox", { name: "Snap to grid" })).toBeChecked();
    await expect(management.getByRole("checkbox", { name: "Snap to alignment" })).toBeChecked();
    await management.getByRole("button", { name: "Reset automatic layout" }).click();
    await expect(management.getByText("All changes saved")).toBeVisible();
    const surfaces = await api<SurfaceSettingsView>("/overlay-surfaces");
    const display = surfaces.desktop.displays[0];
    expect(display).toBeDefined();
    const surface = surfaces.surfaces.find(candidate => candidate.kind === "desktop")!;
    expect(surface.layers.find(layer => layer.moduleId === "music")?.visible).toBe(false);
    await api(`/overlay-surfaces/${surface.id}`, "PUT", {
      id: surface.id, kind: surface.kind, enabled: true, displayId: display!.id,
      autoFollowDisplayName: surface.autoFollowDisplayName, opacity: surface.opacity,
      layers: surface.layers.map(layer => layer.moduleId === "music" || layer.moduleId === "timers" ? { ...layer, visible: true } : layer)
    });
    await api("/overlay-modules/music/config", "PUT", { enabled: true, config: defaults.config });
    // The host creates a window only for renderable content. Empty Music must
    // not create one; a silent timer gives the remaining assertions a surface.
    expect(desktop.windows().some(page => page.url() === "stream-jams-overlay://surface/")).toBe(false);
    const timers = await api<{ config: unknown }>("/overlay-modules/timers/config");
    await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: timers.config });
    const timer = await api<TimerDefinition>("/timers", "POST", {
      label: "Music independence surface", durationMs: 120_000,
      iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
      outputs: { browserSource: false, deviceRouteIds: [] }
    });
    await api(`/timers/${timer.id}/start`, "POST");
    const overlay = await windowByUrl(desktop, "stream-jams-overlay://surface/");
    await expect(overlay.getByText(timer.label, { exact: true })).toBeVisible();
    await expect(overlay.getByTestId("music-widget")).toHaveCount(0);
    for (const [route, body] of [["/playback/pause", undefined], ["/playback/unmute", undefined], ["/playback/skip", undefined], ["/playback/do-not-disturb", { enabled: true }]] as const) {
      await api(route, "POST", body);
      await expect(overlay.getByTestId("music-widget")).toHaveCount(0);
    }
    const windowState = await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith("stream-jams-overlay://surface/"));
      return window === undefined ? null : { focusable: window.isFocusable(), focused: window.isFocused(), visible: window.isVisible() };
    });
    expect(windowState).toMatchObject({ focusable: false, focused: false, visible: true });
    const latest = await api<SurfaceSettingsView>("/overlay-surfaces");
    const active = latest.surfaces.find(candidate => candidate.kind === "desktop")!;
    await api(`/overlay-surfaces/${active.id}`, "PUT", {
      id: active.id, kind: active.kind, enabled: active.enabled, displayId: active.displayId,
      autoFollowDisplayName: active.autoFollowDisplayName, opacity: active.opacity,
      layers: active.layers.map(layer => layer.moduleId === "music" ? { ...layer, visible: false } : layer)
    });
    await expect(overlay.getByTestId("music-widget")).toHaveCount(0);
    await api("/overlay-modules/music/config", "PUT", { enabled: false, config: defaults.config });
  }, () => finishDesktop(desktop, root, ownedPids, child));
});
