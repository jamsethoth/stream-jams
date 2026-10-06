import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

// This exercises real production sessions in disposable data. Never put scoped
// credentials or output keys into traces, screenshots or failure videos.
test.use({ trace: "off", screenshot: "off", video: "off" });
test("built management foundation covers every route, theme reload/system changes and native surfaces under CSP", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await context.addInitScript(() => {
      (window as unknown as { cspViolations: string[] }).cspViolations = [];
      document.addEventListener("securitypolicyviolation", event => (window as unknown as { cspViolations: string[] }).cspViolations.push(event.violatedDirective));
    });
    const setResponse = await fixture.request("/management/alert-sets", "POST", { name: "Foundation fixture" });
    expect(setResponse.status).toBe(201);
    const set = await setResponse.json() as { id: string };
    const alertResponse = await fixture.request(`/management/alert-sets/${set.id}/alerts`, "POST", { name: "Foundation alert", eventType: "follow" });
    expect(alertResponse.status).toBe(201);
    const alert = await alertResponse.json() as { id: string };
    const routes = [
      ["/manage", "Home"], ["/manage/event-sources", "Event sources"], ["/manage/tts-providers", "TTS providers"],
      ["/manage/music-sources", "Music sources"], ["/manage/modules/alerts", "Alerts"], ["/manage/modules/screen-effects", "Screen Effects"],
      ["/manage/modules/timers", "Timers"], ["/manage/modules/music", "Music"], ["/manage/modules/alerts/safety", "Alert safety"],
      ["/manage/assets", "Assets"], ["/manage/diagnostics", "Diagnostics"], ["/manage/settings", "Settings"],
      [`/manage/modules/alerts/editor/${alert.id}`, "Foundation alert"], ["/manage/modules/screen-effects/editor/foundation-effect?new=1", "New Screen Effect"]
    ] as const;
    for (const [path, title] of routes) {
      const response = await page.goto(`${fixture.runtime.url}${path}`);
      expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(response?.headers()["content-security-policy"]).not.toContain("unsafe-eval");
      await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
      await expect(page.getByText("The management interface stopped unexpectedly")).toHaveCount(0);
      await expect.poll(() => page.locator(".management-main").innerText()).not.toMatch(/Loading (?:Music|Settings|Screen Effect|alert editor)/u);
      expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
    }
    await page.goto(`${fixture.runtime.url}/manage/settings`);
    const chooseTheme = async (name: "Dark" | "Light" | "System") => {
      const radio = page.getByRole("radio", { name });
      const label = page.locator(`label[for="${await radio.getAttribute("id")}"]`);
      await expect(label).toBeVisible();
      await label.click();
      await expect(radio).toBeChecked();
    };
    await chooseTheme("Dark");
    await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "dark");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await chooseTheme("System");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "dark");
    await chooseTheme("Light");
    await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "light");
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /theme|color-scheme/u.test(key)))).toEqual(["stream-jams-theme"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.lang = "ar"; document.documentElement.dir = "rtl"; });
    await expect(page.locator('label[for="theme-preference-light"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("foundation-settings-390-rtl-light.png") });
    await chooseTheme("Dark");
    await page.screenshot({ path: testInfo.outputPath("foundation-settings-390-rtl-dark.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${fixture.runtime.url}/manage/modules/timers`);
    await page.getByRole("button", { name: "New timer" }).click();
    const timerDialog = page.getByRole("dialog", { name: "Create timer" });
    await timerDialog.getByLabel("Name", { exact: true }).fill("Foundation timer");
    await timerDialog.getByLabel("Duration (seconds)").fill("600");
    await timerDialog.getByRole("button", { name: "Create timer", exact: true }).click();
    await expect(timerDialog).not.toBeVisible();
    const definition = fixture.runtime.composition.timerManagementService.listDefinitions().find(item => item.label === "Foundation timer")!;
    await fixture.runtime.composition.timerRuntimeCoordinator.start(definition.id);
    await fixture.runtime.composition.timerRuntimeCoordinator.pause(definition.id);
    await page.goto(`${fixture.runtime.url}/operator`);
    const timerCard = page.getByRole("article").filter({ has: page.getByText("Foundation timer", { exact: true }) });
    await expect(timerCard).toContainText("paused");
    await timerCard.getByText("Adjust time", { exact: true }).click();
    await timerCard.getByRole("combobox", { name: "Adjustment", exact: true }).selectOption("set");
    await timerCard.getByLabel("Time (seconds)").fill("300");
    await timerCard.getByRole("button", { name: "Apply adjustment" }).click();
    await expect.poll(() => fixture.runtime.composition.timerRuntimeCoordinator.getState(definition.id)).toMatchObject({ status: "paused", remainingMs: 300_000 });
    expect(await page.evaluate(() => document.querySelector("[data-mantine-color-scheme]") === null)).toBe(true);
    const cssResources = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name).filter(url => new URL(url).pathname.endsWith(".css")));
    for (const url of cssResources) expect(await (await page.request.get(url)).text()).not.toContain("--mantine-");
    const outputResponse = await fixture.request("/management/overlay-outputs/keys", "POST", { scope: "module", moduleId: "timers", purpose: "live", targetProfileId: "landscape" });
    expect(outputResponse.ok).toBe(true);
    const output = await outputResponse.json() as { url: string };
    await page.goto(output.url);
    await expect(page.locator("body")).toHaveClass(/overlay-shell/u);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    expect(await page.evaluate(() => document.querySelector("[data-mantine-color-scheme]") === null)).toBe(true);
    expect(await readFile("apps/web/dist-desktop-overlay/overlay.css", "utf8")).not.toContain("--mantine-");
    expect(await readFile("apps/web/dist-desktop-overlay/overlay.js", "utf8")).not.toContain("mantine-");
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
