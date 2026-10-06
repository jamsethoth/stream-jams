import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt operational pages retain setup validation, saved safety and compact dirty navigation", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    const errors: string[] = [];
    const providerName = "Disposable browser speech with a long setup name for a compact management screen";
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 1280, height: 900 });
    const response = await page.goto(`${fixture.runtime.url}/manage`);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.getByRole("heading", { name: "Setup readiness" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("home-desktop-light.png") });
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Event sources" }).click();
    await expect(page.getByText("No event sources registered.")).toBeVisible();
    await page.getByRole("button", { name: "Add event source" }).click();
    const eventSetup = page.getByRole("dialog");
    await eventSetup.getByRole("combobox", { name: "Provider type" }).selectOption("streamerbot");
    await eventSetup.getByRole("button", { name: "Continue" }).click();
    const testConnection = eventSetup.getByRole("button", { name: "Test connection" });
    await expect(testConnection).toBeDisabled();
    await eventSetup.getByRole("checkbox", { name: "Allow an unauthenticated local connection" }).check();
    await eventSetup.getByRole("textbox", { name: "Host", exact: true }).fill("example.com");
    await testConnection.click();
    await expect(eventSetup.getByRole("alert")).toBeVisible();
    expect(await (await fixture.request("/management/providers?capability=event-source")).json()).toEqual([]);
    await eventSetup.getByRole("button", { name: "Cancel" }).click();
    await page.screenshot({ path: testInfo.outputPath("event-sources-desktop-light.png") });

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "TTS providers" }).click();
    await page.getByRole("button", { name: "Add TTS provider" }).click();
    const ttsSetup = page.getByRole("dialog");
    await ttsSetup.getByRole("combobox", { name: "Provider type" }).selectOption("browser-speech");
    await ttsSetup.getByRole("button", { name: "Continue" }).click();
    await ttsSetup.getByRole("textbox", { name: "Connection name" }).fill(providerName);
    await ttsSetup.getByRole("button", { name: "Test connection" }).click();
    await expect(ttsSetup.getByRole("heading", { name: "Review TTS provider" })).toBeVisible();
    await ttsSetup.getByRole("button", { name: "Register TTS provider" }).click();
    await expect(page.getByRole("heading", { name: providerName })).toBeVisible();
    const providers = await (await fixture.request("/management/providers?capability=tts")).json() as { id: string; active: boolean }[];
    expect(providers).toHaveLength(1);
    expect(providers[0]?.active).toBe(true);
    await page.getByRole("spinbutton", { name: "Volume (0–1)" }).fill("0.6");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }).click();
    const dirty = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
    await expect(dirty).toBeVisible();
    await dirty.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Volume (0–1)" })).toHaveValue("0.6");
    await page.getByRole("button", { name: "Save safety settings" }).click();
    await expect(page.getByText("TTS safety settings saved.", { exact: true })).toBeVisible();
    const safety = await (await fixture.request(`/management/providers/${providers[0]!.id}/tts-safety`)).json() as { volume: number };
    expect(safety.volume).toBe(0.6);
    await page.screenshot({ path: testInfo.outputPath("tts-providers-desktop-light.png") });

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Safety", exact: true }).click();
    const maximum = page.getByRole("spinbutton", { name: "Rendered text maximum length" });
    await maximum.fill("");
    await page.getByRole("button", { name: "Preview example" }).click();
    await expect(maximum).toHaveAttribute("aria-invalid", "true");
    await expect(maximum).toHaveAccessibleDescription("Enter a whole number from 1 to 10000.");
    await maximum.fill("32");
    await page.getByRole("textbox", { name: "Rendered text blocked terms" }).fill("spoiler\nSPOILER");
    await page.getByRole("checkbox", { name: "Rendered text strip web links" }).check();
    await page.getByRole("button", { name: "Preview example" }).click();
    await expect(page.getByRole("region", { name: "Rendered text preview" })).toBeVisible();
    await page.getByRole("button", { name: "Save safety settings" }).click();
    await expect(page.getByText("Safety settings saved.", { exact: true })).toBeVisible();
    const saved = await (await fixture.request("/moderation/settings")).json() as { renderedText: { maxLength: number; blockedTerms: string[]; stripUrls: boolean } };
    expect(saved.renderedText).toEqual({ maxLength: 32, blockedTerms: ["spoiler"], stripUrls: true });
    await page.screenshot({ path: testInfo.outputPath("alert-safety-desktop-light.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.reload();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await maximum.fill("48");
    const menu = page.getByRole("button", { name: "Navigation", exact: true });
    await menu.click();
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }).click();
    await expect(dirty).toBeVisible();
    await dirty.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Revert changes" }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("alert-safety-390-dark-rtl.png") });
    await maximum.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("alert-safety-fields-390-dark-rtl.png") });
    for (const [label, title, filename] of [
      ["Home", "Home", "home"], ["Event sources", "Event sources", "event-sources"],
      ["TTS providers", "TTS providers", "tts-providers"], ["Music sources", "Music sources", "music-sources"]
    ] as const) {
      await menu.click();
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      if (filename === "home") await expect(page.getByRole("heading", { name: "Setup readiness" })).toBeVisible();
      if (filename === "event-sources") await expect(page.getByText("No event sources registered.")).toBeVisible();
      if (filename === "tts-providers") await expect(page.getByRole("heading", { name: providerName })).toBeVisible();
      if (filename === "music-sources") await expect(page.getByText("No Music sources registered.")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`${filename}-390-dark-rtl.png`) });
      if (filename === "tts-providers") {
        await page.getByRole("spinbutton", { name: "Volume (0–1)" }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("tts-provider-fields-390-dark-rtl.png") });
      }
    }
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
