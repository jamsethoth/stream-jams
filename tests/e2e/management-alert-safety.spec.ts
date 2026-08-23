import { expect, test, type Page } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

interface ModerationTargetSettings {
  readonly maxLength: number;
  readonly blockedTerms: readonly string[];
  readonly stripUrls: boolean;
}

interface ModerationSettings {
  readonly renderedText: ModerationTargetSettings;
  readonly ttsText: ModerationTargetSettings;
}

const defaultPolicy: ModerationSettings = {
  renderedText: { maxLength: 240, blockedTerms: [], stripUrls: false },
  ttsText: { maxLength: 180, blockedTerms: [], stripUrls: true }
};

test("Alert safety previews, saves, reloads, validates, and guards dirty navigation", async ({ page }) => {
  const moderation = await mockModerationApi(page, defaultPolicy);

  await page.goto("/manage");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByText("Modules", { exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Alerts", exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Safety", exact: true }).click();

  await expect(page).toHaveURL(/\/manage\/modules\/alerts\/safety$/u);
  await expect(page.getByLabel("Rendered text maximum length")).toHaveValue("240");
  await expect(page.getByLabel("TTS text maximum length")).toHaveValue("180");

  await page.getByLabel("Rendered text maximum length").fill("18");
  await page.getByLabel("Rendered text blocked terms").fill("Spoiler\nspoiler\nSPOILER");
  await page.getByRole("checkbox", { name: "Rendered text strip web links" }).check();
  await page.getByLabel("TTS text maximum length").fill("24");
  await page.getByLabel("TTS text blocked terms").fill("Noise");
  await page.getByRole("checkbox", { name: "TTS text strip web links" }).uncheck();

  await page.getByLabel("Moderation example").fill(
    "SPOILER spoiler NOISE https://viewer.example/path followed by over-limit words"
  );
  await page.getByRole("button", { name: "Preview example" }).click();

  const renderedPreview = page.getByRole("region", { name: "Rendered text preview" });
  await expect(renderedPreview.getByText("spoiler", { exact: true })).toBeVisible();
  await expect(renderedPreview.getByText("Safe rendered text", { exact: true })).toBeVisible();
  const renderedActions = renderedPreview.getByRole("list", { name: "Rendered text moderation actions" });
  await expect(renderedActions.getByText("Web links stripped: 1", { exact: true })).toBeVisible();
  await expect(renderedActions.getByText("Blocked terms replaced: 2", { exact: true })).toBeVisible();
  await expect(renderedActions.getByText("Truncated to 18 characters", { exact: true })).toBeVisible();
  const ttsPreview = page.getByRole("region", { name: "TTS text preview" });
  await expect(ttsPreview.getByText("noise", { exact: true })).toBeVisible();
  await expect(ttsPreview.getByText("Safe spoken alert output", { exact: true })).toBeVisible();
  const ttsActions = ttsPreview.getByRole("list", { name: "TTS text moderation actions" });
  await expect(ttsActions.getByText("Blocked terms replaced: 1", { exact: true })).toBeVisible();
  await expect(ttsActions.getByText("Truncated to 24 characters", { exact: true })).toBeVisible();
  expect(moderation.previewRequests).toHaveLength(2);

  await page.getByRole("button", { name: "Save safety settings" }).click();
  await expect(page.getByRole("status")).toContainText("Safety settings saved");
  expect(moderation.updateRequests).toHaveLength(1);

  await page.reload();
  await expect(page.getByLabel("Rendered text maximum length")).toHaveValue("18");
  await expect(page.getByLabel("Rendered text blocked terms")).toHaveValue("spoiler");
  await expect(page.getByLabel("TTS text maximum length")).toHaveValue("24");
  await expect(page.getByLabel("TTS text blocked terms")).toHaveValue("noise");

  await page.getByLabel("Rendered text maximum length").fill("19");
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/manage\/modules\/alerts\/safety$/u);
  await expect(page.getByLabel("Rendered text maximum length")).toHaveValue("19");

  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  await guard.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/manage$/u);
  await navigation.getByRole("link", { name: "Safety", exact: true }).click();
  await expect(page.getByLabel("Rendered text maximum length")).toHaveValue("18");

  await page.getByLabel("TTS text maximum length").fill("25");
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  await guard.getByRole("button", { name: "Save and leave" }).click();
  await expect(page).toHaveURL(/\/manage$/u);
  await navigation.getByRole("link", { name: "Safety", exact: true }).click();
  await expect(page.getByLabel("TTS text maximum length")).toHaveValue("25");

  const updatesBeforeInvalid = moderation.updateRequests.length;
  await page.getByLabel("Rendered text maximum length").fill("0");
  await page.getByRole("button", { name: "Save safety settings" }).click();
  await expect(page.getByText("Enter a whole number from 1 to 10000.", { exact: true })).toBeVisible();
  expect(moderation.updateRequests).toHaveLength(updatesBeforeInvalid);

  await page.getByLabel("Rendered text maximum length").fill("20");
  await page.getByLabel("Rendered text blocked terms").fill("candidate-term");
  moderation.failNextUpdate = true;
  await page.getByRole("button", { name: "Save safety settings" }).click();
  const saveError = page.getByRole("alert");
  await expect(saveError).toContainText("Safety settings were not saved");
  await expect(saveError).toContainText("Try saving again");
  await expect(saveError).toContainText("err_moderation_e2e");
  await expect(page.getByLabel("Rendered text maximum length")).toHaveValue("20");
  await expect(page.getByLabel("Rendered text blocked terms")).toHaveValue("candidate-term");
});

test("schema-18 restore reloads the saved moderation policy through Settings", async ({ page }) => {
  const moderation = await mockModerationApi(page, defaultPolicy);
  const restoredPolicy: ModerationSettings = {
    renderedText: { maxLength: 31, blockedTerms: ["restored-rendered"], stripUrls: true },
    ttsText: { maxLength: 29, blockedTerms: ["restored-tts"], stripUrls: false }
  };
  const archive = schema18Backup(restoredPolicy);
  const restoreRequests: unknown[] = [];

  await page.route("**/config/server", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { host: "127.0.0.1", port: 39187 } });
  });
  await page.route("**/management/settings/backup-summary", async (route) => {
    await route.fulfill({ contentType: "application/json", json: backupSummary() });
  });
  await page.route("**/management/settings/backup/preflight", async (route) => {
    const requestArchive = route.request().postDataJSON() as { readonly manifest?: { readonly schemaVersion?: number } };
    expect(requestArchive.manifest?.schemaVersion).toBe(18);
    await route.fulfill({ contentType: "application/json", json: backupPreflight() });
  });
  await page.route("**/management/settings/backup/restore", async (route) => {
    restoreRequests.push(route.request().postDataJSON());
    moderation.policy = restoredPolicy;
    await route.fulfill({
      contentType: "application/json",
      json: {
        state: "completed",
        safetyBackupPath: "C:/StreamJams/backups/pre-restore.streamjams-backup",
        restored: backupPreflight().impact,
        regeneratedOutputs: [],
        reconnectProviders: [],
        warnings: []
      }
    });
  });

  await page.goto("/manage/settings");
  await page.getByLabel("Backup file").setInputFiles({
    name: "schema-18.streamjams-backup",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive), "utf8")
  });
  await expect(page.getByRole("region", { name: "Restore impact" })).toBeVisible();
  await page.getByLabel("Type RESTORE to confirm").fill("RESTORE");
  await page.getByRole("button", { name: "Restore configuration" }).click();
  await expect(page.getByRole("heading", { name: "Restore complete" })).toBeVisible();
  expect(restoreRequests).toHaveLength(1);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Safety", exact: true }).click();
  await expect(page.getByLabel("Rendered text maximum length")).toHaveValue("31");
  await expect(page.getByLabel("Rendered text blocked terms")).toHaveValue("restored-rendered");
  await expect(page.getByRole("checkbox", { name: "Rendered text strip web links" })).toBeChecked();
  await expect(page.getByLabel("TTS text maximum length")).toHaveValue("29");
  await expect(page.getByLabel("TTS text blocked terms")).toHaveValue("restored-tts");
  await expect(page.getByRole("checkbox", { name: "TTS text strip web links" })).not.toBeChecked();
});

async function mockModerationApi(page: Page, initialPolicy: ModerationSettings) {
  await mockManagementShell(page);
  await page.unroute("**/moderation/settings");
  const state = {
    policy: initialPolicy,
    previewRequests: [] as unknown[],
    updateRequests: [] as unknown[],
    failNextUpdate: false
  };

  await page.route("**/moderation/settings", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PATCH") {
      expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
      const input = route.request().postDataJSON() as ModerationSettings;
      state.updateRequests.push(input);
      if (state.failNextUpdate) {
        state.failNextUpdate = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          json: {
            error: {
              code: "MODERATION_WRITE_FAILED",
              id: "err_moderation_e2e",
              message: "The moderation policy could not be stored."
            }
          }
        });
        return;
      }
      state.policy = normalizePolicy(input);
      await route.fulfill({ contentType: "application/json", json: state.policy });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: state.policy });
  });
  await page.route("**/moderation/preview", async (route) => {
    const input = route.request().postDataJSON() as {
      readonly target: "rendered" | "tts";
      readonly text: string;
      readonly settings: ModerationTargetSettings;
    };
    state.previewRequests.push(input);
    const settings = normalizeTarget(input.settings);
    await route.fulfill({
      contentType: "application/json",
      json: input.target === "rendered"
        ? {
            target: "rendered",
            settings,
            text: "Safe rendered text",
            actions: [
              { type: "url-stripped", count: 1 },
              { type: "blocked-term-replaced", count: 2 },
              { type: "max-length-truncated", maxLength: settings.maxLength }
            ]
          }
        : {
            target: "tts",
            settings,
            text: "Safe spoken alert output",
            actions: [
              { type: "blocked-term-replaced", count: 1 },
              { type: "max-length-truncated", maxLength: settings.maxLength }
            ]
          }
    });
  });
  return state;
}

function normalizePolicy(input: ModerationSettings): ModerationSettings {
  return {
    renderedText: normalizeTarget(input.renderedText),
    ttsText: normalizeTarget(input.ttsText)
  };
}

function normalizeTarget(input: ModerationTargetSettings): ModerationTargetSettings {
  return {
    maxLength: input.maxLength,
    blockedTerms: [...new Set(input.blockedTerms.map((term) => term.trim().toLocaleLowerCase()).filter(Boolean))],
    stripUrls: input.stripUrls
  };
}

function backupSummary() {
  return {
    state: "ready",
    appVersion: "0.0.0",
    schemaVersion: 18,
    configurationRecordCount: 13,
    assetCount: 0,
    totalAssetBytes: 0,
    dataDirectory: "C:/StreamJams/data",
    assetDirectory: "C:/StreamJams/assets",
    logLevel: "INFO",
    logRetentionHours: 48,
    secretExclusions: ["Provider credentials", "Overlay route keys"],
    blockers: []
  };
}

function backupPreflight() {
  return {
    state: "valid",
    archiveId: `sha256:${"b".repeat(64)}`,
    appVersion: "0.0.0",
    schemaVersion: 18,
    createdAt: "2026-08-23T12:00:00.000Z",
    impact: { configurationRecords: 13, providers: 0, alertSets: 1, assets: 0, preferences: 1, browserOutputs: 0 },
    runtime: { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
    blockers: [],
    warnings: []
  };
}

function schema18Backup(policy: ModerationSettings) {
  return {
    manifest: {
      format: "stream-jams-backup",
      archiveVersion: 2,
      appVersion: "0.0.0",
      schemaVersion: 18,
      createdAt: "2026-08-23T12:00:00.000Z",
      configurationChecksum: `sha256:${"a".repeat(64)}`,
      configurationRecordCount: 1,
      assetCount: 0,
      totalAssetBytes: 0
    },
    configuration: {
      appConfig: {},
      tables: {
        alert_moderation_settings: [{
          id: 1,
          rendered_max_length: policy.renderedText.maxLength,
          rendered_blocked_terms_json: JSON.stringify(policy.renderedText.blockedTerms),
          rendered_strip_urls: policy.renderedText.stripUrls ? 1 : 0,
          tts_max_length: policy.ttsText.maxLength,
          tts_blocked_terms_json: JSON.stringify(policy.ttsText.blockedTerms),
          tts_strip_urls: policy.ttsText.stripUrls ? 1 : 0
        }]
      },
      providerReconnectMetadata: [],
      overlayOutputs: []
    },
    assets: []
  };
}
