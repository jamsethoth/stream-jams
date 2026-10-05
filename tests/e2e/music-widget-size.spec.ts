import { expect, test } from "@playwright/test";
import type { MusicModuleConfig } from "../../packages/core/dist/index.js";
import { startMusicTestRuntime } from "./music-test-runtime.js";

test("Music widget outer resize snaps, cancels, and saves independently per view", async ({ page }) => {
  const fixture = await startMusicTestRuntime();
  try {
    await page.goto(`${fixture.url}/manage/modules/music`);
    await page.getByRole("button", { name: "Edit layout" }).click();
    await expect(page.getByRole("button", { name: "Move Title" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resize widget", exact: true })).toHaveCount(0);
    const handle = page.getByRole("button", { name: "Resize overall widget" });
    const width = page.getByLabel("Preview widget width (px)");
    const height = page.getByLabel("Preview widget height (px)");
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    const scale = (await page.locator(".music-layout-editor__stage").boundingBox())!.width / 640;
    await page.mouse.move(box.x + 7, box.y + 7); await page.mouse.down();
    await page.mouse.move(box.x + 7 + 83 * scale, box.y + 7 + 25 * scale, { steps: 5 });
    await expect(width).toHaveValue("720"); await expect(height).toHaveValue("200");
    await handle.press("Escape"); await page.mouse.up();
    await expect(width).toHaveValue("640"); await expect(height).toHaveValue("178");
    await page.getByRole("checkbox", { name: "Snap to grid" }).uncheck();
    await width.fill("723"); await width.blur();
    await height.fill("203"); await height.blur();
    await handle.focus(); await handle.press("ArrowRight"); await expect(width).toHaveValue("724");
    const before = await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    expect(before.config.profiles.landscape.views.full.widthPx).toBe(640);
    await page.getByRole("button", { name: "Save Music appearance" }).click();
    await expect(page.getByText("All changes saved")).toBeVisible();
    const saved = await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    expect(saved.config.profiles.landscape.views.full).toMatchObject({ widthPx: 724, heightPx: 203 });
    expect(saved.config.profiles.landscape.views.compact.widthPx).toBe(480);
    expect(saved.config.profiles.vertical.views.full.widthPx).toBe(640);
    await page.reload(); await page.getByRole("button", { name: "Edit layout" }).click();
    await expect(width).toHaveValue("724"); await expect(height).toHaveValue("203");
  } finally { await fixture.close(); }
});
