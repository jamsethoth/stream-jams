import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { alertEditorDocumentSchema, compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle, DefaultAssetValidator, type AssetLibraryItem, type AssetRecord } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

// Reuse Storybook's bundled font so this browser fixture is portable across CI platforms.
const fontPath = new URL("../../apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2", import.meta.url);

test("uploaded fonts are reusable and saved outline/warp survive editor reload", async ({ page }) => {
  await mockManagementShell(page);
  const fontBytes = readFileSync(fontPath);
  const checksum = createHash("sha256").update(fontBytes).digest("hex");
  let font: AssetRecord | null = null;
  let uploads = 0;
  let saved = alertEditorDocumentSchema.parse({ schemaVersion: 1, id: "alert-font", setId: "set-font", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null, name: "Typography fixture", enabled: true, conditions: [], durationMs: 5000,
    layers: [{ id: "message", name: "Message", type: "text", visible: true, order: 0, template: "Hello {actor.displayName}", textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 300, delayMs: 0, easing: "ease-out" } }],
    targetProfiles: [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "message", x: 100, y: 300, width: 1000, height: 280, zIndex: 0 }] }, { id: "vertical", enabled: false, reviewState: "ready", layerLayouts: [] }], samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { actor: { displayName: "James" } } }] });
  const overview = { id: "set-font", name: "Font fixture", active: false, starter: false, starterReviewState: "complete", enabledAlertCount: 1, profileUsage: [{ id: "landscape", enabledAlertCount: 1, playableAlertCount: 1, blockerCount: 0, warningCount: 0 }], validationIssues: [], outputs: [] };
  await page.route("**/management/alert-sets", route => route.fulfill({ json: [overview] }));
  await page.route("**/management/alert-sets/set-font", route => route.fulfill({ json: { overview, inventory: [{ id: saved.id, setId: saved.setId, providerKind: "twitch", eventType: "follow", name: saved.name, kind: "default", enabled: true, reviewState: "ready", targetProfileIds: ["landscape"], previewText: "Hello James" }], browserSources: [] } }));
  await page.route("**/management/alerts/alert-font/editor", async route => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PUT") saved = alertEditorDocumentSchema.parse(route.request().postDataJSON().document);
    await route.fulfill({ json: saved });
  });
  await page.route("**/management/alerts/alert-font/editor/variation-context", route => route.fulfill({ json: { ruleId: saved.id, eventType: saved.eventType, candidates: [{ editorId: saved.id, variantId: "default", kind: "default", name: "Default", enabled: true, conditions: [], weight: 1, priority: null }] } }));
  await page.route("**/management/assets/library", route => {
    const items: AssetLibraryItem[] = font === null ? [] : [{ id: font.id, originalFileName: font.originalFileName, displayName: "Reusable test font", mediaType: "font", mimeType: font.mimeType, sizeBytes: font.sizeBytes, width: null, height: null, durationMs: null, health: "available", tags: [], createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", usage: { assetId: font.id, totalUsageCount: 0, usages: [] } }];
    return route.fulfill({ json: items });
  });
  await page.route("**/assets/import", async route => {
    const bytes = route.request().postDataBuffer()!;
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    expect(new DefaultAssetValidator().validate({ originalFileName: "fixture.woff2", mimeType: route.request().headers()["x-stream-jams-mime-type"]!, bytes, sizeBytes: bytes.length }).accepted).toBe(true);
    uploads++;
    font = { id: "font-fixture", originalFileName: "fixture.woff2", mediaType: "font", mimeType: "font/woff2", sizeBytes: bytes.length, checksum, storagePath: "font/font-fixture.woff2", durationMs: null };
    await route.fulfill({ json: font });
  });
  await page.route("**/assets/font-fixture/file", route => route.fulfill({ contentType: "font/woff2", body: fontBytes }));
  await page.goto("/manage/modules/alerts/editor/alert-font?profile=landscape");
  await page.getByRole("button", { name: "Message Text", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Typography" }).click();
  await page.getByLabel("Upload reusable font", { exact: true }).setInputFiles({ name: "fixture.woff2", mimeType: "application/octet-stream", buffer: fontBytes });
  await expect(page.getByLabel("Uploaded font", { exact: true })).toHaveValue("font-fixture");
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => face.family.startsWith("stream-jams-font-") && face.status === "loaded"))).toBe(true);
  await page.getByLabel("Italic", { exact: true }).check();
  await page.getByLabel("Underline", { exact: true }).check();
  await page.getByLabel("Letter spacing", { exact: true }).fill("3");
  await page.getByLabel("Text outline", { exact: true }).check();
  await page.getByLabel("Outline color color", { exact: true }).fill("#8040c0");
  await page.getByLabel("Outline color opacity", { exact: true }).fill("80");
  await page.getByLabel("Outline thickness", { exact: true }).fill("4");
  await page.getByLabel("Warp text", { exact: true }).check();
  const handle = page.getByRole("button", { name: "Warp handle 2, 2", exact: true });
  await expect(handle).toBeVisible();
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down(); await page.mouse.move(handleBox.x + 24, handleBox.y - 12, { steps: 5 }); await page.mouse.up();
  await expect(page.getByLabel("Warp handle X", { exact: true })).not.toHaveValue("50");
  const movedX = await page.getByLabel("Warp handle X", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Warp handle X", { exact: true })).toHaveValue("50");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Warp handle X", { exact: true })).toHaveValue(movedX);
  await page.getByRole("button", { name: "Add vertical split", exact: true }).click();
  const surface = page.locator(".text-warp-editor");
  const box = (await surface.boundingBox())!;
  await page.mouse.click(box.x + box.width * .25, box.y + box.height * .5);
  await expect(page.getByRole("group", { name: "Warp controls" })).toContainText(/4 columns . 3 rows/u);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const rendered = page.getByRole("region", { name: "Landscape alert canvas" }).getByRole("img", { name: "Hello James" });
  await expect(rendered).toBeVisible();
  expect(await rendered.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Alert saved.", { exact: true })).toBeVisible();
  const text = saved.layers.find(layer => layer.type === "text")!;
  expect(text.textStyle).toMatchObject({ fontAssetId: "font-fixture", italic: true, underline: true, letterSpacingPx: 3, outline: { color: "#8040C0CC", widthPx: 4 }, warp: { columns: [0, expect.any(Number), .5, 1], rows: [0, .5, 1] } });
  await page.reload();
  await page.getByRole("button", { name: "Message Text", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Typography" }).click();
  await expect(page.getByLabel("Uploaded font", { exact: true })).toHaveValue("font-fixture");
  await expect(page.getByLabel("Italic", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Letter spacing", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Outline thickness", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Outline color color", { exact: true })).toHaveValue("#8040c0");
  await expect(page.getByLabel("Outline color opacity", { exact: true })).toHaveValue("80");
  await page.getByRole("button", { name: "Edit warp", exact: true }).click();
  await expect(page.getByRole("group", { name: "Warp controls" })).toContainText(/4 columns . 3 rows/u);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Uploaded font", { exact: true }).selectOption("");
  await page.getByLabel("Uploaded font", { exact: true }).selectOption("font-fixture");
  expect(uploads).toBe(1);
});
