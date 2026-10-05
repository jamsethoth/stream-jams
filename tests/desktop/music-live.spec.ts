import { _electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startPearProtocolFixture } from "../../packages/test-support/dist/pear-protocol-fixture.js";
import type { MusicModuleConfig, SurfaceSettingsView } from "../../packages/core/dist/index.js";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
test("packaged Music crosses the preload boundary with desktop scaling", async () => {
  const pear = await startPearProtocolFixture();
  const artworkUrl = process.env.STREAM_JAMS_TEST_MUSIC_ARTWORK_URL;
  pear.setSong({ status: 200, body: { videoId: "disposable", title: "Packaged Music regression", artist: "Test artist", songDuration: 180, elapsedSeconds: 12, isPaused: false, ...(artworkUrl === undefined ? {} : { imageSrc: artworkUrl }) } });
  const root = await mkdtemp(join(tmpdir(), "stream-jams-music-live-"));
  const listener = createServer(); await new Promise<void>(r => listener.listen(0, "127.0.0.1", r));
  const address = listener.address(); if (address === null || typeof address === "string") throw new Error("No test port");
  const port = address.port; await new Promise<void>(r => listener.close(() => r()));
  await writeFile(join(root, "config.json"), JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }, playback: { paused: false, muted: true, doNotDisturb: false } }));
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  env.STREAM_JAMS_CONFIG_PATH = join(root, "config.json"); env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron"); delete env.ELECTRON_RUN_AS_NODE;
  const launchOptions = { executablePath: resolve(process.env.STREAM_JAMS_TEST_EXECUTABLE ?? "apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe"), cwd: root, env, chromiumSandbox: true, timeout: 30000 };
  let desktop = await _electron.launch(launchOptions);
  let child = desktop.process(); const pids = await desktop.evaluate(({ app }) => app.getAppMetrics().map(entry => entry.pid));
  let retireCredential: (() => Promise<void>) | undefined;
  try { await withCleanup(async () => {
    const origin = `http://127.0.0.1:${port}`;
    const management = await windowByUrl(desktop, `${origin}/manage`);
    await expect(management.getByRole("navigation").first()).toBeVisible();
    await management.goto(`${origin}/manage/modules/music`);
    await expect(management.getByLabel("Initial view")).toBeVisible();
    await management.getByRole("button", { name: "Expand browser sources" }).click();
    await expect(management.getByRole("article", { name: "Landscape browser source" })).toContainText("1920 x 1080");
    await expect(management.getByRole("article", { name: "Vertical browser source" })).toContainText("1080 x 1920");
    await management.getByRole("button", { name: "Collapse browser sources" }).click();
    await expect(management.getByRole("button", { name: "Enable Music module" })).toBeVisible();
    await expect(management.getByLabel("Enable Music module after saving")).toHaveCount(0);
    await expect(management.getByRole("button", { name: "Expand appearance" })).toHaveAttribute("aria-expanded", "false");
    await management.getByRole("button", { name: "Expand appearance" }).click();
    await management.getByLabel("Appearance component").selectOption("title");
    await expect(management.getByLabel("Title color", { exact: true })).toBeVisible();
    await expect(management.getByLabel("Widget width (px)")).toHaveCount(0);
    let session = await fetch(`${origin}/auth/management/sessions`, { method: "POST" }).then(r => r.json()) as { id: string; csrfToken: string };
    async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const response = await fetch(origin + path, { method, headers: { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      expect(response.ok, `${path}: ${response.status}`).toBe(true); return response.json() as Promise<T>;
    }
    const configuration = { baseUrl: pear.baseUrl, transport: "poll" };
    const attempt = await api<{ attemptId: string }>("/management/music/pairing", "POST", configuration);
    await expect.poll(async () => (await api<{ status: string }>(`/management/music/pairing/${attempt.attemptId}`)).status).toBe("approved");
    const registered = await api<{ provider: { provider: { id: string } } }>("/management/providers", "POST", { kind: "pear-desktop", name: "Disposable Pear", configuration, pairingAttemptId: attempt.attemptId });
    retireCredential = async () => {
      await api("/management/alert-sets");
      const archive = await api<Record<string, unknown>>("/management/settings/backup");
      const preflight = await api<{ archiveId: string }>("/management/settings/backup/preflight", "POST", archive);
      await api("/management/settings/backup/restore", "POST", { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
    };
    await api(`/management/providers/${registered.provider.provider.id}/activate`, "POST", {});
    const settings = await api<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    async function importAsset(path: string, name: string, mime: string): Promise<string> {
      const response = await fetch(`${origin}/assets/import`, { method: "POST", headers: {
        authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken,
        "content-type": "application/octet-stream", "x-stream-jams-file-name": name, "x-stream-jams-mime-type": mime
      }, body: await readFile(resolve(path)) });
      expect(response.ok).toBe(true);
      return (await response.json() as { id: string }).id;
    }
    const brandId = await importAsset("apps/web/public/storybook-assets/tiny-image.png", "brand.png", "image/png");
    const fontId = await importAsset("apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2", "font.woff2", "font/woff2");
    const appearance = settings.config.profiles.landscape.views.full;
    appearance.branding.assetId = brandId; appearance.branding.fit = "contain"; appearance.branding.opacity = 35;
    appearance.titleFont.fontAssetId = fontId;
    settings.config.profiles.landscape.idleMode = "none";
    settings.config.css = { enabled: true, styleContractVersion: 1, source: await readFile(resolve("docs/examples/music-branding.css"), "utf8") };
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
    const widget = overlay.getByTestId("music-widget");
    if (artworkUrl !== undefined) {
      const artwork = widget.locator(".sj-artwork img");
      await expect(artwork).toBeVisible();
      await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      expect(await artwork.getAttribute("src")).toMatch(/^stream-jams-overlay:\/\/surface\/music-artwork\/private_/u);
    }
    await expect(widget.locator(".sj-brand-image")).toHaveCSS("opacity", "0.35");
    await expect.poll(() => widget.locator(".sj-brand-image").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(widget.locator(".sj-progress-track")).toHaveCSS("position", "absolute");
    await expect.poll(() => widget.locator(".sj-title").evaluate(async element => {
      const family = getComputedStyle(element).fontFamily;
      await document.fonts.load(`16px ${family}`);
      return family.includes("sj-music-") && document.fonts.check(`16px ${family}`);
    })).toBe(true);
    const steadyBrand = await widget.locator(".sj-brand-image").getAttribute("src");
    const steadyFont = await widget.locator(".sj-title").evaluate(element => getComputedStyle(element).fontFamily);
    const steadyArtwork = artworkUrl === undefined ? null : await widget.locator(".sj-artwork img").getAttribute("src");
    pear.setSong({ status: 200, body: { videoId: "disposable", title: "Packaged Music regression", artist: "Updated test artist", songDuration: 180,
      elapsedSeconds: 14, isPaused: false, ...(artworkUrl === undefined ? {} : { imageSrc: artworkUrl }) } });
    await expect(widget.locator(".sj-artists")).toContainText("Updated test artist");
    expect(await widget.locator(".sj-brand-image").getAttribute("src")).toBe(steadyBrand);
    expect(await widget.locator(".sj-title").evaluate(element => getComputedStyle(element).fontFamily)).toBe(steadyFont);
    if (steadyArtwork !== null) expect(await widget.locator(".sj-artwork img").getAttribute("src")).toBe(steadyArtwork);
    expect(await overlay.locator("audio, video").count()).toBe(0);
    await management.reload();
    const preview = management.getByRole("region", { name: "Music preview" }).getByTestId("music-widget");
    await expect(preview.locator(".sj-brand-image")).toHaveCSS("opacity", "0.35");
    await expect(preview.locator(".sj-progress-track")).toHaveCSS("position", "absolute");
    for (const scope of ["module", "unified"] as const) {
      const key = await api<{ url: string }>("/management/overlay-outputs/keys", "POST", {
        overlayId: "default", moduleId: scope === "module" ? "music" : null, scope,
        purpose: "live", targetProfileId: scope === "module" ? "landscape" : null
      });
      await management.goto(key.url);
      await expect(management.getByTestId("music-widget").locator(".sj-brand-image")).toHaveCSS("opacity", "0.35");
      await expect(management.getByTestId("music-widget").locator(".sj-progress-track")).toHaveCSS("position", "absolute");
    }
    const previousBrand = await widget.locator(".sj-brand-image").getAttribute("src");
    const replaced = await fetch(`${origin}/assets/${brandId}/replace`, { method: "POST", headers: {
      authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken,
      "content-type": "application/octet-stream", "x-stream-jams-file-name": "replacement.png",
      "x-stream-jams-mime-type": "image/png", "x-stream-jams-confirm-impact": "true"
    }, body: await readFile(resolve("apps/web/public/storybook-assets/tiny-image.png")) });
    expect(replaced.ok).toBe(true);
    await expect.poll(() => widget.locator(".sj-brand-image").getAttribute("src")).not.toBe(previousBrand);
    await expect.poll(() => widget.locator(".sj-brand-image").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await management.goto(`${origin}/manage/modules/music`);
    const currentBrand = await widget.locator(".sj-brand-image").getAttribute("src");
    expect(currentBrand).not.toBeNull();
    const failedBrand = `${currentBrand!}?acceptance-unavailable`;
    await overlay.route(failedBrand, route => route.abort());
    await widget.locator(".sj-brand-image").evaluate((image: HTMLImageElement, url) => { image.src = url; }, failedBrand);
    await expect(widget.locator(".sj-brand-image")).toHaveCount(0);
    await expect(widget.locator(".sj-title")).toContainText("Packaged Music regression");
    await overlay.unroute(failedBrand);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().startsWith("stream-jams-overlay://")).every(window => !window.isFocusable()))).toBe(true);
    const updateSurface = async (visible: boolean) => api(`/overlay-surfaces/${surface.id}`, "PUT", {
      id: surface.id, kind: surface.kind, opacity: surface.opacity, autoFollowDisplayName: surface.autoFollowDisplayName,
      enabled: true, displayId: surfaces.desktop.displays[0]!.id,
      layers: surface.layers.map(layer => ({ ...layer, visible: layer.moduleId === "music" && visible }))
    });
    await updateSurface(false); await expect(widget).toHaveCount(0);
    await updateSurface(true); await expect(widget).toBeVisible();
    await expect(widget.locator(".sj-brand-image")).toBeVisible();
    for (const route of ["/playback/pause", "/playback/mute", "/playback/skip"]) {
      await api(route, "POST", {}); await expect(widget.locator(".sj-title")).toContainText("Packaged Music regression");
    }
    pear.setSong({ status: 200, body: { videoId: "next", title: "Next packaged track", artist: "Test artist", songDuration: 180, elapsedSeconds: 70, isPaused: true } });
    await expect(widget.locator(".sj-title")).toContainText("Next packaged track", { timeout: 15_000 });
    pear.setSong({ status: 401 }); await expect(widget).toHaveCount(0, { timeout: 15_000 });
    // Restore removes this disposable provider's keyring credential as well as playback.
    await retireCredential(); retireCredential = undefined;
    const restored = await api<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    expect(restored.config.profiles.landscape.views.full.branding).toEqual(appearance.branding);
    expect(restored.config.profiles.landscape.views.full.titleFont.fontAssetId).toBe(fontId);
    expect(restored.config.css).toEqual(settings.config.css);
    const closed = desktop.waitForEvent("close", { timeout: 15_000 });
    await desktop.evaluate(({ app }) => app.quit()); await closed;
    await expect.poll(() => child.exitCode).toBe(0);
    desktop = await _electron.launch(launchOptions); child = desktop.process();
    pids.push(...await desktop.evaluate(({ app }) => app.getAppMetrics().map(entry => entry.pid)));
    const reopened = await windowByUrl(desktop, `${origin}/manage`);
    await expect(reopened.getByRole("navigation").first()).toBeVisible();
    session = await fetch(`${origin}/auth/management/sessions`, { method: "POST" }).then(r => r.json()) as { id: string; csrfToken: string };
    expect((await api<{ config: MusicModuleConfig }>("/overlay-modules/music/config")).config).toEqual(restored.config);
    await reopened.goto(`${origin}/manage/modules/music`);
    await expect(reopened.getByRole("region", { name: "Music preview" }).locator(".sj-brand-image")).toBeVisible();
  }, () => withCleanup(async () => { await retireCredential?.(); }, () => finishDesktop(desktop, root, pids, child))); } finally { await pear.close(); }
});

