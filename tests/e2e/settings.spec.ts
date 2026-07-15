import { expect, test, type Page } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("settings persists server port changes and rejects invalid ports", async ({ page }) => {
  await mockManagementShell(page);
  await mockSettingsSummary(page);

  let serverConfig = { host: "127.0.0.1", port: 39187 };
  const updates: unknown[] = [];
  await page.route("**/config/server", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { readonly host: string; readonly port: number };
      updates.push(body);
      serverConfig = body;
      await route.fulfill({ contentType: "application/json", json: serverConfig });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: serverConfig });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Settings" }).click();

  const portInput = page.getByLabel("Port");
  await expect(page.getByLabel("Host")).toHaveValue("127.0.0.1");
  await portInput.fill("40123");
  await page.getByRole("button", { name: "Save server settings" }).click();

  await expect(page.getByRole("status")).toContainText("Server settings saved");
  await expect(portInput).toHaveValue("40123");
  expect(updates).toEqual([{ host: "127.0.0.1", port: 40123 }]);

  await portInput.fill("70000");
  await page.getByRole("button", { name: "Save server settings" }).click();
  expect(await portInput.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
  expect(updates).toEqual([{ host: "127.0.0.1", port: 40123 }]);
});

test("settings warns before discarding dirty changes during local navigation", async ({ page }) => {
  await mockManagementShell(page);
  await mockSettingsSummary(page);
  await page.route("**/config/server", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { host: "127.0.0.1", port: 39187 } });
  });
  await page.route("**/assets", async (route) => route.fulfill({ contentType: "application/json", json: [] }));
  await page.route("**/management/assets/library", async (route) => route.fulfill({ contentType: "application/json", json: [] }));

  await page.goto("/manage");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Port").fill("40123");
  await page.getByRole("link", { name: "Assets" }).click();

  await expect(page.getByRole("dialog", { name: "Leave with unsaved changes?" })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/u);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("link", { name: "Assets" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/assets$/u);
  await expect(page.getByText("No assets imported yet.")).toBeVisible();
});

test("settings exports and restores only after validated typed confirmation", async ({ page }) => {
  await mockManagementShell(page);
  await mockSettingsSummary(page);
  await page.route("**/config/server", async (route) => route.fulfill({ contentType: "application/json", json: { host: "127.0.0.1", port: 39187 } }));
  const archive = backupArchive();
  const preflight = backupPreflight();
  const restoreRequests: unknown[] = [];
  await page.route("**/management/settings/backup", async (route) => route.fulfill({ contentType: "application/json", json: archive }));
  await page.route("**/management/settings/backup/preflight", async (route) => route.fulfill({ contentType: "application/json", json: preflight }));
  await page.route("**/management/settings/backup/restore", async (route) => {
    restoreRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      json: {
        state: "completed",
        safetyBackupPath: "C:/Users/James/.stream-jams/backups/pre-restore.streamjams-backup",
        restored: preflight.impact,
        regeneratedOutputs: [{ label: "Landscape live", url: "http://127.0.0.1:39187/overlay/new-key" }],
        reconnectProviders: ["Twitch"],
        warnings: []
      }
    });
  });

  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.streamjams-backup$/u);
  await expect(page.getByRole("status")).toContainText("Backup exported");

  await page.getByLabel("Backup file").setInputFiles({
    name: "stream-jams.streamjams-backup",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive), "utf8")
  });
  await expect(page.getByText("1 alert set")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore configuration" })).toBeDisabled();
  expect(restoreRequests).toEqual([]);

  await page.getByLabel("Type RESTORE to confirm").fill("RESTORE");
  await page.getByRole("button", { name: "Restore configuration" }).click();
  expect(restoreRequests).toHaveLength(1);
  expect(restoreRequests[0]).toMatchObject({ archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true });
  await expect(page.getByText("Update browser-source URLs")).toBeVisible();
  await expect(page.getByText("Reconnect Twitch")).toBeVisible();
});

async function mockSettingsSummary(page: Page): Promise<void> {
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
        secretExclusions: ["Provider credentials and tokens", "Overlay route keys and hashes"],
        blockers: []
      }
    });
  });
}

function backupArchive() {
  return {
    manifest: { format: "stream-jams-backup", archiveVersion: 1, appVersion: "0.0.0", schemaVersion: 9, createdAt: "2026-07-15T05:00:00.000Z", configurationChecksum: `sha256:${"a".repeat(64)}`, configurationRecordCount: 0, assetCount: 0, totalAssetBytes: 0 },
    configuration: { appConfig: {}, tables: {}, providerReconnectMetadata: [], overlayOutputs: [] },
    assets: []
  };
}

function backupPreflight() {
  return {
    state: "valid",
    archiveId: `sha256:${"b".repeat(64)}`,
    appVersion: "0.0.0",
    schemaVersion: 9,
    createdAt: "2026-07-15T05:00:00.000Z",
    impact: { configurationRecords: 12, providers: 1, alertSets: 1, assets: 3, preferences: 1, browserOutputs: 1 },
    runtime: { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
    blockers: [],
    warnings: [{ summary: "Browser-source URLs will change", cause: "Route keys are excluded.", nextStep: "Update OBS after restore.", severity: "warning", occurredAt: null, referenceId: null, correction: null }]
  };
}
