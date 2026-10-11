import { expect, test, type Page } from "@playwright/test";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createBaseServerApp } from "../../apps/server/src/app.js";
import { registerAssetRoutes } from "../../apps/server/src/http/routes/assets.js";
import { LocalAssetStore } from "../../apps/server/src/modules/assets/local-asset-store.js";

async function send(page: Page, command: unknown, requestId: string = crypto.randomUUID()): Promise<void> {
  await page.evaluate(({ command, requestId }) => {
    (window as unknown as Window & { __privateReceive: (value: unknown) => void }).__privateReceive({ protocolVersion: 1, generation: 1, requestId, command });
  }, { command, requestId });
}

test("private streamed layers reorder without replay and effect-only stop preserves alert and timer", async ({ page }, testInfo) => {
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
      scope: request.scope, targetProfileId: request.targetProfileId ?? null, keyHash: "fixture", routeKeySecretRef: null,
      createdAt: "2026-09-30T00:00:00Z", revokedAt: null
    } }) }
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const mediaResponses: number[] = [];
  page.on("response", response => {
    if (response.url().startsWith(address + "/overlay/")) mediaResponses.push(response.status());
  });
  try {
    // Explicit test-owned trusted transport mounts the production private renderer/controller.
    // Real range delivery remains ordinary and scoped; no public unified source is created.
    const mediaUrl = address + "/overlay/modules/alerts/live/fixture/assets/clip?profile=landscape";
    await page.route("**/src/desktop-overlay/main.tsx", route => route.fulfill({ contentType: "text/javascript", body: `
      import "/src/csp-schema-validation.ts";
      import React from "/node_modules/.vite/deps/react.js";
      import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js";
      import { DesktopOverlayApp } from "/src/desktop-overlay/DesktopOverlayApp.tsx";
      import { DesktopOverlayController } from "/src/desktop-overlay/desktop-overlay-controller.ts";
      import "/src/App.css";
      const listeners = new Set(); window.__privateReports = [];
      const controller = new DesktopOverlayController({ report: reply => window.__privateReports.push(reply),
        changed: () => { for (const listener of listeners) listener(); },
        prepareAsset: async () => ({ url: ${JSON.stringify(mediaUrl)}, dispose() {} }) });
      window.__privateReceive = request => controller.receive(request);
      window.__privateSnapshot = () => controller.getSnapshot();
      ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(DesktopOverlayApp, { controller,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } }));
      window.addEventListener("beforeunload", () => controller.dispose(), { once: true });
    ` }));
    const config = (ids: string[]) => ({ type: "configure", config: { id: "desktop:primary", kind: "desktop", enabled: true,
      displayId: "fixture-monitor", displayLabel: null, autoFollowDisplayName: false, opacity: 1, layers: ids.map(moduleId => ({ moduleId, visible: true })) } });
    const key = (moduleId: string) => ({ surfaceId: "desktop:primary", moduleId, occurrenceId: moduleId, generation: 1 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/desktop-overlay.html");
    await expect.poll(() => page.evaluate(() => typeof (window as Window & { __privateReceive?: unknown }).__privateReceive)).toBe("function");
    await send(page, config(["screen-effects", "alerts", "timers"]));
    const now = Date.now();
    for (const [id, moduleId, zIndex] of [["alert", "alerts", 999], ["effect", "screen-effects", 1]] as const) {
      await send(page, { type: "prepare", batch: { key: key(moduleId), deferredStart: true, timing: { startsAtEpochMs: now, endsAtEpochMs: now + 60_000 },
        assets: [{ assetId: "clip", reference: { protocolVersion: 1, handle: `private_${"a".repeat(43)}`, snapshot: { assetId: "clip", version: "a".repeat(64), mimeType: "video/mp4", sizeBytes: asset.sizeBytes, durationMs: null } } }],
        instructions: [{ id, moduleId, overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", durationMs: 60_000,
          visual: { assetId: "clip", mediaType: "video", loop: true, layout: { x: 40, y: 40, width: 400, height: 240, zIndex } }, text: null, audio: null, tts: null }] } });
      await expect.poll(() => page.evaluate(moduleId => (window as unknown as Window & { __privateReports: { result?: { type: string; key?: { moduleId: string } } }[] }).__privateReports.some(reply => reply.result?.type === "ready" && reply.result.key?.moduleId === moduleId), moduleId)).toBe(true);
      const startNow = Date.now();
      await send(page, { type: "start", key: key(moduleId), timing: { startsAtEpochMs: startNow, endsAtEpochMs: startNow + 60_000 } });
      await expect.poll(() => page.evaluate(moduleId => (window as unknown as Window & { __privateSnapshot: () => { occurrences: { key: { moduleId: string }; preparing?: boolean }[] } }).__privateSnapshot().occurrences.some(occurrence => occurrence.key.moduleId === moduleId && occurrence.preparing === false), moduleId)).toBe(true);
    }
    await send(page, { type: "sync-module", moduleId: "timers", revision: 1, assets: [], presentation: { kind: "timer-stack", stack: {
      targetProfileId: "landscape", region: { layout: { x: 600, y: 40, width: 300, height: 120, zIndex: 20 }, orientation: "vertical", maxVisible: 1 },
      cards: [{ status: "running", definitionId: "timer", generation: "g1", label: "Continuing timer", iconAssetId: null, endsAtEpochMs: now + 60_000,
        slot: { x: 600, y: 40, width: 300, height: 120, zIndex: 20 } }], overflowCount: 0 } } });
    const alertId = 'overlay-video-' + JSON.stringify(["desktop:primary", "alerts", "alerts", 1, "alert"]);
    const effectId = 'overlay-video-' + JSON.stringify(["desktop:primary", "screen-effects", "screen-effects", 1, "effect"]);
    await expect(page.getByTestId(alertId)).toBeVisible();
    await expect(page.getByTestId(effectId)).toBeVisible();
    await expect(page.getByText("Continuing timer")).toBeVisible();
    const topVideo = () => page.evaluate(() => document.elementsFromPoint(100, 100)
      .find(element => element instanceof HTMLVideoElement)?.getAttribute("data-testid"));
    await expect.poll(topVideo).toBe(effectId);
    await expect(page.getByTestId("overlay-module-screen-effects")).toHaveCSS("z-index", "3");
    await page.screenshot({ path: testInfo.outputPath("effect-above-alert.png") });
    const original = await page.getByTestId(alertId).elementHandle();
    const effect = await page.getByTestId(effectId).elementHandle();
    const timer = await page.getByText("Continuing timer").elementHandle();
    const timerValue = page.locator(".timer-stack__value");
    const previousTimer = await timerValue.textContent();
    const initialClock = await original!.evaluate(element => (element as HTMLVideoElement).currentTime);
    await expect.poll(() => original!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(initialClock + 0.3);
    await expect.poll(() => effect!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.3);
    await send(page, config(["alerts", "timers", "screen-effects"]));
    await expect.poll(topVideo).toBe(alertId);
    expect(await original!.evaluate((element, id) => [...document.querySelectorAll("video")].find(video => video.dataset.testid === id) === element, alertId)).toBe(true);
    expect(await effect!.evaluate((element, id) => [...document.querySelectorAll("video")].find(video => video.dataset.testid === id) === element, effectId)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("alert-above-effect.png") });
    await expect.poll(() => timerValue.textContent()).not.toBe(previousTimer);
    const beforeStop = await original!.evaluate(element => (element as HTMLVideoElement).currentTime);
    const timerBeforeStop = await timerValue.textContent();
    await send(page, { type: "stop", key: key("screen-effects") });
    await expect(page.getByTestId(effectId)).toHaveCount(0);
    await expect(page.getByTestId(alertId)).toBeVisible();
    await expect(page.getByText("Continuing timer")).toBeVisible();
    expect(await timer!.evaluate(element => element === document.querySelector(".timer-stack__label"))).toBe(true);
    await expect.poll(() => original!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(beforeStop + 0.3);
    await expect.poll(() => timerValue.textContent()).not.toBe(timerBeforeStop);
    await page.screenshot({ path: testInfo.outputPath("effect-stopped-alert-timer-continue.png") });
    expect(await original!.evaluate(element => (element as HTMLVideoElement).muted)).toBe(true);
    expect(mediaResponses).toContain(206);
    const reports = await page.evaluate(() => (window as unknown as Window & { __privateReports: { requestId: string; failure?: unknown; result?: { type: string; key?: { moduleId: string } } }[] }).__privateReports);
    expect(reports.filter(report => report.result?.key?.moduleId === "alerts" && report.result.type === "ready")).toHaveLength(1);
    expect(reports.filter(report => report.result?.key?.moduleId === "alerts" && report.result.type === "error")).toHaveLength(0);
    expect(reports.filter(report => report.failure != null)).toHaveLength(0);
  } finally {
    await page.goto("about:blank");
    await app.close();
  }
});
