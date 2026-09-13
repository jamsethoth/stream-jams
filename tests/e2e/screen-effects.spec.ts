import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("creates, saves, enables, tests, and reloads one Screen Effect", async ({ page }) => {
  await mockManagementShell(page);
  const createRequests: Record<string, unknown>[] = [];
  const updateRequests: Record<string, unknown>[] = [];
  const testRequests: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | null = null;

  await page.route("**/management/overlay-outputs", (route) => route.fulfill({ json: [{
    id: "module:screen-effects:live",
    label: "Screen Effects live",
    purpose: "live",
    scope: "module",
    moduleId: "screen-effects",
    enabled: true,
    copyableUrlStatus: "available"
  }] }));
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
  await page.route(/^https?:\/\/[^/]+\/screen-effects(?:\/.*)?$/u, async (route) => {
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
  await page.getByRole("button", { name: "New effect" }).click();

  await expect(page.getByRole("checkbox", { name: "Enabled", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.getByRole("button", { name: "Choose visual asset" }).click();
  await page.getByRole("button", { name: "Use selected asset" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Screen Effect saved");
  expect(createRequests).toHaveLength(1);
  expect(createRequests[0]).toMatchObject({
    enabled: false,
    variants: [{
      visual: { assetId: "asset-effect-image", mediaType: "image" },
      visualOutputs: { browserSource: true, desktop: false }
    }]
  });

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("New Screen Effect").first()).toBeVisible();
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
  expect(updateRequests[0]).toMatchObject({
    confirmLiveImpact: true,
    document: { enabled: true }
  });

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Preview silently" }).click();
  await expect(page.getByRole("dialog", { name: "Default" })).toContainText("never sends provider events, device sound, or Browser Source audio");
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByRole("button", { name: "Live Test…" }).click();
  const dialog = page.getByRole("dialog", { name: "Send live Screen Effect test?" });
  await expect(dialog).toContainText("OBS Browser Source visual");
  await dialog.getByRole("button", { name: "Confirm live test" }).click();
  await expect(page.getByRole("status")).toContainText("Live Test queued");
  expect(testRequests).toEqual([{
    variantId: (createRequests[0]!.variants as { id: string }[])[0]!.id,
    confirmLiveImpact: true
  }]);

  await page.reload();
  await expect(page.getByLabel("Effect name")).toHaveValue("New Screen Effect");
  await expect(page.getByRole("checkbox", { name: "Enabled", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Live Test…" })).toBeEnabled();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect.poll(() => createRequests.length).toBe(2);
  expect(createRequests[1]).toMatchObject({ enabled: false, name: "New Screen Effect copy" });
  expect(createRequests[1]!.id).not.toBe(createRequests[0]!.id);
});

test("blocks a no-output live test and retains an enabled draft after save failure", async ({ page }) => {
  await mockManagementShell(page);
  const document = noOutputEffect();
  let updateAttempts = 0;
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
  await page.getByRole("button", { name: "Preview silently" }).click();
  await expect(page.getByRole("dialog", { name: "Default" })).toContainText("never sends provider events, device sound, or Browser Source audio");
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByRole("button", { name: "Live Test…" }).click();
  const testDialog = page.getByRole("dialog", { name: "Send live Screen Effect test?" });
  await expect(testDialog).toContainText("No enabled destination is available");
  await expect(testDialog.getByRole("button", { name: "Confirm live test" })).toBeDisabled();
  await testDialog.getByRole("button", { name: "Cancel" }).click();

  const name = page.getByLabel("Effect name");
  await name.fill("Unsaved no-output effect");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Save live changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Storage failed");
  await expect(name).toHaveValue("Unsaved no-output effect");
  expect(updateAttempts).toBe(1);
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
    cooldownSeconds: 0,
    bindings: [],
    variants: [{
      id: "variant-no-output",
      name: "Default",
      kind: "default",
      enabled: true,
      weight: 1,
      visual: {
        mediaType: "image",
        assetId: "missing-neutral-image",
        layout: { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 }
      },
      sound: null,
      animation: null,
      durationMs: 10_000,
      outputs: { browserSource: false, deviceRouteIds: [] },
      visualOutputs: { browserSource: false, desktop: false }
    }]
  };
}
