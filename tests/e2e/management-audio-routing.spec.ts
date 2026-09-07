import { alertEditorDocumentSchema, type AudioOutputStatus } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("audio outputs save explicitly and alert drafts retain routing through undo, tests, and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockManagementShell(page);
  const status: AudioOutputStatus = {
    capability: { available: true, devices: [{ deviceId: "fake-private", label: "Private endpoint" }, { deviceId: "fake-stream", label: "Stream endpoint" }], reason: null, nextStep: null },
    muted: false, routes: []
  };
  let saved = alertEditorDocumentSchema.parse({
    id: "routing-alert", setId: "routing-set", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null,
    name: "Routing example", enabled: true, conditions: [], durationMs: 2_000,
    outputs: { browserSource: false, deviceRouteIds: [] },
    layers: [{ id: "sound", name: "Alert sound", type: "audio", visible: true, order: 0, assetId: "silent-fixture", volume: 0.8,
      animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } }],
    targetProfiles: ["landscape", "vertical"].map((id) => ({ id, enabled: false, reviewState: "needs-review", layerLayouts: [] })),
    samplePayloads: [{ id: "sample", label: "Normal example", kind: "built-in", payload: { userName: "Viewer" } }]
  });
  const commands: { method: string; body: unknown }[] = [];
  const tests: unknown[] = [];
  await page.route("**/audio/status", (route) => route.fulfill({ json: status }));
  await page.route("**/audio/routes", async (route) => {
    const body = route.request().postDataJSON() as { name: string; deviceId: string | null };
    commands.push({ method: route.request().method(), body });
    const output = { id: "private", ...body, deviceLabel: body.deviceId === null ? null : "Private endpoint" };
    status.routes.push({ route: output, state: "ready" });
    await route.fulfill({ status: 201, json: output });
  });
  await page.route("**/config/server", (route) => route.fulfill({ json: { host: "127.0.0.1", port: 39187 } }));
  await page.route("**/management/settings/backup-summary", (route) => route.fulfill({ json: {
    state: "ready", appVersion: "0.0.0", schemaVersion: 19, configurationRecordCount: 1, assetCount: 0, totalAssetBytes: 0,
    dataDirectory: "C:/StreamJamsFixture/data", assetDirectory: "C:/StreamJamsFixture/assets", logLevel: "INFO", logRetentionHours: 48,
    secretExclusions: ["Local audio device bindings"], blockers: []
  } }));
  await page.route("**/management/providers?*", (route) => route.fulfill({ json: [] }));
  const overview = { id: saved.setId, name: "Routing set", active: true, starter: false, starterReviewState: "complete", enabledAlertCount: 1,
    targetProfiles: saved.targetProfiles.map(({ id, enabled, reviewState }) => ({ id, enabled, reviewState, blockerCount: 0, warningCount: 0 })), validationIssues: [], outputs: [] };
  await page.route("**/management/alert-sets/routing-set", (route) => route.fulfill({ json: { overview, inventory: [], browserSources: [] } }));
  await page.route("**/management/alerts/routing-alert/editor/variation-context", (route) => route.fulfill({ json: {
    ruleId: saved.id, eventType: saved.eventType, candidates: [{ editorId: saved.id, variantId: "default-resolver", kind: "default", name: saved.name, enabled: true, conditions: [], weight: 1, priority: null }]
  } }));
  await page.route("**/management/alerts/routing-alert/editor", async (route) => {
    if (route.request().method() !== "GET") {
      const body = route.request().postDataJSON() as { document: unknown; confirmLiveImpact: boolean };
      expect(body.confirmLiveImpact).toBe(true);
      saved = alertEditorDocumentSchema.parse(body.document);
    }
    await route.fulfill({ json: saved });
  });
  await page.route("**/management/alerts/routing-alert/editor/test", async (route) => {
    tests.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "queued", targetProfileId: null, referenceId: "ref-routing", test: true,
      deliveredDestinations: [{ kind: "device-route", id: "private", name: "Private mix" }], unavailableDestinations: [] } });
  });

  await page.goto("/manage/settings#audio-outputs");
  await expect(page.getByRole("heading", { name: "Audio outputs", exact: true })).toBeVisible();
  await page.getByLabel("New output name").fill("Private mix");
  await page.getByLabel("New output device").selectOption("fake-private");
  expect(commands).toEqual([]);
  await page.getByRole("button", { name: "Create output" }).click();
  await expect(page.getByRole("group", { name: "Private mix audio output" })).toBeVisible();
  expect(commands).toEqual([{ method: "POST", body: { name: "Private mix", deviceId: "fake-private" } }]);
  if (process.env.STREAM_JAMS_QA_SCREENSHOT_DIRECTORY) {
    await page.getByRole("button", { name: "Dismiss success", exact: true }).click();
    await page.screenshot({ path: `${process.env.STREAM_JAMS_QA_SCREENSHOT_DIRECTORY}/audio-settings-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("group", { name: "Private mix audio output" }).getByLabel("Output device")).toBeVisible();
    await page.screenshot({ path: `${process.env.STREAM_JAMS_QA_SCREENSHOT_DIRECTORY}/audio-settings-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.goto("/manage/modules/alerts/editor/routing-alert?profile=landscape");
  await page.getByRole("tab", { name: "Alert", exact: true }).click();
  const output = page.getByRole("checkbox", { name: /Private mix/ });
  await output.check();
  await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(output).not.toBeChecked();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(output).toBeChecked();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  expect(tests).toEqual([]);
  await page.getByRole("button", { name: "Send test", exact: true }).click();
  await expect(page.locator(".management-toast--success")).toContainText("Test queued on Private mix. Reference ref-routing.");
  expect(tests).toEqual([expect.objectContaining({ targetProfileId: null, includeAudio: true, document: expect.objectContaining({ outputs: { browserSource: false, deviceRouteIds: ["private"] } }) })]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Save changes to active alert?" });
  await expect(confirmation).toContainText("Private mix");
  await confirmation.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Alert", exact: true }).click();
  await expect(output).toBeChecked();
  await expect(page).toHaveURL(/\/manage\/modules\/alerts\/editor\/routing-alert/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  if (process.env.STREAM_JAMS_QA_SCREENSHOT_DIRECTORY) {
    await output.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.STREAM_JAMS_QA_SCREENSHOT_DIRECTORY}/alert-audio-outputs.png`, fullPage: true });
  }
});
