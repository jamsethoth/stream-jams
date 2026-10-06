import { providerRegistrationAttemptSchema, type RegisteredProviderView } from "@stream-jams/core";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

async function failFirstSave(page: Page, path: string, method: "PATCH" | "PUT" = "PATCH", failures = 1) {
  let attempts = 0;
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== method) { await route.fallback(); return; }
    if (++attempts > failures) { await route.fallback(); return; }
    await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Disposable storage unavailable", id: "ref-final-feedback", nextStep: "Restore local storage and retry." } } });
  });
  return () => attempts;
}

async function assertGuardFailure(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("ref-final-feedback");
  await expect(dialog.getByRole("alert")).toContainText("Restore local storage and retry.");
  // Count the DOM, including behind the modal, so inert content cannot hide duplication.
  await expect(page.locator('[role="alert"]')).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Dismiss error" })).toHaveClass(/mantine-Button-root/u);
  return dialog;
}

function captureUnexpectedErrors(page: Page, expectedFailurePath: string) {
  const unexpected: string[] = [];
  page.on("pageerror", error => unexpected.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.startsWith("[ref-final-feedback] Asset details were not saved")) return;
    if (message.location().url.endsWith(expectedFailurePath) && text === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)") return;
    unexpected.push(text);
  });
  return unexpected;
}

for (const decision of ["selection", "navigation"] as const) {
  test(`rebuilt Assets ${decision} save owns typed failure and retries the retained metadata`, async ({ page }, testInfo) => {
    const fixture = await createProviderSecurityRuntimeFixture();
    try {
      await fixture.start();
      expect((await fixture.request("/health")).status).toBe(200);
      const assets: { id: string }[] = [];
      for (const name of ["First", "Second"]) {
        const filename = name === "First" ? "tiny-image.png" : "tiny-audio.wav";
        const response = await fetch(`${fixture.runtime.url}/assets/import`, { method: "POST", headers: { ...fixture.headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": filename, "x-stream-jams-mime-type": name === "First" ? "image/png" : "audio/wav" }, body: new Uint8Array(await readFile(resolve(`apps/web/public/storybook-assets/${filename}`))) });
        expect(response.status).toBe(201);
        const asset = await response.json() as { id: string };
        assets.push(asset);
        expect((await fixture.request(`/management/assets/${asset.id}`, "PATCH", { displayName: name, tags: [] })).status).toBe(200);
      }
      const path = `/management/assets/${assets[0]!.id}`;
      const errors = captureUnexpectedErrors(page, path);
      const theme = decision === "selection" ? "light" : "dark";
      await page.addInitScript(value => localStorage.setItem("stream-jams-theme", value), theme);
      await page.goto(`${fixture.runtime.url}/manage/assets`);
      await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", theme);
      await page.getByRole("button", { name: "First", exact: true }).click();
      await page.getByRole("textbox", { name: "Display name" }).fill("Retained asset draft");
      const attempts = await failFirstSave(page, path);
      if (decision === "selection") await page.getByRole("button", { name: "Second", exact: true }).click();
      else await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).click();
      const label = decision === "selection" ? "Save and continue" : "Save and leave";
      await page.getByRole("dialog").getByRole("button", { name: label }).click();
      const dialog = await assertGuardFailure(page);
      await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Retained asset draft");
      expect(new URL(page.url()).pathname).toBe("/manage/assets");
      expect(attempts()).toBe(1);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { document.documentElement.dir = "rtl"; });
      await page.screenshot({ path: testInfo.outputPath(`assets-${decision}-390-rtl-error.png`) });
      await dialog.getByRole("button", { name: label }).click();
      await expect(dialog).toHaveCount(0);
      expect(attempts()).toBe(2);
      const saved = await (await fixture.request("/management/assets/library")).json() as { id: string; displayName: string }[];
      expect(saved.find(asset => asset.id === assets[0]!.id)?.displayName).toBe("Retained asset draft");
      expect(errors).toEqual([]);
    } finally { await fixture.close(); }
  });

  test(`rebuilt TTS ${decision} safety save owns typed failure and retries the selected provider`, async ({ page }, testInfo) => {
    const fixture = await createProviderSecurityRuntimeFixture();
    try {
      await fixture.start();
      const providers: RegisteredProviderView[] = [];
      for (const name of ["First speech", "Second speech"]) {
        const response = await fixture.request("/management/providers", "POST", { name, kind: "browser-speech", configuration: {} });
        expect(response.status).toBe(201);
        const result = providerRegistrationAttemptSchema.parse(await response.json());
        if (result.status !== "registered") throw new Error("Disposable speech registration did not complete");
        providers.push(result.provider.provider);
      }
      const path = `/management/providers/${encodeURIComponent(providers[0]!.id)}/tts-safety`;
      const errors = captureUnexpectedErrors(page, path);
      const theme = decision === "selection" ? "light" : "dark";
      await page.addInitScript(value => localStorage.setItem("stream-jams-theme", value), theme);
      await page.goto(`${fixture.runtime.url}/manage/tts-providers`);
      await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", theme);
      await expect(page.getByRole("heading", { name: "First speech", exact: true })).toBeVisible();
      await page.getByRole("spinbutton", { name: "Volume (0–1)" }).fill("0.6");
      const attempts = await failFirstSave(page, path, "PUT");
      if (decision === "selection") await page.getByRole("button", { name: "Select Second speech" }).click();
      else await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).click();
      const label = decision === "selection" ? "Save and continue" : "Save and leave";
      await page.getByRole("dialog").getByRole("button", { name: label }).click();
      const dialog = await assertGuardFailure(page);
      await expect(page.getByRole("spinbutton", { name: "Volume (0–1)" })).toHaveValue("0.6");
      expect(attempts()).toBe(1);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { document.documentElement.dir = "rtl"; });
      await page.screenshot({ path: testInfo.outputPath(`tts-${decision}-390-rtl-error.png`) });
      await dialog.getByRole("button", { name: label }).click();
      await expect(dialog).toHaveCount(0);
      expect(attempts()).toBe(2);
      expect(await (await fixture.request(`/management/providers/${providers[0]!.id}/tts-safety`)).json()).toMatchObject({ volume: 0.6 });
      expect(errors).toEqual([]);
    } finally { await fixture.close(); }
  });
}

test("rebuilt Safety navigation save preserves policy context and one failure owner", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const errors = captureUnexpectedErrors(page, "/moderation/settings");
    await page.addInitScript(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.goto(`${fixture.runtime.url}/manage/modules/alerts/safety`);
    await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "dark");
    await page.getByRole("spinbutton", { name: "Rendered text maximum length" }).fill("300");
    const attempts = await failFirstSave(page, "/moderation/settings");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save and leave" }).click();
    const dialog = await assertGuardFailure(page);
    await expect(page.getByRole("spinbutton", { name: "Rendered text maximum length" })).toHaveValue("300");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.screenshot({ path: testInfo.outputPath("safety-390-rtl-error.png") });
    await dialog.getByRole("button", { name: "Save and leave" }).click();
    await expect(dialog).toHaveCount(0);
    expect(attempts()).toBe(2);
    expect(await (await fixture.request("/moderation/settings")).json()).toMatchObject({ renderedText: { maxLength: 300 } });
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});

test("rebuilt Streamer.bot guard requires consent before issuing a subscription save", async ({ page }) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const provider: RegisteredProviderView = { id: "disposable-bot", name: "Disposable Streamer.bot", kind: "streamerbot", capability: "event-source", active: false, connectionState: "connected", intakeState: "inactive", validatedAt: null, error: null, usedByAlertCount: 0 };
    const errors = captureUnexpectedErrors(page, `/providers/${provider.id}/streamerbot-subscriptions`);
    // Catalog discovery is a typed disposable transport boundary; no physical service is required.
    await page.route("**/management/providers?capability=event-source", route => route.fulfill({ json: [provider] }));
    await page.route(`**/management/providers/${provider.id}`, route => route.fulfill({ json: { provider, configuration: {}, availableVoices: [], ttsSafety: null } }));
    await page.route(`**/management/providers/${provider.id}/activation-impact`, route => route.fulfill({ json: { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] } }));
    const catalog = { providerId: provider.id, available: true, sources: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }], selected: [], unavailableSelections: [], twitchBroadcasterId: null };
    await page.route(`**/providers/${provider.id}/streamerbot-subscriptions`, route => route.fulfill({ json: catalog }));
    const attempts = await failFirstSave(page, `/providers/${provider.id}/streamerbot-subscriptions`, "PUT", 2);
    await page.goto(`${fixture.runtime.url}/manage/event-sources`);
    await page.getByRole("checkbox", { name: "SceneChanged" }).check();
    const consent = page.getByRole("checkbox", { name: /I understand saving changes/ });
    await consent.check();
    await page.getByRole("button", { name: "Save subscriptions" }).click();
    await expect(page.getByRole("alert")).toContainText("ref-final-feedback");
    expect(attempts()).toBe(1);
    await consent.uncheck();
    const home = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home", exact: true });
    await home.click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save and leave" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Cancel to review and confirm");
    await expect(page.locator('[role="alert"]')).toHaveCount(1);
    expect(attempts()).toBe(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("checkbox", { name: /I understand saving changes/ }).check();
    await home.click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save and leave" }).click();
    await assertGuardFailure(page);
    expect(attempts()).toBe(2);
    await expect(page.getByRole("checkbox", { name: "SceneChanged" })).toBeChecked();
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
