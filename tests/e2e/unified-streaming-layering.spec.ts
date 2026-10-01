import { expect, test, type Page } from "@playwright/test";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createBaseServerApp } from "../../apps/server/src/app.js";
import { registerAssetRoutes } from "../../apps/server/src/http/routes/assets.js";
import { LocalAssetStore } from "../../apps/server/src/modules/assets/local-asset-store.js";
import { installOverlayWebSocketMock } from "./e2e-helpers.js";

async function send(page: Page, message: unknown): Promise<void> {
  await page.evaluate(value => {
    const sockets = (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets;
    const socket = sockets?.at(-1);
    if (socket === undefined) throw new Error("Overlay socket unavailable");
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }, message);
}

test("unified streamed layers reorder without replay and effect-only stop preserves alert and timer", async ({ page }, testInfo) => {
  const file = "neutral-trackless.mp4";
  const asset = { id: "clip", originalFileName: file, mediaType: "video" as const,
    mimeType: "video/mp4", sizeBytes: (await stat(resolve("tests/fixtures/media", file))).size,
    checksum: "fixture", storagePath: file, durationMs: null };
  const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "test" } });
  app.addHook("onRequest", async (_request, reply) => { reply.header("access-control-allow-origin", "*"); });
  registerAssetRoutes(app, {
    assetRepository: { list: async () => [asset], findById: async () => asset },
    assetStore: new LocalAssetStore({ assetDirectory: resolve("tests/fixtures/media") }),
    mediaImportPipeline: { importMedia: async () => asset },
    managementAuthPreHandler: async () => {}, managementRateLimitPreHandler: async () => {},
    overlayAccessService: { verifyRouteAccess: async request => ({ authorized: true, record: {
      id: "fixture", overlayId: request.overlayId, moduleId: request.moduleId, purpose: request.purpose,
      scope: request.scope, keyHash: "fixture", routeKeySecretRef: null,
      createdAt: "2026-09-30T00:00:00Z", revokedAt: null
    } }) }
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const mediaResponses: number[] = [];
  page.on("response", response => {
    if (response.url().startsWith(address + "/overlay/")) mediaResponses.push(response.status());
  });
  try {
    await installOverlayWebSocketMock(page);
    await page.route("**/overlay/unified/live/fixture/assets/clip", route =>
      route.request().url().startsWith(address) ? route.continue() : route.fulfill({
        status: 307, headers: { location: address + "/overlay/unified/live/fixture/assets/clip" }
      }));
    const video = (id: string, moduleId: string, zIndex: number) => ({
      id, overlayId: "default", moduleId, purpose: "live", scope: "unified", targetProfileId: "landscape",
      visual: { assetId: "clip", mediaType: "video", loop: true,
        layout: { x: 40, y: 40, width: 400, height: 240, zIndex } },
      text: null, audio: null, tts: null, durationMs: 60_000
    });
    const now = Date.now();
    await page.route("**/overlay/unified/live/fixture/composition", route => route.fulfill({ json: {
      overlayId: "default", purpose: "live", scope: "unified", targetProfileId: "landscape", modules: [
        { moduleId: "alerts", enabled: true, instructions: [video("alert", "alerts", 999)] },
        { moduleId: "screen-effects", enabled: true, instructions: [video("effect", "screen-effects", 1)] },
        { moduleId: "timers", enabled: true, instructions: [], presentation: { kind: "timer-stack", stack: {
          targetProfileId: "landscape", region: { layout: { x: 600, y: 40, width: 300, height: 120, zIndex: 20 }, orientation: "vertical", maxVisible: 1 },
          cards: [{ status: "running", definitionId: "timer", generation: "g1", label: "Continuing timer",
            iconAssetId: null, endsAtEpochMs: now + 60_000, slot: { x: 600, y: 40, width: 300, height: 120, zIndex: 20 } }], overflowCount: 0
        } } }
      ]
    } }));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/overlay/unified/live/fixture");
    await expect(page.getByTestId("overlay-video-alert")).toBeVisible();
    await expect(page.getByTestId("overlay-video-effect")).toBeVisible();
    await expect(page.getByText("Continuing timer")).toBeVisible();
    await send(page, { type: "overlay.playback.audio-state", muted: true });
    const layers = (ids: string[]) => ({ type: "overlay.surface-layers", layers: ids.map(moduleId => ({ moduleId, visible: true })) });
    await send(page, layers(["screen-effects", "alerts", "timers"]));
    const topVideo = () => page.evaluate(() => document.elementsFromPoint(100, 100)
      .find(element => element instanceof HTMLVideoElement)?.getAttribute("data-testid"));
    await expect.poll(topVideo).toBe("overlay-video-effect");
    await expect(page.getByTestId("overlay-module-screen-effects")).toHaveCSS("z-index", "3");
    await page.screenshot({ path: testInfo.outputPath("effect-above-alert.png") });
    const original = await page.getByTestId("overlay-video-alert").elementHandle();
    const effect = await page.getByTestId("overlay-video-effect").elementHandle();
    const timer = await page.getByText("Continuing timer").elementHandle();
    const timerValue = page.locator(".timer-stack__value");
    const previousTimer = await timerValue.textContent();
    const initialClock = await original!.evaluate(element => (element as HTMLVideoElement).currentTime);
    await expect.poll(() => original!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(initialClock + 0.3);
    await expect.poll(() => effect!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.3);
    await send(page, layers(["alerts", "timers", "screen-effects"]));
    await expect.poll(topVideo).toBe("overlay-video-alert");
    expect(await original!.evaluate(element => element === document.querySelector('[data-testid="overlay-video-alert"]'))).toBe(true);
    expect(await effect!.evaluate(element => element === document.querySelector('[data-testid="overlay-video-effect"]'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("alert-above-effect.png") });
    await expect.poll(() => timerValue.textContent()).not.toBe(previousTimer);
    const beforeStop = await original!.evaluate(element => (element as HTMLVideoElement).currentTime);
    const timerBeforeStop = await timerValue.textContent();
    await send(page, { type: "overlay.playback.stop", instructionIds: ["effect"] });
    await expect(page.getByTestId("overlay-video-effect")).toHaveCount(0);
    await expect(page.getByTestId("overlay-video-alert")).toBeVisible();
    await expect(page.getByText("Continuing timer")).toBeVisible();
    expect(await timer!.evaluate(element => element === document.querySelector(".timer-stack__label"))).toBe(true);
    await expect.poll(() => original!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(beforeStop + 0.3);
    await expect.poll(() => timerValue.textContent()).not.toBe(timerBeforeStop);
    await page.screenshot({ path: testInfo.outputPath("effect-stopped-alert-timer-continue.png") });
    expect(await original!.evaluate(element => (element as HTMLVideoElement).muted)).toBe(true);
    expect(mediaResponses).toContain(206);
    const reports = await page.evaluate(() => (window as Window & { __overlaySocketMessages?: { type: string; instructionId?: string }[] }).__overlaySocketMessages ?? []);
    expect(reports.filter(report => report.type === "overlay.playback.started" && report.instructionId === "alert")).toHaveLength(1);
    expect(reports.filter(report => report.type === "overlay.playback.failed")).toHaveLength(0);
  } finally {
    await page.goto("about:blank");
    await app.close();
  }
});
