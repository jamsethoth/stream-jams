import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("settings opens local data and clears retained logs with visible results", async ({ page }) => {
  await mockManagementShell(page);
  await page.route("**/config/server", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { host: "127.0.0.1", port: 39187 } });
  });
  await page.route("**/management/settings/backup-summary", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        state: "ready",
        appVersion: "0.0.0",
        schemaVersion: 9,
        configurationRecordCount: 12,
        assetCount: 3,
        totalAssetBytes: 2048,
        dataDirectory: "C:/Users/James/.stream-jams/data",
        assetDirectory: "C:/Users/James/.stream-jams/assets",
        logLevel: "INFO",
        logRetentionHours: 48,
        secretExclusions: ["Provider credentials", "Overlay route keys"],
        blockers: []
      }
    });
  });

  const requests: string[] = [];
  await page.route("**/management/settings/open-data-folder", async (route) => {
    requests.push(route.request().method());
    await route.fulfill({ contentType: "application/json", json: { dataDirectory: "C:/Users/James/.stream-jams/data" } });
  });
  await page.route("**/management/settings/clear-old-logs", async (route) => {
    requests.push(route.request().method());
    await route.fulfill({ contentType: "application/json", json: { deletedCount: 2 } });
  });

  await page.goto("/manage/settings");
  await page.getByRole("button", { name: "Open data folder" }).click();
  await expect(page.locator(".management-toast--success")).toContainText("Data folder opened");
  await page.getByRole("button", { name: "Clear old logs now" }).click();
  await expect(page.locator(".management-toast--success")).toContainText("2 old log files cleared");
  expect(requests).toEqual(["POST", "POST"]);
});
