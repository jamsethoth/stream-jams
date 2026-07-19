import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("asset library filters, edits, previews impact, and keeps invalid uploads in context", async ({ page }) => {
  await mockManagementShell(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const commands: Array<{ readonly command: string; readonly body?: unknown }> = [];
  let displayName = "Follower burst";

  const imageItem = () => ({
    id: "asset-image",
    displayName,
    originalFileName: "follow.png",
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: 1024,
    width: 320,
    height: 180,
    durationMs: null,
    health: "available",
    tags: ["follow", "seasonal"],
    createdAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z",
    usage: {
      assetId: "asset-image",
      totalUsageCount: 1,
      usages: [{ setId: "set-default", setName: "Default", eventType: "follow", alertId: "alert-follow", alertName: "New follower", targetProfileIds: ["landscape", "vertical"] }]
    }
  });
  const audioItem = {
    ...imageItem(),
    id: "asset-audio",
    displayName: "Short chime",
    originalFileName: "chime.wav",
    mediaType: "audio",
    mimeType: "audio/wav",
    sizeBytes: 2048,
    width: null,
    height: null,
    durationMs: 850,
    tags: ["audio", "short"],
    usage: { assetId: "asset-audio", totalUsageCount: 0, usages: [] }
  };

  await page.route("**/management/assets/library", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [imageItem(), audioItem] });
  });
  await page.route("**/assets/*/file", async (route) => {
    await route.fulfill({ contentType: "image/png", body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
  });
  await page.route("**/management/assets/asset-image", async (route) => {
    const method = route.request().method();
    expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    if (method === "PATCH") {
      const body = route.request().postDataJSON() as { readonly displayName: string };
      displayName = body.displayName;
      commands.push({ command: "metadata", body });
      await route.fulfill({ contentType: "application/json", json: { ...imageItem(), ...body } });
      return;
    }
    await route.fallback();
  });
  await page.route("**/management/assets/asset-image/change-impact?candidateMediaType=image", async (route) => {
    commands.push({ command: "impact" });
    await route.fulfill({ contentType: "application/json", json: { assetId: "asset-image", usage: imageItem().usage, canDelete: false, requiresConfirmation: true, warnings: ["1 alert usage will update everywhere."] } });
  });
  await page.route("**/assets/asset-image/replace", async (route) => {
    expect(route.request().headers()["x-stream-jams-confirm-impact"]).toBe("true");
    expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    commands.push({ command: "replace" });
    await route.fulfill({ contentType: "application/json", json: { id: "asset-image", originalFileName: "replacement.png", mediaType: "image", mimeType: "image/png", sizeBytes: 8, checksum: "sha256:replacement", storagePath: "image/asset-image-replacement.png" } });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Assets" }).click();
  await expect(page.getByRole("button", { name: "Follower burst", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Follower burst/u }).getByText("Available")).toBeVisible();
  await expect(page.getByRole("link", { name: "New follower" })).toHaveAttribute("href", "/manage/modules/alerts/editor/alert-follow?set=set-default&event=follow&profile=landscape");
  await expect(page.getByText("Filters", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByText("Filters", { exact: true }).click();
  await page.getByLabel("Usage").selectOption("unused");
  await page.getByLabel("Type").selectOption("audio");
  await expect(page.getByRole("button", { name: "Short chime", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Short chime details" })).toBeVisible();

  await page.getByLabel("Usage").selectOption("all");
  await page.getByLabel("Type").selectOption("all");
  await page.getByRole("button", { name: "Follower burst" }).click();
  await page.getByLabel("Display name").fill("Winter follower");
  await page.getByLabel("Tags").fill("winter, follow");
  await page.getByRole("button", { name: "Save asset details" }).click();
  await expect(page.getByText("Asset details saved.")).toBeVisible();

  await page.getByRole("button", { name: "Replace file" }).click();
  await page.getByLabel("Replacement file").setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
  await page.getByRole("button", { name: "Review replacement" }).click();
  const replacement = page.getByRole("dialog", { name: "Replace Winter follower?" });
  await expect(replacement.getByText("1 alert usage will update everywhere.")).toBeVisible();
  await replacement.getByRole("button", { name: "Replace everywhere" }).click();
  await expect(page.getByText("Asset replaced everywhere it is used.")).toBeVisible();

  await page.getByRole("button", { name: "Add asset" }).click();
  await page.getByRole("tab", { name: "Upload new" }).click();
  await page.getByLabel("Asset file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
  await page.getByRole("button", { name: "Upload and use" }).click();
  await expect(page.getByText("This file cannot be uploaded")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Choose asset" })).toBeVisible();

  expect(commands.map((entry) => entry.command)).toEqual(["metadata", "impact", "replace"]);
});
