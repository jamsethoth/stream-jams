import { expect, test, type Page } from "@playwright/test";
import { overlayCompositionSchema, resolveMusicOutputGeometry } from "../../packages/core/dist/index.js";
import type { DesktopOverlayTransport, MusicModuleConfig, MusicWidgetProjection, SurfaceSettingsView } from "../../packages/core/dist/index.js";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { startMusicTestRuntime } from "./music-test-runtime.js";

async function composition(url: string) {
  const endpoint = new URL(url); endpoint.pathname += "/composition";
  const response = await fetch(endpoint);
  expect(response.ok).toBe(true);
  return overlayCompositionSchema.parse(await response.json());
}

test("Music desktop placement saves, snaps and reaches only the desktop recipient", async ({ page, context }) => {
  test.setTimeout(90000);
  let latest: MusicWidgetProjection | null = null;
  const transport: DesktopOverlayTransport = {
    configure: async () => {}, prepare: async () => "ready", start: async () => {}, stop: async () => {}, retry: async () => {}, close: async () => {},
    getStatus: async () => ({ available: true, state: "ready", message: null, displays: [{ id: "monitor", label: "Test monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] }),
    syncModule: async sync => { if (sync.moduleId === "music") latest = sync.presentation?.kind === "music-widget" ? sync.presentation.widget : null; }
  };
  const currentDesktop = (): MusicWidgetProjection | null => latest;
  const fixture = await startMusicTestRuntime(undefined, new InMemorySecretStore(), transport);
  try {
    fixture.pear.setSong({ status: 200, body: { videoId: "song", title: "Desktop track", artist: "Artist", album: "Album", songDuration: 180, elapsedSeconds: 12, isPaused: true } });
    await fixture.register();
    const saved = await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    const surfaces = await fixture.request<SurfaceSettingsView>("/overlay-surfaces");
    const desktop = surfaces.surfaces.find(surface => surface.kind === "desktop")!;
    await fixture.request(`/overlay-surfaces/${encodeURIComponent(desktop.id)}`, "PUT", { id: desktop.id, kind: "desktop", enabled: true, displayId: "monitor", autoFollowDisplayName: false, opacity: 1, layers: desktop.layers.map(layer => layer.moduleId === "music" ? { ...layer, visible: true } : layer) });
    const browsers: { page: Page; url: string; profile: "landscape" | "vertical"; pixels: Buffer }[] = [];
    for (const profile of ["landscape", "vertical"] as const) {
      const key = await fixture.request<{ url: string }>("/management/overlay-outputs/keys", "POST", { overlayId: "default", scope: "module", moduleId: "music", purpose: "live", targetProfileId: profile });
      const browser = await context.newPage(); await browser.goto(key.url);
      await expect(browser.getByTestId("music-widget")).toHaveCSS("left", "100px");
      await expect(browser.getByTestId("music-widget")).toHaveCSS("top", "82px");
      await expect(browser.getByTestId("overlay-content-canvas")).toHaveCSS("width", "840px");
      await expect(browser.getByTestId("overlay-content-canvas")).toHaveCSS("height", "378px");
      browsers.push({ page: browser, url: key.url, profile, pixels: await browser.getByTestId("music-content-canvas").screenshot({ animations: "disabled", omitBackground: true }) });
    }
    const shadowAlpha = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      return context.getImageData(99, 150, 1, 1).data[3];
    }, browsers[0]!.pixels.toString("base64"));
    expect(shadowAlpha).toBeGreaterThan(0);
    await page.goto(`${fixture.url}/manage/modules/music`);
    await page.getByRole("button", { name: "Expand desktop overlay placement" }).click();
    await expect(page.getByText(/Display: Test monitor/u)).toBeVisible();
    const x = page.getByLabel("Desktop Music X (px)"); const y = page.getByLabel("Desktop Music Y (px)");
    await x.fill("103"); await x.blur(); await y.fill("117"); await y.blur();
    const handle = page.getByRole("button", { name: "Move Music widget on desktop overlay" });
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    const scale = (await page.getByLabel("Desktop placement canvas").boundingBox())!.width / 1920;
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down();
    await page.mouse.move(box.x + 8 + 540 * scale, box.y + 8 + 331 * scale, { steps: 5 });
    await expect(x).toHaveValue("640"); await expect(y).toHaveValue("451");
    await expect(page.locator(".music-desktop-placement__guide").first()).toBeVisible();
    await handle.press("Escape"); await page.mouse.up();
    await expect(x).toHaveValue("103"); await expect(y).toHaveValue("117");
    await expect(page.locator(".music-desktop-placement__guide")).toHaveCount(0);
    await page.getByLabel("Snap desktop placement to grid").uncheck();
    await page.getByLabel("Snap desktop placement to alignment").uncheck();
    await handle.focus(); await handle.press("ArrowRight"); await expect(x).toHaveValue("104");
    const resize = page.getByRole("button", { name: "Rescale Music widget on desktop overlay" });
    await resize.scrollIntoViewIfNeeded();
    const resizeBox = (await resize.boundingBox())!;
    await page.mouse.move(resizeBox.x + 7, resizeBox.y + 7); await page.mouse.down();
    await page.mouse.move(resizeBox.x + 7 + 64 * scale, resizeBox.y + 7 + 17.8 * scale, { steps: 5 });
    await expect(page.getByLabel("Desktop Music scale (%)")).toHaveValue("110");
    await resize.press("Escape"); await page.mouse.up();
    await expect(page.getByLabel("Desktop Music scale (%)")).toHaveValue("100");
    await resize.focus(); await resize.press("Shift+ArrowRight");
    await expect(page.getByLabel("Desktop Music scale (%)")).toHaveValue("110");
    expect((await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config")).config.desktopPlacement.full).toBeNull();
    await page.getByRole("button", { name: "Save Music appearance" }).click(); await expect(page.getByText("All changes saved")).toBeVisible();
    await expect.poll(() => currentDesktop()?.layout.x).toBe(104); expect(currentDesktop()?.layout.y).toBe(117);
    const persisted = (await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config")).config;
    expect(persisted.desktopPlacement).toEqual({ full: { x: 104, y: 117 }, compact: null });
    expect(persisted.desktopScale).toEqual({ full: 1.1, compact: 1 });
    expect(currentDesktop()?.renderScale).toBe(1.1);
    expect(persisted.profiles).toEqual(saved.config.profiles);
    for (const browser of browsers) {
      await expect(browser.page.getByTestId("music-widget")).toHaveCSS("left", "100px");
      await expect(browser.page.getByTestId("music-widget")).toHaveCSS("top", "82px");
      expect((await browser.page.getByTestId("music-content-canvas").screenshot({ animations: "disabled", omitBackground: true })).equals(browser.pixels)).toBe(true);
    }
    await page.reload(); await page.getByRole("button", { name: "Expand desktop overlay placement" }).click(); await expect(x).toHaveValue("104");
    await expect(page.getByLabel("Desktop Music scale (%)")).toHaveValue("110");
    await page.getByRole("button", { name: "Expand browser sources" }).click();
    await page.getByRole("button", { name: "Expand appearance" }).click();
    for (const browser of browsers) {
      await page.getByLabel("Output profile").selectOption(browser.profile);
      await page.getByLabel("Widget width (px)").fill("720"); await page.getByLabel("Widget width (px)").blur();
      await page.getByRole("button", { name: "Save Music appearance" }).click();
      await expect(page.getByText("All changes saved")).toBeVisible();
      await expect(browser.page.getByTestId("overlay-content-canvas")).toHaveCSS("width", "920px");
      await expect(page.getByRole("article", { name: `${browser.profile === "landscape" ? "Landscape" : "Vertical"} browser source` })).toContainText("920 x 378");
      const full = await composition(browser.url);
      const epoch = full.modules[0]?.presentation?.kind === "music-widget" ? full.modules[0].presentation.widget.appearanceStartedAtEpochMs : null;
      const hidden = (await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config")).config;
      hidden.profiles[browser.profile].idleMode = "hide"; hidden.profiles[browser.profile].idleAfterSeconds = 1;
      await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: hidden });
      await expect(browser.page.getByTestId("music-widget")).toHaveCount(0);
      await browser.page.reload();
      await expect(browser.page.getByTestId("overlay-content-canvas")).toHaveCSS("width", "920px");
      const empty = await composition(browser.url);
      expect(empty.canvas).toMatchObject(resolveMusicOutputGeometry(hidden, browser.profile));
      expect(empty.modules[0]?.presentation).toBeUndefined();
      hidden.profiles[browser.profile].idleMode = "none"; hidden.profiles[browser.profile].initialView = "compact";
      await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: hidden });
      await expect(browser.page.getByTestId("music-widget")).toHaveCSS("left", "100px");
      await expect(browser.page.getByTestId("music-widget")).toHaveCSS("top", "82px");
      await expect(browser.page.getByTestId("music-widget")).toHaveCSS("width", "480px");
      const compact = await composition(browser.url);
      expect(compact.modules[0]?.presentation?.kind === "music-widget" && compact.modules[0].presentation.widget.appearanceStartedAtEpochMs).toBe(epoch);
      await browser.page.close();
    }
    await page.setViewportSize({ width: 390, height: 900 });
    const canvas = page.getByLabel("Desktop placement canvas"); await expect(canvas).toBeVisible();
    expect(await canvas.evaluate(element => element.parentElement!.scrollWidth <= element.parentElement!.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator(".music-desktop-placement").screenshot({ path: ".superpowers/music-desktop-placement.png" });
  } finally { await fixture.close(); }
});

test("desktop placement keeps a fractionally scaled widget visible at every canvas boundary", async ({ page }) => {
  const fixture = await startMusicTestRuntime();
  try {
    const settings = await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    settings.config.profiles.landscape.views.full.widthPx = 800;
    settings.config.desktopScale.full = 0.7;
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: settings.config });
    await page.goto(`${fixture.url}/manage/modules/music`);
    await page.getByRole("button", { name: "Expand desktop overlay placement" }).click();
    const handle = page.getByRole("button", { name: "Move Music widget on desktop overlay" });
    for (const [dx, dy] of [[3000, 3000], [-3000, 3000], [3000, -3000], [-3000, -3000]]) {
      await handle.scrollIntoViewIfNeeded(); const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down();
      await page.mouse.move(box.x + 8 + dx!, box.y + 8 + dy!, { steps: 5 }); await page.mouse.up();
      await expect(page.locator(".music-desktop-placement .music-widget-host")).toBeVisible();
    }
  } finally { await fixture.close(); }
});
