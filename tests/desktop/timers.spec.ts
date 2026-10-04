import type { ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { SurfaceSettingsView, TimerDefinition, TimerRunState } from "../../packages/core/dist/index.js";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { windowByUrl } from "./audio-harness.js";

const executablePath = resolve(process.env.STREAM_JAMS_TEST_EXECUTABLE ?? "apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
const overlayUrl = "stream-jams-overlay://surface/";
test.use({ trace: "off", screenshot: "off", video: "off" });

test("packaged desktop keeps Timer generations synchronized and quits with a long timer active", async () => {
  await access(executablePath);
  const packageSha256 = createHash("sha256").update(await readFile(join(dirname(executablePath), "resources", "app.asar"))).digest("hex");
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-timers-"));
  const port = await unusedPort();
  await writeFile(join(root, "config.json"), JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") },
    playback: { paused: false, muted: true, moduleMutes: { alerts: true, "screen-effects": true }, doNotDisturb: false }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = join(root, "config.json");
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  env.STREAM_JAMS_SHUTDOWN_LOG = join(root, "shutdown.jsonl");
  let desktop: ElectronApplication | undefined;
  let child: ChildProcess | undefined;
  const failures: unknown[] = [];
  try {
    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await expect(management.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    const base = `http://127.0.0.1:${port}`;
    const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    async function api<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...headers, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(5_000)
      });
      expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
      return response.status === 204 ? undefined as T : response.json() as Promise<T>;
    }
    const surfaces = await api<SurfaceSettingsView>("/overlay-surfaces");
    const display = surfaces.desktop.displays[0];
    expect(display).toBeDefined();
    const surface = surfaces.surfaces.find(candidate => candidate.kind === "desktop")!;
    await api(`/overlay-surfaces/${surface.id}`, "PUT", {
      id: surface.id,
      kind: surface.kind,
      enabled: true,
      displayId: display!.id,
      autoFollowDisplayName: surface.autoFollowDisplayName,
      opacity: surface.opacity,
      layers: surface.layers.map(layer => layer.moduleId === "timers" ? { ...layer, visible: true } : layer)
    });
    const moduleConfig = await api<{ enabled: boolean; config: unknown }>("/overlay-modules/timers/config");
    await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: moduleConfig.config });
    const define = (label: string, durationMs: number) => api<TimerDefinition>("/timers", "POST", {
      label, durationMs, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
      outputs: { browserSource: false, deviceRouteIds: [] }
    });
    const [longTimer, shortTimer] = await Promise.all([define("Long mitts timer", 120_000), define("Short reward timer", 3_000)]);
    await api(`/timers/${longTimer.id}/start`, "POST");
    await api(`/timers/${shortTimer.id}/start`, "POST");
    const running = await api<readonly TimerRunState[]>("/timers/state");
    expect(running.filter(state => state.status === "running")).toHaveLength(2);
    const overlay = await windowByUrl(desktop, overlayUrl);
    await expect(overlay.getByText("Long mitts timer", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Short reward timer", { exact: true })).toBeVisible();

    await api(`/timers/${longTimer.id}/pause`, "POST");
    await expect(overlay.getByRole("listitem", { name: /Long mitts timer, paused/u })).toBeVisible();
    await expect(overlay.getByTestId(`timer-value-${shortTimer.id}`)).toHaveText("0:00", { timeout: 4_000 });
    await expect(overlay.getByText("Short reward timer", { exact: true })).toHaveCount(0, { timeout: 6_500 });
    await api(`/timers/${longTimer.id}/resume`, "POST");
    const restarted = await api<{ state: TimerRunState }>(`/timers/${longTimer.id}/restart`, "POST");
    expect(restarted.state.status).toBe("running");
    await expect(overlay.getByRole("listitem", { name: /Long mitts timer, running/u })).toBeVisible();

    const currentSurface = (await api<SurfaceSettingsView>("/overlay-surfaces")).surfaces.find(candidate => candidate.kind === "desktop")!;
    await api(`/overlay-surfaces/${currentSurface.id}`, "PUT", {
      id: currentSurface.id, kind: currentSurface.kind, enabled: currentSurface.enabled,
      displayId: currentSurface.displayId, autoFollowDisplayName: currentSurface.autoFollowDisplayName, opacity: currentSurface.opacity,
      layers: currentSurface.layers.map(layer => layer.moduleId === "timers" ? { ...layer, visible: false } : layer)
    });
    await expect(overlay.getByText("Long mitts timer", { exact: true })).toBeHidden();
    await api(`/overlay-surfaces/${currentSurface.id}`, "PUT", {
      id: currentSurface.id, kind: currentSurface.kind, enabled: currentSurface.enabled,
      displayId: currentSurface.displayId, autoFollowDisplayName: currentSurface.autoFollowDisplayName, opacity: currentSurface.opacity,
      layers: currentSurface.layers.map(layer => layer.moduleId === "timers" ? { ...layer, visible: true } : layer)
    });
    await expect(overlay.getByText("Long mitts timer", { exact: true })).toBeVisible();
  } catch (error) {
    failures.push(error);
  }

  if (desktop !== undefined && child !== undefined) {
    try {
      const quitStartedAt = Date.now();
      await desktop.evaluate(({ app }) => app.quit());
      const management = desktop.windows().find(page => page.url().startsWith(`http://127.0.0.1:${port}/manage`));
      await management?.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click({ timeout: 1_500 }).catch(() => undefined);
      await expect.poll(() => child!.exitCode !== null || child!.signalCode !== null, { timeout: 20_000 }).toBe(true);
      expect(child.exitCode).toBe(0);
      expect(Date.now() - quitStartedAt).toBeLessThan(20_000);
    } catch (error) {
      failures.push(error);
    }
  } else {
    failures.push(new Error("Packaged Timer process was not captured; bounded Quit is unconfirmed."));
  }
  console.info(`Packaged Timer evidence retained: ${root}; app.asar sha256 ${packageSha256}`);
  if (failures.length > 0) throw new AggregateError(failures, `Packaged Timer acceptance failed; evidence retained at ${root}`);
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated TCP port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}
