import { _electron, expect, test } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startPearProtocolFixture } from "../../packages/test-support/dist/pear-protocol-fixture.js";
import type { MusicModuleConfig, SurfaceSettingsView } from "../../packages/core/dist/index.js";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
test("packaged Music crosses the preload boundary with desktop scaling", async () => {
  const pear = await startPearProtocolFixture();
  pear.setSong({ status: 200, body: { videoId: "disposable", title: "Packaged Music regression", artist: "Test artist", songDuration: 180, elapsedSeconds: 12, isPaused: false } });
  const root = await mkdtemp(join(tmpdir(), "stream-jams-music-live-"));
  const listener = createServer(); await new Promise<void>(r => listener.listen(0, "127.0.0.1", r));
  const address = listener.address(); if (address === null || typeof address === "string") throw new Error("No test port");
  const port = address.port; await new Promise<void>(r => listener.close(() => r()));
  await writeFile(join(root, "config.json"), JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }, playback: { paused: false, muted: true, doNotDisturb: false } }));
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  env.STREAM_JAMS_CONFIG_PATH = join(root, "config.json"); env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron"); delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await _electron.launch({ executablePath: resolve(process.env.STREAM_JAMS_TEST_EXECUTABLE ?? "apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe"), cwd: root, env, chromiumSandbox: true, timeout: 30000 });
  const child = desktop.process(); const pids = await desktop.evaluate(({ app }) => app.getAppMetrics().map(entry => entry.pid));
  try { await withCleanup(async () => {
    const origin = `http://127.0.0.1:${port}`;
    const management = await windowByUrl(desktop, `${origin}/manage`);
    await expect(management.getByRole("navigation").first()).toBeVisible();
    await management.goto(`${origin}/manage/modules/music`);
    await expect(management.getByLabel("Initial view")).toBeVisible();
    await expect(management.getByRole("button", { name: "Enable Music module" })).toBeVisible();
    await expect(management.getByLabel("Enable Music module after saving")).toHaveCount(0);
    await expect(management.getByRole("button", { name: "Expand appearance" })).toHaveAttribute("aria-expanded", "false");
    await management.getByRole("button", { name: "Expand appearance" }).click();
    await management.getByLabel("Appearance component").selectOption("title");
    await expect(management.getByLabel("Title color", { exact: true })).toBeVisible();
    await expect(management.getByLabel("Widget width (px)")).toHaveCount(0);
    const session = await fetch(`${origin}/auth/management/sessions`, { method: "POST" }).then(r => r.json()) as { id: string; csrfToken: string };
    async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const response = await fetch(origin + path, { method, headers: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      expect(response.ok, `${path}: ${response.status}`).toBe(true); return response.json() as Promise<T>;
    }
    const configuration = { baseUrl: pear.baseUrl, transport: "poll" };
    const attempt = await api<{ attemptId: string }>("/management/music/pairing", "POST", configuration);
    await expect.poll(async () => (await api<{ status: string }>(`/management/music/pairing/${attempt.attemptId}`)).status).toBe("approved");
    const registered = await api<{ provider: { provider: { id: string } } }>("/management/providers", "POST", { kind: "pear-desktop", name: "Disposable Pear", configuration, pairingAttemptId: attempt.attemptId });
    await api(`/management/providers/${registered.provider.provider.id}/activate`, "POST", {});
    const settings = await api<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    settings.config.desktopScale.full = 0.7; settings.config.desktopPlacement.full = { x: 1472, y: 955 };
    await api("/overlay-modules/music/config", "PUT", { enabled: true, config: settings.config });
    const surfaces = await api<SurfaceSettingsView>("/overlay-surfaces"); const surface = surfaces.surfaces.find(s => s.kind === "desktop")!;
    await api(`/overlay-surfaces/${surface.id}`, "PUT", { id: surface.id, kind: surface.kind, opacity: surface.opacity, autoFollowDisplayName: surface.autoFollowDisplayName, enabled: true, displayId: surfaces.desktop.displays[0]!.id, layers: surface.layers.map(layer => ({ ...layer, visible: layer.moduleId === "music" })) });
    const overlay = await windowByUrl(desktop, "stream-jams-overlay://surface/");
    await expect(overlay.getByTestId("music-widget")).toBeVisible();
    await expect(overlay.getByTestId("music-widget")).toHaveCSS("transform", "matrix(0.7, 0, 0, 0.7, 0, 0)");
    await expect(overlay.getByTestId("music-widget")).toHaveCSS("left", "1472px");
    await expect(overlay.getByTestId("music-widget")).toHaveCSS("top", "955px");
    await expect(overlay.getByText("Packaged Music regression", { exact: true })).toBeVisible();
  }, () => finishDesktop(desktop, root, pids, child)); } finally { await pear.close(); }
});

