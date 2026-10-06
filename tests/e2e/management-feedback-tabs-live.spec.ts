import { createScreenEffectDocument, screenEffectDocumentSchema } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt feedback and tabs preserve drafts, preview ownership, dialog focus and compact themes", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const errors: string[] = [];
    const expectedErrors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.startsWith("[fixture-dialog-ref] Timer action failed")
        || (message.location().url.endsWith("/adjust") && text === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)")) expectedErrors.push(text);
      else errors.push(text);
    });
    const importResponse = await fetch(`${fixture.runtime.url}/assets/import`, {
      method: "POST",
      headers: { ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "fixture.png", "x-stream-jams-mime-type": "image/png" },
      body: new Uint8Array(await readFile(resolve("apps/web/public/storybook-assets/tiny-image.png")))
    });
    expect(importResponse.status).toBe(201);
    const asset = await importResponse.json() as { id: string };
    const draft = createScreenEffectDocument({ id: "fixture-effect", name: "Disposable effect", defaultVariantId: "fixture-variant" });
    const effect = screenEffectDocumentSchema.parse({ ...draft, variants: [{ ...draft.variants[0], visual: { mediaType: "image", assetId: asset.id, layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 } }, visualOutputs: { browserSource: true, desktop: false } }] });
    expect((await fixture.request("/screen-effects", "POST", effect)).status).toBe(201);
    let previews = 0;
    let releases = 0;
    let diagnosticsLoads = 0;
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path === `/assets/${asset.id}/preview` && request.method() === "POST") previews += 1;
      if (path.startsWith("/assets/previews/") && request.method() === "DELETE") releases += 1;
      if (path === "/management/diagnostics/workspace") diagnosticsLoads += 1;
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fixture.runtime.url}/manage/modules/screen-effects/editor/${effect.id}`);
    await expect(page.locator(".screen-effect-preview__canvas img")).toBeVisible();
    expect(previews).toBe(1);
    await page.getByRole("tab", { name: "Effect", exact: true }).click();
    await page.getByLabel("Effect name", { exact: true }).fill("Disposable retained draft");
    await page.getByRole("tab", { name: "Effect", exact: true }).focus();
    await page.keyboard.press("End");
    const triggers = page.getByRole("tab", { name: "Triggers", exact: true });
    await expect(triggers).toBeFocused();
    await expect(triggers).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Effect name", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", await triggers.getAttribute("id") as string);
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Variant", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Effect name", { exact: true })).toHaveValue("Disposable retained draft");
    expect(previews).toBe(1);
    expect(releases).toBe(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Screen Effect saved." })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("effects-editor-desktop-light.png") });
    await page.getByRole("button", { name: "Dismiss success" }).click();
    await page.getByRole("button", { name: "Back to Screen Effects" }).click();
    await expect(page.locator(".screen-effect-editor")).toHaveCount(0);
    await expect.poll(() => releases).toBe(1);

    const timerResponse = await fixture.request("/timers", "POST", { label: "Disposable timer with a long readable identity for compact feedback", durationMs: 60000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, eventRules: [] });
    expect(timerResponse.status).toBe(201);
    const timer = await timerResponse.json() as { id: string; label: string };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { localStorage.setItem("stream-jams-theme", "dark"); });
    await page.goto(`${fixture.runtime.url}/manage/modules/timers`);
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.getByRole("button", { name: timer.label }).click();
    const dialog = page.getByRole("dialog", { name: `Edit ${timer.label}` });
    await page.route(`**/timers/${timer.id}/adjust`, route => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Disposable adjustment failure", id: "fixture-dialog-ref", nextStep: "Restart the disposable service." } } }));
    await dialog.getByRole("button", { name: "Apply adjustment" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(1);
    await expect(dialog.getByRole("alert")).toContainText("fixture-dialog-ref");
    await page.screenshot({ path: testInfo.outputPath("timer-feedback-dialog-390-dark-rtl.png") });
    const dismiss = dialog.getByRole("button", { name: "Dismiss error" });
    await dismiss.focus();
    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("link", { name: "Open Diagnostics" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Apply adjustment" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: timer.label }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { localStorage.setItem("stream-jams-theme", "light"); });
    await page.reload();
    await page.getByRole("radio", { name: "Landscape", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Vertical", exact: true })).toBeChecked();
    await expect(page.getByLabel("vertical timer preview", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("timers-desktop-light.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { localStorage.setItem("stream-jams-theme", "dark"); });
    await page.reload();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("radiogroup", { name: "Timer profile" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radiogroup", { name: "Timer profile" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("timers-390-dark-rtl.png") });

    await page.goto(`${fixture.runtime.url}/manage/diagnostics`);
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "Open problems" })).toBeVisible();
    const problems = page.getByRole("tab", { name: /Problems/ });
    await problems.focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: /Raw logs/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await page.keyboard.press("Home");
    await expect(problems).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: /Events/ })).toHaveAttribute("aria-selected", "true");
    expect(diagnosticsLoads).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("diagnostics-390-dark-rtl.png") });
    expect(expectedErrors).toHaveLength(4);
    expect(errors).toEqual([]);
  } finally {
    await fixture.close();
  }
});
