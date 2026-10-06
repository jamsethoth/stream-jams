import { expect, test, type Locator, type Page } from "@playwright/test";
import { compatibilityAlertTextBoxStyle, compatibilityAlertTextStyle, type AlertEditorDocument, type MusicModuleConfig } from "../../packages/core/dist/index.js";
import { startMusicTestRuntime } from "./music-test-runtime.js";

async function dragTo(page: Page, handle: Locator, surface: Locator, canvasWidth: number, currentX: number, nextX: number, release = true) {
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const scale = (await surface.boundingBox())!.width / canvasWidth;
  const x = box.x + Math.min(8, box.width / 4); const y = box.y + Math.min(8, box.height / 4);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + (nextX - currentX) * scale, y, { steps: 5 });
  if (release) await page.mouse.up();
}

test("Music snaps independently to grid and component alignment with exact keyboard edits", async ({ page }) => {
  const fixture = await startMusicTestRuntime();
  try {
    const saved = await fixture.request<{ enabled: boolean; config: MusicModuleConfig }>("/overlay-modules/music/config");
    saved.config.profiles.landscape.views.full.componentLayout = {
      artwork: { x: 10, y: 10, width: 40, height: 40 }, title: { x: 100, y: 20, width: 100, height: 30 },
      details: { x: 207, y: 70, width: 200, height: 40 }, progress: { x: 100, y: 140, width: 100, height: 4 }, time: { x: 100, y: 150, width: 100, height: 16 }
    };
    await fixture.request("/overlay-modules/music/config", "PUT", saved);
    await page.goto(`${fixture.url}/manage/modules/music`);
    await page.getByRole("button", { name: "Edit layout" }).click();
    const grid = page.getByRole("checkbox", { name: "Snap to grid" });
    const alignment = page.getByRole("checkbox", { name: "Snap to alignment" });
    await expect(grid).toBeChecked(); await expect(alignment).toBeChecked();
    const move = page.getByRole("button", { name: "Move Title", exact: true });
    const surface = page.locator(".music-layout-editor__stage");
    const field = page.getByLabel("Title X (px)");
    await dragTo(page, move, surface, 640, 100, 204, false);
    await expect(field).toHaveValue("207");
    await expect(page.locator(".music-layout-editor__guide").first()).toBeVisible();
    await page.mouse.up();
    await expect(page.locator(".music-layout-editor__guide")).toHaveCount(0);
    await alignment.uncheck();
    await dragTo(page, move, surface, 640, 207, 113);
    await expect(field).toHaveValue("110");
    await grid.uncheck();
    await dragTo(page, move, surface, 640, 110, 113);
    await expect(field).toHaveValue("113");
    await alignment.check();
    await dragTo(page, page.getByRole("button", { name: "Resize Title", exact: true }), surface, 640, 213, 205);
    await expect(page.getByLabel("Title width (px)")).toHaveValue("94");
    await expect(field).toHaveValue("113");
    await grid.check(); await alignment.check();
    await move.focus(); await move.press("ArrowRight"); await expect(field).toHaveValue("114");
    await page.getByRole("button", { name: "Save Music appearance" }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    expect((await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config")).config.profiles.landscape.views.full.componentLayout!.title.x).toBe(114);
  } finally { await fixture.close(); }
});

test("Alerts shares grid and peer alignment snapping and saves exact geometry", async ({ page }) => {
  const fixture = await startMusicTestRuntime();
  try {
    const set = await fixture.request<{ id: string }>("/management/alert-sets", "POST", { name: "Snapping fixture" });
    const alert = await fixture.request<{ id: string }>(`/management/alert-sets/${set.id}/alerts`, "POST", { eventType: "follow", name: "Snapping alert" });
    const document = await fixture.request<AlertEditorDocument>(`/management/alerts/${alert.id}/editor`);
    const animation = { mode: "preset" as const, entrance: "none", exit: "none", durationMs: 300, delayMs: 0, easing: "ease-out" };
    document.layers = ["Moving", "Peer"].map((name, order) => ({ id: name.toLowerCase(), name, type: "text" as const, visible: true, order, template: name, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle, animation }));
    document.targetProfiles = [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [
      { layerId: "moving", x: 100, y: 100, width: 100, height: 60, zIndex: 0 },
      { layerId: "peer", x: 307, y: 300, width: 200, height: 80, zIndex: 1 }
    ] }, { id: "vertical", enabled: false, reviewState: "ready", layerLayouts: [] }];
    await fixture.request(`/management/alerts/${alert.id}/editor`, "PUT", { document });
    await page.goto(`${fixture.url}/manage/modules/alerts/editor/${alert.id}?profile=landscape`);
    const move = page.getByRole("button", { name: "Moving layer", exact: true });
    await move.click();
    await page.locator("summary").filter({ hasText: "Position and size" }).click();
    const x = page.getByRole("group", { name: "Position and size" }).getByLabel("X", { exact: true });
    const grid = page.getByRole("checkbox", { name: "Snap to grid" });
    const alignment = page.getByRole("checkbox", { name: "Snap to alignment" });
    await expect(grid).toBeChecked(); await expect(alignment).toBeChecked();
    const surface = page.locator(".alert-canvas__surface");
    await dragTo(page, move, surface, 1920, 100, 304, false);
    await expect(x).toHaveValue("307");
    await expect(page.locator(".alert-canvas__snap-guide").first()).toBeVisible();
    await page.mouse.up(); await expect(page.locator(".alert-canvas__snap-guide")).toHaveCount(0);
    await alignment.uncheck();
    await dragTo(page, move, surface, 1920, 307, 113);
    await expect(x).toHaveValue("110");
    await grid.uncheck();
    await dragTo(page, move, surface, 1920, 110, 113);
    await expect(x).toHaveValue("113");
    await alignment.check();
    await dragTo(page, move.locator(".alert-canvas__resize-handle"), surface, 1920, 213, 305);
    await expect(page.getByRole("group", { name: "Position and size" }).getByLabel("Width", { exact: true })).toHaveValue("194");
    await expect(x).toHaveValue("113");
    await grid.check(); await alignment.check();
    await move.focus(); await move.press("ArrowRight"); await expect(x).toHaveValue("114");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Alert saved.", { exact: true })).toBeVisible();
    const persisted = await fixture.request<AlertEditorDocument>(`/management/alerts/${alert.id}/editor`);
    expect(persisted.targetProfiles[0]!.layerLayouts.find(layer => layer.layerId === "moving")!.x).toBe(114);
    await page.reload(); await move.click();
    await page.locator("summary").filter({ hasText: "Position and size" }).click();
    await expect(x).toHaveValue("114");
  } finally { await fixture.close(); }
});
