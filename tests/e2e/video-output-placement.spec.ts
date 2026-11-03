import { expect, test, type BrowserContext } from "@playwright/test";
import { overlayCompositionSchema, type DesktopModuleSync, type DesktopOverlayTransport, type OverlayOutputView, type SurfaceSettingsView, type VideoQueueResponse, type VideosModuleConfig } from "@stream-jams/core";
import type { DesktopVideoCommand, DesktopVideoEvent, DesktopVideoTransport } from "../../packages/core/src/videos/mirror.js";
import { ConfigurationBackupService } from "../../apps/server/src/modules/backup/configuration-backup-service.js";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
async function config(fixture: Fixture) { return (await (await fixture.request("/overlay-modules/videos/config")).json() as { config: VideosModuleConfig }).config; }
async function save(fixture: Fixture, config: VideosModuleConfig, enabled = true) {
  const response = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled, config }); expect(response.status).toBe(200);
}
async function output(fixture: Fixture) {
  const response = await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "videos", targetProfileId: null, purpose: "live", scope: "module" });
  expect(response.status).toBe(200); return (await response.json() as { url: string }).url;
}
async function composition(url: string) { return overlayCompositionSchema.parse(await (await fetch(`${url}/composition`)).json()); }
async function play(fixture: Fixture) {
  const accepted = await fixture.request("/videos/live/requests", "POST", { link: "https://youtu.be/e2ePlacemnt", title: "Stable geometry" }); expect(accepted.status).toBe(201);
  const queue = await (await fixture.request("/videos/live")).json() as VideoQueueResponse;
  const started = await fixture.request("/videos/live/commands", "POST", { expectedRevision: queue.revision, command: { kind: "play-next" } }); expect(started.status).toBe(200);
  return (await started.json() as VideoQueueResponse).current!.itemId;
}
async function providers(context: BrowserContext) {
  let loads = 0;
  await context.route(url => url.protocol !== "http:" || url.hostname !== "127.0.0.1", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://www.youtube-nocookie.com") return route.abort("blockedbyclient");
    loads++;
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><p>Local video</p><script>
      addEventListener('message', event => { let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.func === 'playVideo') parent.postMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0 } }), '*'); });
    </script>` });
  });
  return () => loads;
}

test("saved Video dimensions stay local across desktop moves, viewport resize, idle/disabled reconnect, restart and legacy import", async ({ page, context }) => {
  test.setTimeout(90000);
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start(); expect((await fixture.request("/health")).status).toBe(200);
    const loads = await providers(context);
    const initial = await config(fixture); await save(fixture, initial);
    let url = await output(fixture);
    const before = await composition(url); expect(before.canvas).toMatchObject({ kind: "content", width: 1382, height: 876 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const frames: unknown[] = [];
    page.on("websocket", socket => socket.on("framereceived", frame => { if (typeof frame.payload === "string") frames.push(JSON.parse(frame.payload)); }));
    await page.goto(url);
    await expect.poll(() => frames.some(frame => typeof frame === "object" && frame !== null && "type" in frame && frame.type === "overlay.connected")).toBe(true);
    const itemId = await play(fixture);
    await expect(page.getByText("Stable geometry")).toBeVisible();
    const player = await page.getByTitle("Video player").elementHandle(); expect(player).not.toBeNull();
    const originalBox = await page.getByTestId("video-overlay").boundingBox();
    const moved = { ...initial, layout: { ...initial.layout, desktopPlacement: { x: 1200, y: 600, scale: 0.5 } } };
    await save(fixture, moved);
    const after = await composition(url);
    expect(after.runtimeId).toBe(before.runtimeId); expect(after.canvas).toMatchObject({ width: 1382, height: 876 }); expect(after.canvas.configRevision).toBeGreaterThan(before.canvas.configRevision);
    await expect.poll(() => frames.some(frame => typeof frame === "object" && frame !== null && "composition" in frame && overlayCompositionSchema.parse(frame.composition).canvas.configRevision === after.canvas.configRevision)).toBe(true);
    expect(await page.getByTestId("video-overlay").boundingBox()).toEqual(originalBox);
    expect(await player!.evaluate(element => element === document.querySelector("iframe[title='Video player']"))).toBe(true); expect(loads()).toBe(1);
    const resized = { ...moved, layout: { ...moved.layout, content: { width: 640, height: 460 } } };
    await save(fixture, resized);
    await expect(page.getByTestId("video-overlay")).toHaveCSS("width", "640px");
    await expect(page.getByTestId("video-overlay")).toHaveCSS("left", "0px"); await expect(page.getByTestId("video-overlay")).toHaveCSS("top", "0px");
    await page.setViewportSize({ width: 400, height: 300 });
    const box = await page.getByTestId("video-overlay").boundingBox(); expect(box).toEqual({ x: 0, y: 0, width: 640, height: 460 });
    await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("overflow", "hidden");
    await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("width", "640px");
    await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("height", "460px");
    await page.setViewportSize({ width: 1920, height: 1080 });
    expect(await player!.evaluate(element => element === document.querySelector("iframe[title='Video player']"))).toBe(true); expect(loads()).toBe(1);
    // A saved shadow widens the browser source by its margin and moves the box past it; the desktop scene is unaffected.
    await save(fixture, { ...resized, layout: { ...resized.layout, shadow: { offsetX: 0, offsetY: 0, blur: 8, spread: 0, color: "#00000080" } } });
    await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("width", "672px");
    await expect(page.locator(".video-overlay__frame")).toHaveCSS("box-shadow", "rgba(0, 0, 0, 0.5) 0px 0px 8px 0px");
    expect(await page.getByTestId("video-overlay").boundingBox()).toEqual({ x: 16, y: 16, width: 640, height: 460 });
    expect((await composition(url)).canvas).toMatchObject({ width: 672, height: 492, origin: { x: 16, y: 16 } });
    await save(fixture, resized); await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("width", "640px");
    const current = await composition(url); expect(current.canvas).toMatchObject({ width: 640, height: 460 });
    const state = await (await fixture.request("/videos/live")).json() as VideoQueueResponse; expect(state.current?.itemId).toBe(itemId);
    const invalid = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled: true, config: { ...resized, layout: { ...resized.layout, desktopPlacement: { x: 1800, y: 0, scale: 1 } } } });
    expect(invalid.status).toBe(400); expect((await composition(url)).canvas).toEqual(current.canvas);
    await save(fixture, resized, false); await expect(page.getByTestId("video-overlay")).toHaveCount(0);
    expect((await composition(url)).canvas).toMatchObject({ width: 640, height: 460 });
    await page.reload(); expect((await composition(url)).canvas).toMatchObject({ width: 640, height: 460 });
    await fixture.stop(); await fixture.start();
    expect((await composition(url)).canvas).toMatchObject({ width: 640, height: 460 }); expect(await config(fixture)).toEqual(resized);
    await fixture.request("/management/alert-sets");
    const archive = await (await fixture.request("/management/settings/backup")).json() as Awaited<ReturnType<ConfigurationBackupService["exportArchive"]>>;
    archive.manifest.schemaVersion = 43;
    archive.configuration.tables.overlay_module_config!.find(row => row.module_id === "videos")!.config_json = JSON.stringify({ ...resized, layout: { x: 1400, y: 40, width: 480, height: 320 } });
    archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
    const preflight = await (await fixture.request("/management/settings/backup/preflight", "POST", archive)).json() as { state: string; archiveId: string };
    expect(preflight.state).toBe("valid");
    expect((await fixture.request("/management/settings/backup/restore", "POST", { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true })).status).toBe(200);
    expect((await config(fixture)).layout).toEqual({ schemaVersion: 2, content: { width: 480, height: 320 }, desktopPlacement: { x: 1400, y: 40, scale: 1 } });
    url = await output(fixture); expect((await composition(url)).canvas).toMatchObject({ width: 480, height: 320 });
    await fixture.stop(); await fixture.start(); expect((await composition(url)).canvas).toMatchObject({ width: 480, height: 320 });
    await page.goto(`${fixture.runtime.url}/manage/modules/videos#browser-sources`);
    await expect(page.getByRole("article", { name: "Videos Live browser source" })).toContainText("480 x 320");
    const outputs = await (await fixture.request("/management/overlay-outputs")).json() as OverlayOutputView[];
    expect(outputs.find(item => item.moduleId === "videos" && item.purpose === "live")?.canvas).toMatchObject({ width: 480, height: 320 });
  } finally { await page.goto("about:blank"); await fixture.close(); }
});

test("private desktop uses saved placement and geometry saves preserve primary load/seek identity", async () => {
  const syncs: DesktopModuleSync[] = []; const commands: DesktopVideoCommand[] = [];
  const listeners = new Set<(event: DesktopVideoEvent) => void>();
  const desktopOverlayTransport: DesktopOverlayTransport = { configure: async () => {}, syncModule: async sync => { syncs.push(sync); }, prepare: async () => "ready",
    start: async () => {}, stop: async () => {}, retry: async () => {}, close: async () => {},
    getStatus: async () => ({ available: true, displays: [{ id: "fixture-monitor", label: "Disposable monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], state: "ready", message: null }) };
  const desktopVideoTransport: DesktopVideoTransport = { available: true, send: command => { commands.push(command); }, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  const fixture = await createProviderSecurityRuntimeFixture({ desktopOverlayTransport, desktopVideoTransport });
  try {
    await fixture.start(); const initial = await config(fixture); await save(fixture, initial);
    const view = await (await fixture.request("/overlay-surfaces")).json() as SurfaceSettingsView; const desktop = view.surfaces.find(surface => surface.kind === "desktop")!;
    expect((await fixture.request(`/overlay-surfaces/${desktop.id}`, "PUT", { id: desktop.id, kind: "desktop", opacity: desktop.opacity, enabled: true, displayId: "fixture-monitor", autoFollowDisplayName: false,
      layers: desktop.layers.map(layer => layer.moduleId === "videos" ? { ...layer, visible: true } : layer) })).status).toBe(200);
    const url = await output(fixture); const itemId = await play(fixture);
    for (const listener of listeners) listener({ type: "report", purpose: "live", itemId, state: "started", positionMs: 7000, durationMs: 30000, controls: { pause: true, seek: true } });
    await expect.poll(() => [...syncs].reverse().find(sync => sync.moduleId === "videos")?.presentation).toMatchObject({ kind: "videos", videos: { status: "active", itemId } });
    const before = commands.filter(command => ["load", "seek", "stop"].includes(command.type));
    const updated = { ...initial, layout: { schemaVersion: 2 as const, content: { width: 640, height: 460 }, desktopPlacement: { x: 1200, y: 700, scale: 0.5 } } };
    await save(fixture, updated);
    await expect.poll(() => [...syncs].reverse().find(sync => sync.moduleId === "videos")?.presentation).toMatchObject({ kind: "videos", videos: { itemId, layout: updated.layout, delivery: { mode: "mirror" } } });
    expect(commands.filter(command => ["load", "seek", "stop"].includes(command.type))).toEqual(before);
    const browser = await composition(url); expect(browser.canvas).toMatchObject({ kind: "content", width: 640, height: 460 });
    expect(browser.modules[0]?.presentation).toMatchObject({ kind: "videos", videos: { itemId, layout: { ...updated.layout, desktopPlacement: { x: 0, y: 0, scale: 1 } } } });
    const state = await (await fixture.request("/videos/live")).json() as VideoQueueResponse; expect(state.current?.itemId).toBe(itemId); expect(state.current?.positionMs).toBeGreaterThanOrEqual(7000);
    expect(commands.filter(command => command.type === "load")).toHaveLength(1);
  } finally { await fixture.close(); }
});
