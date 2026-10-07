import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("rebuilt Settings and Diagnostics retain disposable drafts, scope decisions and filtered evidence", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/health")).status).toBe(200);
    expect((await fixture.request("/management/alert-sets")).status).toBe(200);
    expect((await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: null, purpose: "live", scope: "unified" })).status).toBe(200);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 1280, height: 900 });
    const response = await page.goto(`${fixture.runtime.url}/manage/settings#audio-outputs`);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await page.getByRole("textbox", { name: "New output name" }).fill("Disposable output");
    await expect(page.getByRole("combobox", { name: "New output device" })).toBeDisabled();
    await page.getByRole("button", { name: "Create output" }).click();
    const output = page.getByRole("group", { name: "Disposable output audio output" });
    await expect(output).toBeVisible();
    await output.getByRole("textbox", { name: "Output name" }).fill("Disposable retained draft");
    const audioSummary = page.locator("summary").filter({ hasText: "Audio outputs" });
    await audioSummary.click();
    await audioSummary.click();
    await expect(output.getByRole("textbox", { name: "Output name" })).toHaveValue("Disposable retained draft");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Diagnostics", exact: true }).click();
    const dirty = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
    await dirty.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(output.getByRole("textbox", { name: "Output name" })).toHaveValue("Disposable retained draft");
    await output.getByRole("button", { name: "Save output" }).click();
    const audio = await (await fixture.request("/audio/status")).json() as { routes: { route: { id: string; name: string; deviceId: string | null } }[] };
    expect(audio.routes).toHaveLength(1);
    expect(audio.routes[0]?.route).toMatchObject({ name: "Disposable retained draft", deviceId: null });
    await page.screenshot({ path: testInfo.outputPath("settings-audio-desktop-light.png") });

    await page.goto(`${fixture.runtime.url}/manage/settings#overlay-surfaces`);
    await page.reload();
    const surface = page.getByRole("form", { name: "Unified browser: default" });
    const visibility = surface.getByRole("checkbox", { name: "Show Alerts on Unified browser: default" });
    const originalVisibility = await visibility.isChecked();
    await visibility.setChecked(!originalVisibility);
    await surface.getByRole("button", { name: "Save Unified browser: default" }).click();
    await expect(surface.getByRole("button", { name: "Save Unified browser: default" })).toHaveCount(0);
    const surfaces = await (await fixture.request("/overlay-surfaces")).json() as { surfaces: { kind: string; layers: { moduleId: string; visible: boolean }[] }[] };
    expect(surfaces.surfaces.find(item => item.kind === "unified-browser")?.layers.find(layer => layer.moduleId === "alerts")?.visible).toBe(!originalVisibility);
    await page.screenshot({ path: testInfo.outputPath("settings-surfaces-desktop-light.png") });

    await page.goto(`${fixture.runtime.url}/manage/settings#backup-restore`);
    await page.reload();
    await expect(page.getByRole("button", { name: "Export backup" })).toBeEnabled();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export backup" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.streamjams-backup$/);
    await page.getByLabel("Backup file").setInputFiles({ name: "invalid.streamjams-backup", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(page.getByText("Backup file is invalid", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore configuration" })).toHaveCount(0);
    await page.getByRole("button", { name: "Dismiss error" }).click();
    await page.screenshot({ path: testInfo.outputPath("settings-backup-desktop-light.png") });

    expect((await fixture.request("/management/diagnostics/client-errors", "POST", {
      referenceId: "ref-disposable-presentation", source: "react", message: "Disposable presentation evidence",
      exception: { type: "Error", message: "Disposable rendering failure", stack: "Error: Disposable rendering failure", code: null, cause: null, thrownValue: null }
    })).status).toBe(200);
    await page.goto(`${fixture.runtime.url}/manage/diagnostics`);
    await expect(page.getByRole("heading", { name: "Open problems" })).toBeVisible();
    await page.getByRole("tab", { name: /Raw logs/ }).click();
    await page.getByRole("searchbox", { name: "Search" }).fill("ref-disposable-presentation");
    await page.getByRole("combobox", { name: "Level" }).selectOption("ERROR");
    await page.getByRole("combobox", { name: "Sort diagnostics" }).selectOption("oldest");
    await expect(page.locator(".diagnostics-log-row").first()).toBeVisible();
    await page.locator(".diagnostics-log-row").first().click();
    const detail = await page.getByRole("region", { name: "Raw log detail" }).textContent();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("region", { name: "Raw log detail" })).toHaveText(detail!);
    await expect(page.getByRole("tab", { name: /Raw logs/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("ref-disposable-presentation");
    await expect(page.getByRole("combobox", { name: "Level" })).toHaveValue("ERROR");
    await expect(page.getByRole("combobox", { name: "Sort diagnostics" })).toHaveValue("oldest");
    await page.screenshot({ path: testInfo.outputPath("diagnostics-desktop-light.png") });
    const support = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export support bundle", exact: true }).click();
    expect((await support).suggestedFilename()).toMatch(/diagnostics-.*\.json$/);
    await page.getByRole("button", { name: "Dismiss success" }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.reload();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.getByRole("tab", { name: /Raw logs/ }).click();
    await expect(page.locator(".diagnostics-log-row").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("diagnostics-390-dark-rtl.png") });
    await page.getByRole("region", { name: "Raw log detail" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("region", { name: "Raw log detail" }).locator("pre")).toHaveCSS("direction", "ltr");
    await page.screenshot({ path: testInfo.outputPath("diagnostics-detail-390-dark-rtl.png") });
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});


test("disposable automation client retains selected approval scopes", async ({ page, request }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const scopes = ["timers:read", "timers:control", "playback:read", "playback:mute:alerts"];
    const pairingResponse = await request.post(`${fixture.runtime.url}/automation/v1/pairings`, { data: {
      clientName: "Disposable presentation client", scopes,
      codeChallenge: createHash("sha256").update("disposable-stage6b-verifier-for-presentation-check").digest("base64url")
    } });
    expect(pairingResponse.status()).toBe(201);
    const pairingIdentity = await pairingResponse.json() as { id: string };
    await page.goto(`${fixture.runtime.url}/manage/settings#automation`);
    const pairing = page.getByRole("article", { name: "Pairing Disposable presentation client" });
    await pairing.getByRole("checkbox", { name: "timers:read", exact: true }).uncheck();
    await expect(pairing.getByRole("checkbox", { name: "timers:control", exact: true })).not.toBeChecked();
    await pairing.getByRole("checkbox", { name: "playback:mute:alerts", exact: true }).uncheck();
    await pairing.getByRole("button", { name: "Approve Disposable presentation client" }).click();
    await expect(pairing.getByText("Approved. Waiting for the client to finish pairing.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings-automation-desktop-light.png") });
    expect((await request.post(`${fixture.runtime.url}/automation/v1/pairings/${pairingIdentity.id}/exchange`, { data: { verifier: "disposable-stage6b-verifier-for-presentation-check" } })).status()).toBe(200);
    const grants = await (await fixture.request("/api/automation/grants")).json() as { scopes: string[] }[];
    expect(grants[0]?.scopes).toEqual(["playback:read"]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.reload();
    await expect(page.getByText("Access granted", { exact: true })).toBeVisible();
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    await page.getByRole("heading", { name: "Automation permissions" }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("settings-paired-client-390-dark-rtl.png") });
    await page.getByRole("article", { name: "Permissions for Disposable presentation client" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("settings-grant-390-dark-rtl.png") });
  } finally { await fixture.close(); }
});


test("compact Settings owners remain readable in dark RTL after their disposable data loads", async ({ page }, testInfo) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    expect((await fixture.request("/management/alert-sets")).status).toBe(200);
    expect((await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: null, purpose: "live", scope: "unified" })).status).toBe(200);
    expect((await fixture.request("/audio/routes", "POST", { name: "Disposable retained output with a long name for compact layout", deviceId: null, autoFollowDeviceName: false })).status).toBe(201);
    await page.goto(`${fixture.runtime.url}/manage/settings`);
    await page.evaluate(() => localStorage.setItem("stream-jams-theme", "dark"));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [hash, sentinel, filename] of [
      ["audio-outputs", "Audio outputs", "audio"], ["overlay-surfaces", "Overlay surfaces", "surfaces"],
      ["automation", "Automation permissions", "automation"], ["backup-restore", "Backup and restore", "backup"]
    ] as const) {
      // Audio outputs and Overlay surfaces are named regions inside their Settings disclosures.
      const sentinelRole = sentinel === "Audio outputs" || sentinel === "Overlay surfaces" ? "region" : "heading";
      await page.goto(`${fixture.runtime.url}/manage/settings#${hash}`);
      await page.reload();
      await expect(page.getByRole(sentinelRole, { name: sentinel, exact: true })).toBeVisible();
      await page.evaluate(() => { document.documentElement.dir = "rtl"; });
      if (hash === "audio-outputs") await expect(page.getByRole("textbox", { name: "New output name" })).toBeVisible();
      if (hash === "overlay-surfaces") await expect(page.getByRole("checkbox", { name: "Show Alerts on Unified browser: default" })).toBeVisible();
      if (hash === "automation") await expect(page.getByText("No paired clients.")).toBeVisible();
      if (hash === "backup-restore") await expect(page.getByRole("button", { name: "Export backup" })).toBeEnabled();
      await page.getByRole(sentinelRole, { name: sentinel, exact: true }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`settings-${filename}-390-dark-rtl.png`) });
      if (hash === "audio-outputs") await page.getByRole("textbox", { name: "New output name" }).scrollIntoViewIfNeeded();
      if (hash === "overlay-surfaces") await page.getByRole("form", { name: "Unified browser: default" }).scrollIntoViewIfNeeded();
      if (hash === "backup-restore") await page.getByLabel("Backup file").scrollIntoViewIfNeeded();
      if (hash !== "automation") await page.screenshot({ path: testInfo.outputPath(`settings-${filename}-fields-390-dark-rtl.png`) });
    }
  } finally { await fixture.close(); }
});
