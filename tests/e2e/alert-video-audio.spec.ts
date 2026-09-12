import { alertEditorDocumentSchema, parseStoredAlertEditorDocument } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("legacy video stays silent until explicitly saved and soundtrack choices survive reload", async ({ page }) => {
  await mockManagementShell(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const animation = { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" };
  let saved = parseStoredAlertEditorDocument({
    id: "video-audio", setId: "video-set", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null,
    name: "Video audio example", enabled: true, conditions: [], durationMs: 5000, outputs: { browserSource: false, deviceRouteIds: [] },
    layers: [
      { id: "video", name: "Clip", type: "video", assetId: "clip", visible: true, order: 0, animation },
      { id: "sound", name: "Separate sound", type: "audio", assetId: "sound", visible: true, order: 1, animation, volume: 0.5 }
    ],
    targetProfiles: ["landscape", "vertical"].map(id => ({ id, enabled: false, reviewState: "needs-review", layerLayouts: [] })),
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  });
  const saves: unknown[] = [];
  await page.route("**/management/providers?*", route => route.fulfill({ json: [] }));
  await page.route("**/audio/status", route => route.fulfill({ json: {
    capability: { available: true, devices: [{ deviceId: "fake-private", label: "Private headphones" }], reason: null, nextStep: null }, muted: false,
    routes: [{ route: { id: "private", name: "Private headphones", deviceId: "fake-private", deviceLabel: "Private headphones" }, state: "ready" }]
  } }));
  await page.route("**/management/alert-sets/video-set", route => route.fulfill({ json: {
    overview: { id: "video-set", name: "Video set", active: false, starter: false, starterReviewState: "complete", enabledAlertCount: 1,
      targetProfiles: saved.targetProfiles.map(({ id, enabled, reviewState }) => ({ id, enabled, reviewState, blockerCount: 0, warningCount: 0 })), validationIssues: [], outputs: [] },
    inventory: [], browserSources: []
  } }));
  await page.route("**/management/alerts/video-audio/editor/variation-context", route => route.fulfill({ json: {
    ruleId: saved.id, eventType: saved.eventType, candidates: [{ editorId: saved.id, variantId: "default", kind: "default", name: saved.name, enabled: true, conditions: [], weight: 1, priority: null }]
  } }));
  await page.route("**/management/alerts/video-audio/editor", async route => {
    if (route.request().method() !== "GET") {
      const body = route.request().postDataJSON() as { document: unknown };
      saves.push(body);
      saved = alertEditorDocumentSchema.parse(body.document);
    }
    await route.fulfill({ json: saved });
  });
  const url = "/manage/modules/alerts/editor/video-audio?profile=landscape";
  await page.goto(url);
  await page.getByRole("button", { name: "Clip Video/GIF", exact: true }).click();
  const soundtrack = page.getByRole("checkbox", { name: "Play embedded audio" });
  await expect(soundtrack).not.toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "Embedded audio volume" })).toBeDisabled();
  await soundtrack.check();
  await page.getByRole("spinbutton", { name: "Embedded audio volume" }).fill("0.4");
  await expect(page.getByText(/Both the video soundtrack and separate audio/)).toBeVisible();
  expect(saves).toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Embedded audio volume" })).toHaveValue("1");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Embedded audio volume" })).toHaveValue("0.4");
  await page.getByRole("button", { name: "Hide Separate sound", exact: true }).click();
  await expect(soundtrack).toBeChecked();
  await expect(page.getByText(/Both the video soundtrack and separate audio/)).toHaveCount(0);
  await page.getByRole("tab", { name: "Alert", exact: true }).click();
  await page.getByRole("checkbox", { name: /Private headphones/ }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saved.layers[0]).toMatchObject({ playEmbeddedAudio: true, audioVolume: 0.4 });
  expect(saved.layers[1]).toMatchObject({ visible: false });
  expect(saved.outputs).toEqual({ browserSource: false, deviceRouteIds: ["private"] });
  await page.reload();
  await page.getByRole("button", { name: "Clip Video/GIF", exact: true }).click();
  await expect(soundtrack).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "Embedded audio volume" })).toHaveValue("0.4");
  expect(errors).toEqual([]);
});
