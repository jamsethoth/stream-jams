import type { AssetLibraryItem } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt Assets retains real import, usage, dirty choices, stable replacement, pending deletion and compact themes", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${fixture.runtime.url}/manage/assets`);
    await expect(page.getByText("No assets imported yet.")).toBeVisible();
    for (const asset of [
      { file: "tiny-image.png", name: "Disposable image", tags: " Seasonal, FIXTURE, seasonal " },
      { file: "tiny-audio.wav", name: "Disposable audio", tags: "audio, fixture" }
    ]) {
      await page.getByRole("button", { name: "Add asset" }).click();
      await page.getByRole("tab", { name: "Upload new" }).click();
      const picker = page.getByRole("dialog", { name: "Choose asset" });
      await picker.getByLabel("Asset file").setInputFiles(resolve(`apps/web/public/storybook-assets/${asset.file}`));
      await picker.getByLabel("Display name").fill(asset.name);
      await picker.getByLabel("Tags", { exact: true }).fill(asset.tags);
      await picker.getByRole("button", { name: "Upload and use" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: asset.name, exact: true })).toBeVisible();
    }
    const library = await (await fixture.request("/management/assets/library")).json() as AssetLibraryItem[];
    const image = library.find(item => item.displayName === "Disposable image")!;
    const audio = library.find(item => item.displayName === "Disposable audio")!;
    expect(image.tags).toEqual(["seasonal", "fixture"]);
    const timerResponse = await fixture.request("/timers", "POST", { label: "Disposable usage", durationMs: 60_000, iconAssetId: image.id, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, eventRules: [] });
    expect(timerResponse.status).toBe(201);
    const timer = await timerResponse.json() as { id: string };
    await page.reload();
    await page.getByRole("button", { name: "Disposable image", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete asset" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Disposable usage" })).toHaveAttribute("href", `/manage/modules/timers?ownerId=${timer.id}`);
    await expect(page.locator(".asset-library__preview img")).toBeVisible();
    await page.getByLabel("Display name", { exact: true }).fill("Draft image");
    await page.getByRole("button", { name: "Disposable audio", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Switch assets with unsaved changes?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Draft image");
    await page.getByRole("button", { name: "Disposable audio", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Switch assets with unsaved changes?" });
    await dialog.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("region", { name: "Disposable audio details" })).toBeVisible();
    await expect(page.locator(".asset-library__preview audio")).toHaveAttribute("controls", "");
    await page.getByRole("button", { name: "Disposable image", exact: true }).click();
    const savedName = "Saved image with a long user name that wraps without hiding its health or actions at compact width";
    await page.getByLabel("Display name", { exact: true }).fill(savedName);
    await page.getByRole("button", { name: "Save asset details" }).click();
    await expect(page.getByRole("button", { name: savedName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Replace file" }).click();
    await page.getByLabel("Replacement file").setInputFiles(resolve("apps/web/public/storybook-assets/tiny-image.png"));
    await page.getByRole("button", { name: "Review replacement" }).click();
    dialog = page.getByRole("dialog", { name: `Replace ${savedName}?` });
    await expect(dialog.getByText("1 Timer usage will update everywhere.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Disposable usage" })).toHaveAttribute("href", `/manage/modules/timers?ownerId=${timer.id}`);
    await dialog.getByRole("button", { name: "Replace everywhere" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const replaced = await (await fixture.request("/management/assets/library")).json() as AssetLibraryItem[];
    expect(replaced.find(item => item.displayName === savedName)?.id).toBe(image.id);
    await page.getByText("More filters", { exact: true }).click();
    await page.getByLabel("Module", { exact: true }).selectOption("timers");
    await page.getByRole("checkbox", { name: "fixture", exact: true }).check();
    await expect(page.getByLabel("2 active secondary filters")).toBeVisible();
    await page.getByText("More filters").click();
    await expect(page.getByRole("button", { name: "Disposable audio", exact: true })).toHaveCount(0);
    await page.getByText("More filters").click();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByText("More filters", { exact: true }).click();
    for (const presentation of [
      { name: "assets-desktop-light", width: 1440, theme: "light", dir: "ltr" },
      { name: "assets-390-light", width: 390, theme: "light", dir: "ltr" },
      { name: "assets-390-rtl-dark", width: 390, theme: "dark", dir: "rtl" }
    ]) {
      await page.setViewportSize({ width: presentation.width, height: 844 });
      await page.evaluate(theme => localStorage.setItem("stream-jams-theme", theme), presentation.theme);
      await page.reload();
      await page.evaluate(dir => { document.documentElement.dir = dir; document.documentElement.lang = dir === "rtl" ? "ar" : "en"; }, presentation.dir);
      await expect(page.getByRole("button", { name: savedName, exact: true })).toBeVisible();
      await page.getByRole("button", { name: savedName, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", presentation.theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${presentation.name}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Disposable audio", exact: true }).click();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let deletes = 0;
    await page.route(`**/management/assets/${audio.id}`, async route => {
      if (route.request().method() !== "DELETE") { await route.continue(); return; }
      deletes += 1; await gate; await route.continue();
    });
    await page.getByRole("button", { name: "Delete asset" }).click();
    dialog = page.getByRole("dialog", { name: "Delete Disposable audio?" });
    await dialog.getByRole("button", { name: "Delete asset" }).dblclick();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.locator(".mantine-Modal-overlay").click({ position: { x: 2, y: 2 }, force: true });
    await expect(dialog).toBeVisible();
    expect(deletes).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("assets-390-rtl-delete-pending.png") });
    release();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Disposable audio", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Asset library", exact: true })).toBeFocused();
    await page.getByLabel("Display name", { exact: true }).fill("Navigation draft");
    await page.getByRole("button", { name: "Navigation", exact: true }).click();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
