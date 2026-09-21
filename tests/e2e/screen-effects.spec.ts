import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("creates, saves, enables, tests, and reloads one Screen Effect", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockManagementShell(page);
  const createRequests: Record<string, unknown>[] = [];
  const updateRequests: Record<string, unknown>[] = [];
  const testRequests: Record<string, unknown>[] = [];
  const moduleRequests: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | null = null;
  let moduleEnabled = false;
  let browserSourceCreated = false;
  await page.route("**/screen-effect-sets", (route) => route.fulfill({ json: [{ id: "screen-effects-default", name: "Default", active: true, effectIds: saved === null ? [] : [saved.id] }] }));

  await page.route("**/management/overlay-outputs", (route) => route.fulfill({ json: [{
    id: "module:screen-effects:live",
    label: "Screen Effects live",
    purpose: "live",
    overlayId: "default",
    scope: "module",
    moduleId: "screen-effects",
    targetProfileId: null,
    enabled: moduleEnabled,
    keyId: browserSourceCreated ? "screen-effects-key" : null,
    url: browserSourceCreated ? "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_secret" : null,
    copyableUrlStatus: browserSourceCreated ? "available" : "create-required"
  }] }));
  await page.route("**/overlay-modules/screen-effects/config", (route) => route.fulfill({ json: {
    moduleId: "screen-effects", enabled: moduleEnabled, config: {}, updatedAt: "2026-09-13T12:00:00.000Z"
  } }));
  await page.route("**/overlay-modules/screen-effects/enabled", async (route) => {
    const body = route.request().postDataJSON() as { enabled: boolean };
    moduleRequests.push(body);
    moduleEnabled = body.enabled;
    await route.fulfill({ json: {
      moduleId: "screen-effects", enabled: moduleEnabled, config: {}, updatedAt: "2026-09-13T12:00:00.000Z"
    } });
  });
  await page.route("**/management/overlay-outputs/keys", async (route) => {
    browserSourceCreated = true;
    await route.fulfill({ json: { output: {
      id: "module:screen-effects:live", label: "Screen Effects live", purpose: "live",
      overlayId: "default", scope: "module", moduleId: "screen-effects", targetProfileId: null,
      enabled: moduleEnabled, keyId: "screen-effects-key",
      url: "http://127.0.0.1:39187/overlay/modules/screen-effects/live/ovl_secret",
      copyableUrlStatus: "available"
    } } });
  });
  await page.route("**/management/assets/library", (route) => route.fulfill({ json: [assetLibraryItem()] }));
  await page.route("**/assets/asset-effect-image/file", (route) => route.fulfill({
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='36'><rect width='64' height='36' fill='#667788'/></svg>",
    contentType: "image/svg+xml"
  }));
  await page.route("**/twitch/auth/status", (route) => route.fulfill({ json: {
    connected: false,
    authorizationState: "disconnected",
    missingScopes: [],
    account: null
  } }));
  await page.route("**/management/providers?capability=event-source", (route) => route.fulfill({ json: [] }));
  await page.route(/^https?:\/\/[^/]+\/screen-effects(?:\/[^?]*)?(?:\?.*)?$/u, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    expect(request.headers().authorization).toBe("Bearer mgmt_e2e");
    if (request.method() !== "GET") {
      expect(request.headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    }
    if (path.endsWith("/test")) {
      const body = request.postDataJSON() as Record<string, unknown>;
      testRequests.push(body);
      await route.fulfill({ json: {
        effectId: String(saved?.id),
        occurrenceId: `occurrence-${String(body.variantId)}`,
        status: "queued"
      } });
      return;
    }
    if (request.method() === "POST") {
      saved = request.postDataJSON() as Record<string, unknown>;
      createRequests.push(saved);
      await route.fulfill({ status: 201, json: saved });
      return;
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { document: Record<string, unknown> };
      updateRequests.push(body as unknown as Record<string, unknown>);
      saved = body.document;
      await route.fulfill({ json: saved });
      return;
    }
    if (path === "/screen-effects") {
      await route.fulfill({ json: saved === null ? [] : [saved] });
      return;
    }
    await route.fulfill({ json: saved });
  });

  await page.goto("/manage/modules/screen-effects");
  await expect(page.getByText("No Screen Effects yet.")).toBeVisible();
  await page.getByRole("button", { name: "Enable Screen Effects module" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("Module enabled")).toBeVisible();
  expect(moduleRequests).toEqual([{ enabled: true }]);
  await page.getByRole("button", { name: "Browser sources" }).click();
  await page.getByRole("button", { name: "Create URL" }).click();
  await expect(page.getByRole("button", { name: "Reveal Screen Effects live Browser Source URL" })).toBeVisible();
  await page.getByRole("button", { name: "New effect" }).click();

  await expect(page.getByRole("tab", { name: "Variant", exact: true })).toBeVisible();
  const saveBounds = await page.getByRole("button", { name: "Save", exact: true }).boundingBox();
  expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(768);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.getByRole("tab", { name: "Variant", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Triggers", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Trusted triggers" })).toBeVisible();

  await page.getByRole("tab", { name: "Effect", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Enabled", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "Variant", exact: true }).click();
  await page.getByRole("button", { name: "Choose visual asset" }).click();
  await page.getByRole("button", { name: "Use selected asset" }).click();
  await expect(page.getByRole("region", { name: "Effect canvas" }).getByRole("img")).toBeVisible();
  await page.screenshot({ path: "test-results/screen-effects-editor-laptop.png" });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.getByLabel("Variant name", { exact: true }).fill("Default");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Screen Effect saved");
  expect(createRequests).toHaveLength(1);
  expect(createRequests[0]).toMatchObject({
    enabled: false,
    variants: [{
      visual: { assetId: "asset-effect-image", mediaType: "image" },
      visualOutputs: { browserSource: true, desktop: false }
    }]
  });

  await page.getByRole("button", { name: "Back to Screen Effects" }).click();
  await page.getByText("New Screen Effect", { exact: true }).click();
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByRole("button", { name: "Disable", exact: true })).toBeVisible();
  expect(updateRequests[0]).toMatchObject({
    confirmLiveImpact: true,
    document: { enabled: true }
  });

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Effect canvas" })).toContainText("No live outputs or triggers are sent");
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(page.getByRole("region", { name: "Effect canvas" }).getByText(/Preview (playing|stopped)/)).toContainText("Preview playing");
  await page.getByRole("checkbox", { name: "Mute preview" }).check();
  await page.getByRole("button", { name: "Stop preview" }).click();
  await expect(page.getByRole("region", { name: "Effect canvas" }).getByText(/Preview (playing|stopped)/)).toContainText("Preview stopped");

  await page.getByRole("button", { name: "Test saved…" }).click();
  const dialog = page.getByRole("dialog", { name: "Test saved Screen Effect?" });
  await expect(dialog).toContainText("Saved input");
  await expect(dialog).toContainText("OBS Browser Source visual");
  await dialog.getByRole("button", { name: "Confirm live test" }).click();
  await expect(page.getByRole("status")).toContainText("Saved test queued");
  expect(testRequests).toEqual([{
    variantId: (createRequests[0]!.variants as { id: string }[])[0]!.id,
    confirmLiveImpact: true
  }]);

  await page.reload();
  await page.getByRole("tab", { name: "Effect", exact: true }).click();
  await expect(page.getByLabel("Effect name")).toHaveValue("New Screen Effect");
  await expect(page.getByRole("checkbox", { name: "Enabled", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Test saved…" })).toBeEnabled();

  await page.getByRole("button", { name: "Back to Screen Effects" }).click();
  await page.getByText("New Screen Effect", { exact: true }).click();
  await page.getByRole("button", { name: "More actions for New Screen Effect" }).click();
  await page.getByRole("menuitem", { name: "Copy New Screen Effect" }).click();
  await expect.poll(() => createRequests.length).toBe(2);
  expect(createRequests[1]).toMatchObject({ enabled: false, name: "New Screen Effect copy" });
  expect(createRequests[1]!.id).not.toBe(createRequests[0]!.id);
});

test("blocks a no-output live test and retains an enabled draft after save failure", async ({ page }) => {
  await mockManagementShell(page);
  const document = noOutputEffect();
  let updateAttempts = 0;
  await page.route("**/screen-effect-sets", (route) => route.fulfill({ json: [{ id: "screen-effects-default", name: "Default", active: true, effectIds: [document.id] }] }));
  await page.route("**/screen-effects", (route) => route.fulfill({ json: [document] }));
  await page.route("**/management/assets/library", (route) => route.fulfill({ json: [] }));
  await page.route("**/twitch/auth/status", (route) => route.fulfill({ json: {
    connected: false,
    authorizationState: "disconnected",
    missingScopes: [],
    account: null
  } }));
  await page.route("**/management/providers?capability=event-source", (route) => route.fulfill({ json: [] }));
  await page.route("**/screen-effects/effect-no-output", async (route) => {
    if (route.request().method() === "PUT") {
      updateAttempts += 1;
      await route.fulfill({
        status: 500,
        json: { error: { code: "SCREEN_EFFECT_SAVE_FAILED", id: "ref-effect-save", message: "Storage failed" } }
      });
      return;
    }
    await route.fulfill({ json: document });
  });

  await page.goto("/manage/modules/screen-effects/editor/effect-no-output");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Effect canvas" })).toContainText("No live outputs or triggers are sent");

  await page.getByRole("button", { name: "Test saved…" }).click();
  const testDialog = page.getByRole("dialog", { name: "Test saved Screen Effect?" });
  await expect(testDialog).toContainText("No destination is selected");
  await expect(testDialog.getByRole("button", { name: "Confirm live test" })).toBeDisabled();
  await testDialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "New variant" }).click();
  await expect(page.getByLabel("Variant name", { exact: true })).toHaveValue("Variant 2");
  await expect(page.getByRole("checkbox", { name: "Variant enabled" })).not.toBeChecked();
  await page.getByRole("button", { name: "Undo" }).click();

  await page.getByRole("tab", { name: "Effect", exact: true }).click();
  await expect(page.getByLabel("Queue priority")).toBeVisible();
  await expect(page.getByText(/Higher numbers are queued first when one event matches multiple effects/)).toBeVisible();
  await expect(page.getByLabel("Effect cooldown")).toHaveCount(0);
  const name = page.getByLabel("Effect name");
  await name.fill("Unsaved no-output effect");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Save live changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Storage failed" })).toContainText("ref-effect-save");
  await expect(name).toHaveValue("Unsaved no-output effect");
  expect(updateAttempts).toBe(1);
});

test("switches the single live set and navigates collapsible variants without losing drafts", async ({ page }) => {
  await mockManagementShell(page);
  await page.route("**/management/overlay-outputs", (route) => route.fulfill({ json: [] }));
  await page.route("**/overlay-modules/screen-effects/config", (route) => route.fulfill({ json: { moduleId: "screen-effects", enabled: true, config: {}, updatedAt: "2026-09-16T12:00:00.000Z" } }));
  const first = noOutputEffect();
  const second = { ...noOutputEffect(), id: "effect-second", name: "Second effect" };
  first.variants.push({ ...first.variants[0]!, id: "alternate", name: "Alternate", weight: 3 });
  const documents = [first, second];
  let effectMutationRequests = 0;
  let sets = [{ id: "default", name: "Default", active: true, effectIds: documents.map((item) => item.id) }];
  await page.route("**/screen-effect-sets**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/activate")) {
      expect(request.postDataJSON()).toEqual({ confirmLiveImpact: true });
      const id = path.split("/")[2];
      sets = sets.map((set) => ({ ...set, active: set.id === id }));
      await route.fulfill({ status: 204 });
    } else if (request.method() === "POST") {
      const input = request.postDataJSON() as { id: string; name: string };
      const created = { ...input, active: false, effectIds: [] as string[] };
      sets.push(created);
      await route.fulfill({ status: 201, json: created });
    } else await route.fulfill({ json: sets });
  });
  await page.route(/^https?:\/\/[^/]+\/screen-effects(?:\/.*)?$/u, (route) => {
    if (route.request().method() !== "GET") effectMutationRequests += 1;
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/screen-effects" ? documents : documents.find((item) => path.endsWith(item.id)) });
  });
  await page.route("**/management/assets/library", (route) => route.fulfill({ json: [] }));
  await page.route("**/management/providers?capability=event-source", (route) => route.fulfill({ json: [] }));
  await page.route("**/twitch/auth/status", (route) => route.fulfill({ json: { connected: false, authorizationState: "disconnected", missingScopes: [], account: null } }));
  await page.goto("/manage/modules/screen-effects");
  await page.getByRole("button", { name: "Create set", exact: true }).click();
  await page.getByLabel("Set name").fill("Gaming");
  await page.getByRole("button", { name: "Save set" }).click();
  const gaming = page.getByRole("region", { name: "Gaming Screen Effect set" });
  await gaming.getByRole("button", { name: "Activate set" }).click();
  await expect(page.getByRole("dialog")).toContainText("Only enabled effects in Gaming");
  expect(sets.filter((set) => set.active).map((set) => set.name)).toEqual(["Default"]);
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(gaming).toContainText("Live set");
  await expect(gaming.getByRole("button", { name: "Delete set" })).toBeDisabled();
  expect(sets.filter((set) => set.active).map((set) => set.name)).toEqual(["Gaming"]);
  await page.reload();
  const original = page.getByRole("region", { name: "Default Screen Effect set" });
  await original.getByRole("button", { name: /Default ·/ }).click();
  await expect(page.getByRole("button", { name: "Alternate variant" })).toBeHidden();
  await original.getByText("No-output effect", { exact: true }).click();
  await expect(original.getByText("Weight 1 · 25% expected · Enabled")).toBeVisible();
  await expect(original.getByText("Weight 3 · 75% expected · Enabled")).toBeVisible();
  await page.getByRole("button", { name: "Alternate variant" }).click();
  await expect(page.getByLabel("Variant name", { exact: true })).toHaveValue("Alternate");
  await expect(page).toHaveURL(/variant=alternate/);
  await expect(page.getByLabel("Variant weight")).toHaveValue("3");
  await page.getByRole("button", { name: "Simulate 1,000 selections" }).click();
  const simulation = page.getByRole("table", { name: "Weight simulation" });
  await expect(simulation).toBeVisible();
  const counts = await simulation.locator("tbody tr td:nth-child(4)").allTextContents();
  expect(counts.reduce((total, count) => total + Number(count), 0)).toBe(1_000);
  expect(effectMutationRequests).toBe(0);
  await page.reload();
  await expect(page.getByLabel("Variant name", { exact: true })).toHaveValue("Alternate");
  await page.getByLabel("Variant name", { exact: true }).fill("Unsaved variant");
  await page.getByRole("complementary", { name: "Screen Effect hierarchy" }).getByText("Second effect", { exact: true }).click();
  await page.locator("details.screen-effect-tree__effect").filter({ has: page.getByText("Second effect", { exact: true }) }).getByRole("button", { name: "Default variant", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("unsaved changes");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Variant name", { exact: true })).toHaveValue("Unsaved variant");
});

test("plays and mutes local draft sound without live output", async ({ page }) => {
  await mockManagementShell(page);
  const base = noOutputEffect();
  const document = { ...base, variants: [{ ...base.variants[0]!, visual: null, sound: { assetId: "preview-sound", volume: 0.35 }, durationMs: 1000 }] };
  await page.route("**/screen-effect-sets", (route) => route.fulfill({ json: [{ id: "default", name: "Default", active: true, effectIds: [document.id] }] }));
  await page.route("**/screen-effects", (route) => route.fulfill({ json: [document] }));
  await page.route("**/screen-effects/effect-no-output", (route) => route.fulfill({ json: document }));
  await page.route("**/management/assets/library", (route) => route.fulfill({ json: [{ ...assetLibraryItem(), id: "preview-sound", displayName: "Preview sound", mediaType: "audio", mimeType: "audio/wav" }] }));
  await page.route("**/management/providers?capability=event-source", (route) => route.fulfill({ json: [] }));
  await page.route("**/twitch/auth/status", (route) => route.fulfill({ json: { connected: false, authorizationState: "disconnected", missingScopes: [], account: null } }));
  const wav = Buffer.alloc(16044);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.route("**/assets/preview-sound/file", (route) => route.fulfill({ body: wav, contentType: "audio/wav" }));
  let liveRequests = 0;
  await page.route("**/screen-effects/*/test", (route) => { liveRequests += 1; return route.abort(); });
  await page.goto("/manage/modules/screen-effects/editor/effect-no-output");
  await page.getByLabel("Variant name", { exact: true }).fill("Unsaved preview");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const dialog = page.getByRole("region", { name: "Effect canvas" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Play preview" }).click();
  const audio = dialog.getByLabel("Preview sound");
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused && element.volume === 0.35)).toBe(true);
  await dialog.getByRole("checkbox", { name: "Mute preview" }).check();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.muted)).toBe(true);
  await expect(dialog.getByText(/Preview (playing|stopped)/)).toContainText("Preview stopped");
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await dialog.getByRole("button", { name: "Play preview" }).click();
  await dialog.getByRole("button", { name: "Stop preview" }).click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(liveRequests).toBe(0);
});

function assetLibraryItem() {
  return {
    id: "asset-effect-image",
    displayName: "Neutral effect image",
    originalFileName: "neutral.svg",
    mediaType: "image",
    mimeType: "image/svg+xml",
    sizeBytes: 256,
    width: 64,
    height: 36,
    durationMs: null,
    health: "available",
    tags: ["neutral"],
    createdAt: "2026-09-13T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
    usage: { assetId: "asset-effect-image", totalUsageCount: 0, usages: [] }
  };
}

function noOutputEffect() {
  return {
    schemaVersion: 1,
    id: "effect-no-output",
    name: "No-output effect",
    enabled: true,
    description: null,
    category: null,
    priority: 0,
    bindings: [],
    variants: [{
      id: "variant-no-output",
      name: "Default",
      enabled: true,
      weight: 1,
      visual: {
        mediaType: "image",
        assetId: "missing-neutral-image",
        layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }
      },
      sound: null,
      durationMs: 10_000,
      outputs: { browserSource: false, deviceRouteIds: [] },
      visualOutputs: { browserSource: false, desktop: false }
    }]
  };
}
