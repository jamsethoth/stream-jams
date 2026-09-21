import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createScreenEffectDocument, type MergedOperationsSnapshot, type OperationRow } from "@stream-jams/core";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { SqliteAssetLibraryMetadataRepository } from "../../apps/server/dist/modules/assets/sqlite-asset-library-metadata-repository.js";
import { SqliteAssetRepository } from "../../apps/server/dist/modules/assets/sqlite-asset-repository.js";
import { SqliteEffectRepository } from "../../apps/server/dist/modules/screen-effects/sqlite-effect-repository.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test.describe.serial("full application visual UX acceptance", () => {
  let root: string;
  let runtime: StartedLocalRuntime;

  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "stream-jams-visual-ux-"));
    const port = await unusedPort();
    const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port } };
    const configStore = new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config });
    runtime = await startLocalRuntime({
      homeDirectory: root,
      webBuildDirectory: resolve("apps/web/dist"),
      configStore,
      environment: {},
      secretStore: new InMemorySecretStore()
    });

    const storagePath = "video/visual-ux-fixture.mp4";
    const bytes = Buffer.from([0, 0, 0, 0]);
    await mkdir(join(config.storage.assetDirectory, "video"), { recursive: true });
    await writeFile(join(config.storage.assetDirectory, ...storagePath.split("/")), bytes);
    await new SqliteAssetRepository(runtime.composition.database.connection).save({
      id: "asset-visual-ux-video",
      originalFileName: "visual-ux-fixture.mp4",
      mediaType: "video",
      mimeType: "video/mp4",
      sizeBytes: bytes.byteLength,
      checksum: "sha256:visual-ux-fixture",
      storagePath,
      durationMs: null
    });
    await new SqliteAssetLibraryMetadataRepository(runtime.composition.database.connection).save({
      assetId: "asset-visual-ux-video",
      displayName: "Visual UX fixture",
      tags: ["audit", "synthetic"],
      createdAt: "2026-09-15T12:00:00.000Z",
      updatedAt: "2026-09-15T12:00:00.000Z"
    });
    const draft = createScreenEffectDocument({
      id: "effect-visual-ux",
      name: "Visual UX fixture effect",
      defaultVariantId: "variant-visual-ux"
    });
    await new SqliteEffectRepository(runtime.composition.database.connection).save({
      ...draft,
      variants: [{
        ...draft.variants[0]!,
        visual: {
          assetId: "asset-visual-ux-video",
          mediaType: "video",
          layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 },
          playEmbeddedAudio: true,
          audioVolume: 0.5
        },
        visualOutputs: { browserSource: true, desktop: false }
      }]
    });
  });

  test.afterAll(async () => {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  });

  test("operator modal and playback priority hold in the served full application", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(`${runtime.url}/playback/operations`, (route) => route.fulfill({ json: operatorSnapshot() }));
    await page.goto(`${runtime.url}/operator`);

    const nowPlaying = page.getByRole("heading", { name: "Now playing (2)" });
    const firstSkip = page.getByRole("button", { name: "Skip Current follow in Alerts" });
    await expect(nowPlaying).toBeVisible();
    await expect(firstSkip).toBeVisible();
    expect((await firstSkip.boundingBox())!.y + (await firstSkip.boundingBox())!.height).toBeLessThanOrEqual(844);
    const clear = page.getByRole("button", { name: "Clear pending" }).nth(1);
    await clear.focus();
    await clear.press("Enter");
    await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(clear).toBeFocused();
    await captureEvidence(page, "operator-phone-light.png");
  });

  test("configured alert events are primary in the served full application", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${runtime.url}/manage/modules/alerts`);
    await expect(page.getByRole("button", { name: "Collapse Default" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Show unused event types" })).not.toBeChecked();
    await expect(page.getByRole("button", { name: /Cheer alerts/ })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Show unused event types" }).check();
    await expect(page.getByRole("button", { name: /Cheer alerts/ })).toBeVisible();
    await captureEvidence(page, "alerts-tablet-dark.png");
  });

  test("mobile navigation is compact in the served full application", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${runtime.url}/manage/settings`);
    const disclosure = page.getByRole("button", { name: "Navigation" });
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
    const sidebar = page.locator(".management-sidebar");
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(120);
    await captureEvidence(page, "navigation-phone-light.png");
  });

  test("Screen Effects checkboxes align inline in the served full application", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${runtime.url}/manage/modules/screen-effects/editor/effect-visual-ux`);
    const browserSource = page.getByRole("checkbox", { name: "OBS Browser Source", exact: true });
    const embeddedAudio = page.getByRole("checkbox", { name: "Play embedded audio" });
    await expect(browserSource).toBeVisible();
    await expect(embeddedAudio).toBeVisible();
    await expect.poll(() => browserSource.evaluate((element) => getComputedStyle(element.closest("label")!).display)).toBe("flex");
    await expect.poll(() => embeddedAudio.evaluate((element) => getComputedStyle(element.closest("label")!).display)).toBe("flex");
    await captureEvidence(page, "screen-effects-phone-light.png");
  });

  test("asset secondary filters start collapsed in the served full application", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${runtime.url}/manage/assets`);
    await expect(page.getByRole("searchbox", { name: "Search assets" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Type" })).toBeVisible();
    const moreFilters = page.getByText("More filters", { exact: true });
    await expect(moreFilters).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Usage" })).toBeHidden();
    await captureEvidence(page, "assets-desktop-light.png");
  });

  test("Settings disclosures and desktop tray control work in the served full application", async ({ page }) => {
    await page.route(`${runtime.url}/config/desktop`, (route) => route.fulfill({ json: { available: true, closeToTray: true } }));
    await page.route(`${runtime.url}/management/settings/backup-summary`, (route) => route.fulfill({ json: {
      state: "ready", appVersion: "0.0.0", schemaVersion: 1, configurationRecordCount: 8, assetCount: 1, totalAssetBytes: 4,
      dataDirectory: "C:/isolated/data", assetDirectory: "C:/isolated/assets", logLevel: "INFO", logRetentionHours: 48,
      secretExclusions: ["Provider credentials", "Overlay route keys"], blockers: []
    } }));
    await page.route(`${runtime.url}/audio/status`, (route) => route.fulfill({ json: {
      capability: { available: true, devices: [{ deviceId: "synthetic", label: "Synthetic output" }], reason: null, nextStep: null },
      muted: false,
      routes: ["Alerts", "Speech", "Stream"].map((name, index) => ({
        route: { id: `synthetic-${index}`, name, deviceId: "synthetic", deviceLabel: "Synthetic output" }, state: "ready"
      }))
    } }));
    await page.route(`${runtime.url}/overlay-surfaces`, (route) => route.fulfill({ json: {
      surfaces: [
        { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "missing-display", opacity: 1, layers: [{ moduleId: "alerts", visible: true }] },
        { id: "unified-browser:default", kind: "unified-browser", overlayId: "default", layers: [{ moduleId: "screen-effects", visible: true }, { moduleId: "alerts", visible: true }] }
      ],
      desktop: { available: false, displays: [], state: "unavailable", message: "The saved display is unavailable." }
    } }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${runtime.url}/manage/settings`);

    const server = page.getByText("Server settings", { exact: true }).locator("..", { has: page.locator("small") }).locator("..");
    await expect(page.getByText("Audio outputs · 3 configured", { exact: true })).toBeVisible();
    const surfacesSummary = page.getByText("Overlay surfaces · 2 configured · Needs attention", { exact: true });
    await expect(surfacesSummary).toBeVisible();
    await expect(page.getByText("The saved display is unavailable.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save server settings" })).toBeHidden();
    await captureEvidence(page, "settings-compact-desktop-light.png");
    await server.focus();
    await server.press("Enter");
    await expect(page.locator(".overlay-surfaces").getByText("Screen Effects", { exact: true })).toBeVisible();
    await surfacesSummary.click();
    await expect(page.getByRole("button", { name: "Save server settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export backup" })).toBeHidden();
    await captureEvidence(page, "settings-server-open-desktop-light.png");
    await server.press("Enter");

    const tray = page.getByRole("checkbox", { name: "Close window to tray" });
    const trayText = page.getByText("Close window to tray", { exact: true });
    await expectInlineCheckbox(tray, trayText);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectInlineCheckbox(tray, trayText);
    await captureEvidence(page, "settings-phone-light.png");
  });

  test("Home separates completed setup from enabled alert configuration attention", async ({ page }) => {
    await page.goto(`${runtime.url}/manage/modules/alerts`);
    await page.getByRole("button", { name: "Enable New follower" }).click();
    await expect(page.getByRole("button", { name: "Disable New follower" })).toBeVisible();
    await page.route(`${runtime.url}/management/home`, async (route) => {
      const response = await route.fetch();
      const summary = await response.json() as { readiness: Array<{ state: string }> };
      summary.readiness = summary.readiness.map((item) => ({ ...item, state: "complete" }));
      await route.fulfill({ response, json: summary });
    });
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`${runtime.url}/manage`);

    await expect(page.getByText("Setup is complete.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alert configuration" })).toBeVisible();
    await expect(page.getByText("New follower")).toBeVisible();
    await expect(page.getByText(/Connection and delivery still require/)).toBeVisible();
    await captureEvidence(page, "home-attention-desktop-light.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("New follower")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await captureEvidence(page, "home-attention-phone-light.png");
  });

  test("reward, asset, module, and speech labels stay readable in the served full application", async ({ page }) => {
    await page.route(`${runtime.url}/management/alert-sets/*`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      const detail = await response.json() as { inventory: Array<{ eventType: string; conditions: unknown[] }> };
      const rewardAlert = detail.inventory.find((candidate) => candidate.eventType === "channel_point_redemption");
      if (rewardAlert !== undefined) rewardAlert.conditions = [{ field: "channelPointReward", operator: "oneOf", value: ["reward-hydrate"] }];
      await route.fulfill({ response, json: detail });
    });
    await page.route(`${runtime.url}/twitch/custom-rewards`, (route) => route.fulfill({ json: { rewards: [{
      id: "reward-hydrate", title: "Hydrate", prompt: "Drink water", cost: 100, backgroundColor: "#00E5CB",
      isUserInputRequired: false, isEnabled: true, isPaused: false, isInStock: true
    }] } }));
    const browserSpeechProvider = {
      id: "browser-speech", name: "Browser Speech", kind: "browser-speech", capability: "tts", active: true,
      connectionState: "connected", intakeState: null, validatedAt: "2026-09-15T12:00:00.000Z", error: null, usedByAlertCount: 1
    };
    await page.route(`${runtime.url}/management/providers?capability=tts`, (route) => route.fulfill({ json: [browserSpeechProvider] }));
    await page.route(`${runtime.url}/management/providers/browser-speech`, (route) => route.fulfill({ json: {
      provider: browserSpeechProvider, configuration: {}, availableVoices: [], ttsSafety: null
    } }));
    await page.route(`${runtime.url}/management/providers/browser-speech/tts-safety`, (route) => route.fulfill({ json: {
      defaultVoiceId: null, volume: 1, minimumRate: 0.5, maximumRate: 2, maximumTextLength: 240
    } }));
    await page.route(`${runtime.url}/management/assets/library`, async (route) => {
      const response = await route.fetch();
      const items = await response.json() as Array<{ id: string; usage: { assetId: string; totalUsageCount: number; usages: unknown[] } }>;
      const first = items[0];
      if (first !== undefined) first.usage = {
        assetId: first.id,
        totalUsageCount: 1,
        usages: [{ setId: "set-default", setName: "Default", eventType: "channel_point_redemption", alertId: "alert-reward", alertName: "Custom reward", targetProfileIds: ["landscape", "vertical"] }]
      };
      await route.fulfill({ response, json: items });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${runtime.url}/manage/modules/alerts`);
    await expect(page.getByText("Channel point reward is one of Hydrate")).toBeVisible();
    await captureEvidence(page, "reward-label-desktop-light.png");

    await page.goto(`${runtime.url}/manage/assets`);
    await expect(page.getByText("Default / Channel point redemption / Landscape, Vertical", { exact: true })).toBeVisible();
    await captureEvidence(page, "asset-labels-desktop-light.png");

    await page.goto(`${runtime.url}/manage/tts-providers`);
    await page.getByRole("button", { name: "Select Browser Speech" }).click();
    await expect(page.getByLabel("Volume (0–1)")).toBeVisible();
    await expect(page.getByText("1 = 100% volume; 0 = silent")).toBeVisible();
    await expect(page.getByLabel("Minimum rate (×)")).toBeVisible();
    await expect(page.getByText("1× is normal speed; 0.5× is half speed; 2× is double speed.")).toBeVisible();
    await captureEvidence(page, "tts-units-desktop-light.png");
  });
});

async function captureEvidence(page: Page, fileName: string): Promise<void> {
  const directory = process.env.STREAM_JAMS_VISUAL_EVIDENCE_DIR;
  if (directory === undefined) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, fileName), fullPage: true });
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address");
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function expectInlineCheckbox(checkbox: Locator, textLocator: Locator): Promise<void> {
  const checkboxBox = await checkbox.boundingBox();
  const textBox = await textLocator.boundingBox();
  expect(checkboxBox).not.toBeNull();
  expect(textBox).not.toBeNull();
  expect(textBox!.x).toBeGreaterThan(checkboxBox!.x + checkboxBox!.width);
  expect(Math.abs((checkboxBox!.y + checkboxBox!.height / 2) - (textBox!.y + textBox!.height / 2))).toBeLessThanOrEqual(4);
}

function operatorSnapshot(): MergedOperationsSnapshot {
  return {
    revision: 3,
    owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
    current: [row("alerts", "current-alert", "Current follow", "playing"), row("screen-effects", "current-effect", "Current sweep", "playing")],
    queued: [row("alerts", "pending-alert", "Pending follow", "queued", 1), row("screen-effects", "pending-effect", "Pending sweep", "queued", 1)],
    recent: [],
    paused: false,
    muted: false,
    doNotDisturb: false
  };
}

function row(moduleId: string, occurrenceId: string, name: string, status: OperationRow["status"], moduleQueuePosition: number | null = null): OperationRow {
  return {
    moduleId,
    occurrenceId,
    name,
    summary: "Synthetic full-app fixture",
    status,
    enqueuedAtMs: Date.parse("2026-09-15T12:00:00.000Z"),
    completedAtMs: null,
    sequence: 1,
    moduleQueuePosition
  };
}
