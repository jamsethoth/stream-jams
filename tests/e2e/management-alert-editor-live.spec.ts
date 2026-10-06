import { alertEditorDocumentSchema, compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle, type AlertSetDetail, type AlertSetOverview } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt Alerts editor preserves shared audio drafts, reviewed save retry, keyboard tabs and compact guard", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const errors: string[] = [];
    const expectedFailureUrls = new Set<string>();
    const expectedFailures: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() !== "error") return;
      if (expectedFailureUrls.has(message.location().url) && message.text() === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)") expectedFailures.push(message.location().url);
      else errors.push(message.text());
    });
    const sets = await (await fixture.request("/management/alert-sets")).json() as AlertSetOverview[];
    const set = await (await fixture.request(`/management/alert-sets/${sets[0]!.id}`)).json() as AlertSetDetail;
    const alertId = set.inventory.find(alert => alert.eventType === "follow" && alert.kind === "default")!.id;
    expectedFailureUrls.add(`${fixture.runtime.url}/management/alerts/${alertId}/editor`);
    const original = alertEditorDocumentSchema.parse(await (await fixture.request(`/management/alerts/${alertId}/editor`)).json());
    const imported = await fetch(`${fixture.runtime.url}/assets/import`, {
      method: "POST", headers: { ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "disposable-video.mp4", "x-stream-jams-mime-type": "video/mp4" },
      body: new Uint8Array(await readFile(resolve("apps/web/public/storybook-assets/tiny-video.mp4")))
    });
    expect(imported.status).toBe(201);
    const asset = await imported.json() as { id: string };
    const animation = { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" };
    const prepared = alertEditorDocumentSchema.parse({ ...original, name: "Disposable editor alert", enabled: true, durationMode: "custom", durationMs: 5000,
      layers: [{ id: "fixture-text", name: "Message", type: "text", visible: true, order: 0, animation, template: "Hello {userName}", textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle },
        { id: "fixture-video", name: "Disposable soundtrack", type: "video", visible: true, order: 1, animation, assetId: asset.id, playEmbeddedAudio: true, audioVolume: 1 }],
      targetProfiles: original.targetProfiles.map(profile => ({ ...profile, enabled: profile.id === "landscape", reviewState: "ready", layerLayouts: [{ layerId: "fixture-text", x: 100, y: 100, width: 600, height: 100, zIndex: 0 }, { layerId: "fixture-video", x: 100, y: 250, width: 400, height: 225, zIndex: 1 }] })),
      outputs: { browserSource: true, deviceRouteIds: [] }
    });
    const initialSave = await fixture.request(`/management/alerts/${alertId}/editor`, "PUT", { document: prepared, confirmLiveImpact: true });
    expect(initialSave.status, JSON.stringify(await initialSave.json())).toBe(200);
    expect((await fixture.request(`/management/alert-sets/${set.overview.id}/starter-review`, "POST")).status).toBe(200);
    expect((await fixture.request(`/management/alert-sets/${set.overview.id}/activate`, "POST", { confirmWarnings: true })).status).toBe(200);
    await fixture.stop();
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const editorUrl = `${fixture.runtime.url}/manage/modules/alerts/editor/${alertId}`;
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(editorUrl);
    await page.getByRole("button", { name: "Disposable soundtrack Video/GIF", exact: true }).click();
    const volume = page.getByRole("spinbutton", { name: "Embedded audio volume", exact: true });
    await volume.fill("150");
    await page.getByRole("checkbox", { name: "Fade out", exact: true }).check();
    await page.getByRole("spinbutton", { name: "Fade out duration (milliseconds)", exact: true }).fill("700");
    await page.getByRole("textbox", { name: "Layer name", exact: true }).fill("Disposable " + "layer-name".repeat(9));
    await page.screenshot({ path: testInfo.outputPath("alerts-shared-audio-desktop-light.png") });
    await page.locator(".alert-editor-inspector__layer-list").screenshot({ path: testInfo.outputPath("alerts-long-layer-name.png") });
    await page.getByRole("tab", { name: "Layers", exact: true }).focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Event", exact: true })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Event", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(volume).toHaveValue("150");
    await page.getByRole("tab", { name: "Alert", exact: true }).click();
    const savedName = "Disposable " + "long-name".repeat(12);
    await page.getByRole("textbox", { name: "Alert name", exact: true }).fill(savedName);
    await page.getByRole("radio", { name: "Custom", exact: true }).check();
    await page.getByRole("spinbutton", { name: "Duration (milliseconds)", exact: true }).fill("6500");
    let requests = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolveGate => { release = resolveGate; });
    await page.route(`**/management/alerts/${alertId}/editor`, async route => {
      if (route.request().method() !== "PUT") { await route.continue(); return; }
      requests += 1;
      await gate;
      await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Disposable storage failed", id: "fixture-editor-save", nextStep: "Restart disposable storage, then retry this review." } } });
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Save changes to active alert?", exact: true });
    await review.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(review.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(review).toBeVisible();
    expect(requests).toBe(1);
    release();
    await expect(review.getByRole("alert")).toContainText("fixture-editor-save");
    await expect(review.getByRole("alert")).toContainText("Restart disposable storage");
    await expect(page.getByRole("alert")).toHaveCount(1);
    await review.getByRole("button", { name: "Dismiss error", exact: true }).focus();
    await expect(review.getByRole("button", { name: "Dismiss error", exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("alerts-active-save-typed-failure.png") });
    await page.unroute(`**/management/alerts/${alertId}/editor`);
    await review.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(page.getByText("Alert saved.", { exact: true })).toBeVisible();
    const saved = alertEditorDocumentSchema.parse(await (await fixture.request(`/management/alerts/${alertId}/editor`)).json());
    expect(saved.name).toBe(savedName);
    expect(saved.durationMs).toBe(6500);
    expect(saved.layers.find(layer => layer.type === "video")).toMatchObject({ audioVolume: 1.5, audioFadeOutMs: 700 });
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.reload();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.getByRole("tab", { name: "Event", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Session payload (JSON)", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("alerts-event-desktop-dark-rtl.png") });
    await page.setViewportSize({ width: 820, height: 768 });
    const tabletCanvas = page.getByRole("region", { name: "Landscape alert canvas" });
    await expect(tabletCanvas).toBeVisible();
    await tabletCanvas.scrollIntoViewIfNeeded();
    expect((await tabletCanvas.boundingBox())!.height).toBeGreaterThanOrEqual(160);
    expect(await page.locator(".alert-editor-page__stage").evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
    await page.screenshot({ path: testInfo.outputPath("alerts-tablet-canvas-dark-rtl.png") });
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.getByRole("tab", { name: "Alert", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("spinbutton", { name: "Duration (milliseconds)", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("alerts-tablet-inspector-dark-rtl.png") });
    await page.getByRole("tab", { name: "Event", exact: true }).click();
    await page.setViewportSize({ width: 900, height: 1900 });
    const payload = page.getByRole("textbox", { name: "Session payload (JSON)", exact: true });
    await payload.fill("invalid JSON");
    await expect(payload).toHaveAttribute("aria-invalid", "true");
    await expect(payload).toHaveAttribute("aria-describedby", /alert-editor-sample-error/);
    await payload.blur();
    await page.locator(".mantine-Textarea-root").filter({ has: payload }).scrollIntoViewIfNeeded();
    const sampleError = page.locator("#alert-editor-sample-error");
    await payload.evaluate(node => {
      const pane = node.closest(".alert-editor-page__inspector")!;
      const wrapper = node.closest(".mantine-Textarea-root")!;
      pane.scrollTop += wrapper.getBoundingClientRect().top - pane.getBoundingClientRect().top - 10;
    });
    await expect(sampleError).toBeInViewport();
    await expect(page.getByText("Session payload (JSON)", { exact: true })).toBeInViewport();
    await expect(payload).toHaveCSS("border-color", await sampleError.evaluate(node => getComputedStyle(node).color));
    await page.screenshot({ path: testInfo.outputPath("alerts-tablet-invalid-field-dark-rtl.png") });
    await page.getByRole("button", { name: "Reset sample", exact: true }).click();
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.getByRole("tab", { name: "Alert", exact: true }).click();
    await page.getByRole("button", { name: "Copy design from...", exact: true }).click();
    const copy = page.getByRole("dialog", { name: "Copy design from another alert?", exact: true });
    const sourceId = await copy.getByRole("combobox", { name: "Source alert", exact: true }).inputValue();
    expectedFailureUrls.add(`${fixture.runtime.url}/management/alerts/${sourceId}/editor`);
    let releaseCopy!: () => void;
    const copyGate = new Promise<void>(resolveCopy => { releaseCopy = resolveCopy; });
    await page.route(`**/management/alerts/${sourceId}/editor`, async route => {
      await copyGate;
      await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Disposable source unavailable", id: "fixture-editor-copy", nextStep: "Choose another disposable source." } } });
    });
    await copy.getByRole("button", { name: "Copy design", exact: true }).click();
    await expect(copy.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(copy).toBeVisible();
    releaseCopy();
    await expect(copy.getByRole("alert")).toContainText("fixture-editor-copy");
    await expect(page.getByRole("alert")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("alerts-copy-typed-failure-tablet-dark-rtl.png") });
    await copy.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Alert name", exact: true })).toHaveValue(savedName);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Alert editor requires a larger screen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to alerts", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("alerts-390-dark-rtl-guard.png") });
    expect(expectedFailures).toEqual([`${fixture.runtime.url}/management/alerts/${alertId}/editor`, `${fixture.runtime.url}/management/alerts/${sourceId}/editor`]);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
