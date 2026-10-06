import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt Alerts and Music preserve composed order, correction focus, saved drafts and pending confirmations", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.startsWith("[fixture-module-ref]") || text === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)") return;
      errors.push(text);
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${fixture.runtime.url}/manage/modules/alerts#browser-sources`);
    const alertsOutputs = page.getByRole("region", { name: "Browser sources", exact: true });
    const toggle = alertsOutputs.getByRole("button", { name: "Collapse browser sources" });
    await expect(toggle).toBeFocused();
    await expect(alertsOutputs.getByRole("article", { name: "Landscape browser source" })).toBeVisible();
    expect(await page.getByLabel("Module controls").evaluate((controls, outputs) => Boolean(controls.compareDocumentPosition(outputs!) & Node.DOCUMENT_POSITION_FOLLOWING), await alertsOutputs.elementHandle())).toBe(true);
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(toggle).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("alerts-desktop-light.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.reload();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("alerts-390-dark-rtl.png") });

    await page.getByRole("button", { name: "Rename Default", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("alerts-inventory-390-dark-rtl.png") });

    await page.getByRole("button", { name: "Add alert", exact: true }).click();
    const createAlert = page.getByRole("dialog", { name: "Add alert", exact: true });
    await createAlert.getByRole("combobox", { name: "Event type", exact: true }).selectOption("cheer");
    await createAlert.getByRole("textbox", { name: "Alert name", exact: true }).fill("Disposable Stage4 alert");
    await createAlert.getByRole("button", { name: "Create alert", exact: true }).click();
    await expect(createAlert).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Disposable Stage4 alert", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("alerts-created-390-dark-rtl.png") });

    await page.goto(`${fixture.runtime.url}/manage/modules/music#music-appearance`);
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await expect(page.getByRole("button", { name: "Collapse appearance" })).toBeFocused();
    await expect(page.getByLabel("Appearance component")).toBeVisible();
    await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("light");
    await page.getByRole("button", { name: "Save Music appearance" }).click();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const saved = await (await fixture.request("/overlay-modules/music/config")).json() as { config: { profiles: { landscape: { theme: string } } } };
    expect(saved.config.profiles.landscape.theme).toBe("light");
    const trigger = page.getByRole("button", { name: /^(Enable|Disable) Music module$/ });
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/overlay-modules/music/enabled", async route => {
      calls += 1;
      await gate;
      await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Disposable storage unavailable", id: "fixture-module-ref", nextStep: "Restart the disposable service, then retry." } } });
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: /Music module\?/ });
    await dialog.getByRole("button", { name: "Confirm change" }).click();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(calls).toBe(1);
    release();
    await expect(dialog.getByRole("alert")).toContainText("fixture-module-ref");
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(dialog.getByRole("alert")).toContainText("Restart the disposable service");
    await page.screenshot({ path: testInfo.outputPath("music-confirmation-390-dark-rtl.png") });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Collapse appearance" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("music-390-dark-rtl.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.dir = "ltr"; });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("music-desktop-dark.png") });
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
