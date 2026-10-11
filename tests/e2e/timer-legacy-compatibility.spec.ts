import { expect, test, type Page } from "@playwright/test";
import { projectTimerStack, resolveTimerOutputGeometry, sceneOutputCanvas, upgradeTimersConfig } from "@stream-jams/core";
import { installOverlayWebSocketMock } from "./e2e-helpers.js";

// Frozen from b64b2e79 TimerCard/overlay.css. No current appearance/resolver code derives this fixture.
const frozenCss = `
.frozen-card { align-items:center; background:#0d141f; border:2px solid rgba(251,191,36,.9);
border-radius:var(--radius); box-shadow:0 8px 24px rgba(0,0,0,.42); box-sizing:border-box; color:#fff;
column-gap:var(--gap); display:grid; grid-template-columns:auto minmax(0,1fr) auto;
padding:var(--block) var(--inline); position:absolute; }
.frozen-icon {height:var(--icon); width:var(--icon); object-fit:contain; color:#5eead4; }
.frozen-label {font-family:Inter,ui-sans-serif,system-ui,sans-serif; font-size:var(--label); font-weight:700;
line-height:1; min-width:0; overflow:hidden; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
.frozen-value {font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:var(--value);
font-variant-numeric:tabular-nums; font-weight:800; justify-self:end; line-height:1; text-align:right; white-space:nowrap; }`;
const clocks = [10000, 600000, 45296000] as const;

async function pixels(page: Page, png: Buffer) {
  return page.evaluate(async data => {
    const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, rgba: Array.from(context.getImageData(0, 0, image.width, image.height).data) };
  }, png.toString("base64"));
}

for (const recipientKind of ["browser", "desktop"] as const) {
  for (const shape of ["pinned12", "horizontal-edge", "zero-budget"] as const) {
    test(`frozen legacy Timer rectangles and pixels ${recipientKind} ${shape}`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      const region = shape === "pinned12"
        ? { layout: { x: 64, y: 720, width: 640, height: 280, zIndex: 0 }, orientation: "vertical" as const, maxVisible: 12 }
        : { layout: { x: shape === "horizontal-edge" ? 1319 : 1620, y: 779, width: shape === "horizontal-edge" ? 601 : 300, height: 301, zIndex: 0 }, orientation: "horizontal" as const, maxVisible: 12 };
      const config = upgradeTimersConfig({ profiles: { landscape: region, vertical: { layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 }, orientation: "vertical", maxVisible: 12 } } });
      const profile = config.profiles.landscape;
      const geometry = resolveTimerOutputGeometry(profile);
      const stack = projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile, geometry, recipientKind,
        runs: clocks.map((remainingMs, index) => ({ status: "paused" as const, definitionId: `frozen-${index}`, generation: `same-${index}`, remainingMs,
          snapshot: { id: `frozen-${index}`, label: "Frozen label", durationMs: remainingMs, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } })) });
      await installOverlayWebSocketMock(page);
      const canvas = recipientKind === "desktop" ? sceneOutputCanvas() : { schemaVersion: 1, kind: "content", width: geometry.width, height: geometry.height, origin: geometry.origin, insets: geometry.insets, configRevision: 1 };
      const payload = {
        runtimeId: "frozen-comparison", canvas, overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape",
        modules: [{ moduleId: "timers", enabled: true, instructions: [], presentation: { kind: "timer-stack", stack } }]
      };
      await page.route("**/overlay/modules/timers/live/ovl_legacy/composition*", route => route.fulfill({ json: payload }));
      await page.goto("/overlay/modules/timers/live/ovl_legacy?profile=landscape");
      const cards = page.getByRole("listitem");
      await expect(cards).toHaveCount(3);
      await expect(page.getByTestId("timer-value-frozen-0")).toHaveText("0:10");
      await expect(page.getByTestId("timer-value-frozen-1")).toHaveText("10:00");
      await expect(page.getByTestId("timer-value-frozen-2")).toHaveText("12:34:56");
      // Reproduce original slot arithmetic, native sizes and edge fitting independently.
      const w = region.orientation === "horizontal" ? region.layout.width / 12 : region.layout.width;
      const h = region.orientation === "vertical" ? region.layout.height / 12 : region.layout.height;
      const size = (hr: number, wr: number, low: number, high: number) => Math.max(low, Math.min(high, Math.round(Math.min(h * hr, w * wr))));
      const badgeW = size(.24, .08, 10, 42) * 8 + size(.1, .03, 5, 16) * 2 + 2;
      const badgeH = size(.24, .08, 10, 42) + size(.06, .018, 3, 10) * 2 + 2;
      const offset = size(.08, .025, 4, 14);
      const scale = recipientKind === "browser" ? 1 : Math.min(1,
        (1920 - region.layout.x) / (region.orientation === "vertical" ? Math.max(region.layout.width, badgeW) : region.layout.width + offset + badgeW),
        (1080 - region.layout.y) / (region.orientation === "vertical" ? region.layout.height + offset + badgeH : Math.max(region.layout.height, badgeH)));
      const x = recipientKind === "browser" ? 48 : region.layout.x;
      const y = recipientKind === "browser" ? 40 : region.layout.y;
      const html = clocks.map((_, index) => `<div class="frozen-card" data-frozen="${index}" style="left:${x + (region.orientation === "horizontal" ? region.layout.width * index / 12 : 0)}px;top:${y + (region.orientation === "vertical" ? region.layout.height * index / 12 : 0)}px;width:${w}px;height:${h}px;--radius:${size(.12,.03,4,16)}px;--gap:${size(.12,.025,4,18)}px;--block:${size(.1,.025,4,16)}px;--inline:${size(.14,.04,6,24)}px;--icon:${size(.48,.16,16,64)}px;--label:${size(.24,.08,10,42)}px;--value:${size(.29,.12,12,56)}px">
        <svg class="frozen-icon" viewBox="0 0 64 64"><circle cx="32" cy="34" fill="none" r="23" stroke="currentColor" stroke-width="6"></circle><path d="M24 5h16M32 11v7M49 17l5 5M32 34V22M32 34l10 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="6"></path></svg>
        <span class="frozen-label">Frozen label</span><time class="frozen-value">${["0:10", "10:00", "12:34:56"][index]}</time></div>`).join("");
      // Independent document avoids overlapping transformed SVG layers and visibility repaint artifacts.
      const oldPage = await page.context().newPage();
      await oldPage.setViewportSize({ width: 1920, height: 1080 });
      await oldPage.setContent(`<style>body{margin:0} ${frozenCss}</style><div style="position:absolute;left:0;top:0;width:${canvas.width}px;height:${canvas.height}px;overflow:hidden"><div id="frozen-renderer" style="position:absolute;inset:0;transform:scale(${scale});transform-origin:${x}px ${y}px">${html}</div></div>`);
      for (let index = 0; index < clocks.length; index++) {
        const actual = cards.nth(index);
        const frozen = oldPage.locator(`[data-frozen='${index}']`);
        for (const [currentSelector, frozenSelector] of [[":scope", ":scope"], [".timer-stack__icon", ".frozen-icon"], [".timer-stack__label", ".frozen-label"], [".timer-stack__value", ".frozen-value"]]) {
          const rect = await actual.evaluate((element, selector) => { const r = (selector === ":scope" ? element : element.querySelector(selector)!).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, currentSelector!);
          const old = await frozen.evaluate((element, selector) => { const r = (selector === ":scope" ? element : element.querySelector(selector)!).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, frozenSelector!);
          for (const key of ["x", "y", "width", "height"] as const) expect(rect[key], `${recipientKind}/${shape}/${index}/${currentSelector}/${key}`).toBeCloseTo(old[key], 1);
        }
      }
      // Compare decoded ordinary clock/icon pixels exactly, without border-alpha quantization
      // or hiding/mutating transformed SVG subtrees to make a reference screenshot.
      for (let index = 0; index < clocks.length; index++) {
        for (const [currentSelector, oldSelector] of [[".timer-stack__value", ".frozen-value"], [".timer-stack__icon", ".frozen-icon"]]) {
          const name = `${index}-${currentSelector!.slice(1)}`;
          await page.bringToFront();
          const currentPixels = await cards.nth(index).locator(currentSelector!).screenshot({ path: test.info().outputPath(`${name}-current.png`) });
          await oldPage.bringToFront();
          const frozenPixels = await oldPage.locator(`[data-frozen='${index}']`).locator(oldSelector!).screenshot({ path: test.info().outputPath(`${name}-frozen.png`) });
          expect(await pixels(page, currentPixels), name).toEqual(await pixels(page, frozenPixels));
        }
      }
      // S07's persisted eight-digit hex alpha quantizes historical .9 to 230/255.
      // Keep that documented border-only difference bounded to one decoded channel step.
      expect(profile.appearance.pausedAccent).toBe("#FBBF24E6");
      await expect(oldPage.locator("[data-frozen='0']")).toHaveCSS("border-color", "rgba(251, 191, 36, 0.9)");
      const box = (await cards.first().boundingBox())!;
      const edge = { x: Math.floor(box.x), y: Math.floor(box.y + box.height / 3), width: 3, height: 2 };
      await page.bringToFront(); const currentBorder = await pixels(page, await page.screenshot({ clip: edge }));
      await oldPage.bringToFront(); const oldBorder = await pixels(page, await oldPage.screenshot({ clip: edge }));
      expect(Math.max(...currentBorder.rgba.map((channel, index) => Math.abs(channel - oldBorder.rgba[index]!))), "historical border alpha quantization").toBeLessThanOrEqual(1);
      // Test intentionally bounded pathological clocks separately from the frozen ordinary pixels.
      const canvasElement = page.getByTestId(recipientKind === "browser" ? "overlay-content-canvas" : "overlay-profile-canvas");
      const before = await canvasElement.boundingBox();
      const longStack = { ...stack, cards: [...stack.cards, { ...stack.cards[2]!, status: "paused" as const, definitionId: "frozen-3", generation: "same-3", remainingMs: Number.MAX_SAFE_INTEGER,
        slot: (recipientKind === "desktop" ? geometry.desktopSlots : geometry.slots)[3]! }] };
      await page.evaluate(composition => {
        const socket = (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets!.at(-1)!;
        socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "overlay.composition", composition }) }));
      }, { ...payload, modules: [{ ...payload.modules[0]!, presentation: { kind: "timer-stack", stack: longStack } }] });
      const extreme = page.getByTestId("timer-value-frozen-3");
      await expect(extreme).toHaveCSS("text-overflow", "ellipsis"); await expect(extreme).toHaveCSS("overflow", "hidden");
      expect(await extreme.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      expect(await canvasElement.boundingBox()).toEqual(before);
      if (recipientKind === "browser") await expect(page.getByTestId("overlay-content-canvas")).toHaveCSS("overflow", "hidden");
      await oldPage.close();
    });
  }
}
