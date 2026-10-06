import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt Effects and Timers preserve module order, saved inventory and guarded correction links", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.startsWith("[fixture-stage5-ref]") || text === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)") return;
      errors.push(text);
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${fixture.runtime.url}/manage/modules/screen-effects#browser-sources`);
    const effectsOutputs = page.getByRole("region", { name: "Browser sources", exact: true });
    await expect(effectsOutputs.getByRole("button", { name: "Collapse browser sources" })).toBeFocused();
    expect(await page.getByLabel("Module controls").evaluate((controls, outputs) => Boolean(controls.compareDocumentPosition(outputs!) & Node.DOCUMENT_POSITION_FOLLOWING), await effectsOutputs.elementHandle())).toBe(true);
    await page.getByRole("button", { name: "Create set", exact: true }).click();
    const createSet = page.getByRole("dialog", { name: "Create set", exact: true });
    await createSet.getByRole("textbox", { name: "Set name" }).fill("Disposable Stage5 set");
    await createSet.getByRole("button", { name: "Save set" }).click();
    const createdSet = page.getByRole("region", { name: "Disposable Stage5 set Screen Effect set" });
    await expect(createdSet.getByText("Inactive set", { exact: true })).toBeVisible();
    const savedSets = await (await fixture.request("/screen-effect-sets")).json() as { name: string; active: boolean }[];
    expect(savedSets.find(set => set.name === "Disposable Stage5 set")?.active).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("effects-desktop-light.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.reload();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await expect(createdSet.getByText("Inactive set", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("effects-390-dark-rtl.png") });
    await createdSet.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("effects-inventory-390-dark-rtl.png") });
    await page.goto(`${fixture.runtime.url}/manage/modules/timers#browser-sources`);
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    const timerOutputs = page.getByRole("region", { name: "Browser sources", exact: true });
    await expect(timerOutputs.getByRole("button", { name: "Collapse browser sources" })).toBeFocused();
    expect(await page.getByLabel("Module controls").evaluate((controls, outputs) => Boolean(controls.compareDocumentPosition(outputs!) & Node.DOCUMENT_POSITION_FOLLOWING), await timerOutputs.elementHandle())).toBe(true);
    await page.getByRole("button", { name: "New timer", exact: true }).click();
    const createTimer = page.getByRole("dialog", { name: "Create timer", exact: true });
    await createTimer.getByRole("textbox", { name: "Name", exact: true }).fill("Disposable Stage5 timer");
    await createTimer.getByRole("spinbutton", { name: "Duration (seconds)", exact: true }).fill("90");
    await createTimer.getByRole("button", { name: "Create timer", exact: true }).click();
    await expect(page.getByRole("article", { name: "Disposable Stage5 timer timer" })).toBeVisible();
    const savedTimers = await (await fixture.request("/timers")).json() as { label: string; durationMs: number }[];
    expect(savedTimers.find(timer => timer.label === "Disposable Stage5 timer")?.durationMs).toBe(90000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("timers-390-dark-rtl.png") });
    await page.getByRole("article", { name: "Disposable Stage5 timer timer" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("timers-inventory-390-dark-rtl.png") });

    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/overlay-modules/timers/enabled", async route => {
      calls += 1;
      if (calls > 1) await gate;
      await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Disposable storage unavailable", id: "fixture-stage5-ref", nextStep: "Wait for the disposable service, then retry." } } });
    });
    const trigger = page.getByRole("button", { name: /^(Enable|Disable) Timers module$/ });
    await trigger.click();
    const review = page.getByRole("dialog", { name: /Timers module\?/ });
    await review.getByRole("button", { name: "Confirm change" }).click();
    await expect(review.getByRole("alert")).toContainText("fixture-stage5-ref");
    const correction = review.getByRole("link", { name: "Open Diagnostics" });
    await expect(correction).toHaveAttribute("href", "/manage/diagnostics?reference=fixture-stage5-ref");
    await review.getByRole("button", { name: "Confirm change" }).click();
    await expect(review.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(correction).toHaveCount(0); // No child anchor reaches ManagementApp's capture navigation while pending.
    await page.keyboard.press("Escape");
    await expect(review).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(review).toBeVisible();
    expect(calls).toBe(2);
    expect(page.url()).toContain("/manage/modules/timers");
    release();
    await expect(review.getByRole("alert")).toContainText("Wait for the disposable service");
    await expect(page.getByRole("alert")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("timers-confirmation-390-dark-rtl.png") });
    await review.getByRole("button", { name: "Cancel" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(review.getByRole("alert")).toHaveCount(0);
    await review.getByRole("button", { name: "Cancel" }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.dir = "ltr"; window.scrollTo(0, 0); });
    await page.screenshot({ path: testInfo.outputPath("timers-desktop-dark.png") });
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
