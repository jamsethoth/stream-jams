import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

interface AlertInventoryFixture {
  readonly id: string;
  readonly setId: string;
  readonly providerKind: "twitch";
  readonly eventType: "raid";
  readonly parentAlertId: string | null;
  readonly name: string;
  readonly kind: "default" | "variation";
  readonly enabled: boolean;
  readonly reviewState: "ready" | "needs-review";
  readonly targetProfileIds: readonly ("landscape" | "vertical")[];
  readonly previewText: string;
}

test("management alerts reviews the starter set and safely manages its landscape output", async ({ page }) => {
  await mockManagementShell(page);
  const commands: Array<{ readonly command: string; readonly body: unknown }> = [];
  let reviewed = false;
  let enabled = false;
  let listening = true;
  let routeKey = "ovl_landscape_e2e";
  const testRequests: unknown[] = [];
  const editorDocument = alertEditorDocument();

  const overview = () => ({
    id: "set-default",
    name: "Default",
    active: true,
    starter: true,
    starterReviewState: reviewed ? "complete" : "pending",
    enabledAlertCount: enabled ? 1 : 0,
    targetProfiles: [
      {
        id: "landscape",
        enabled: true,
        reviewState: "ready",
        blockerCount: enabled ? 0 : 1,
        warningCount: 0
      },
      {
        id: "vertical",
        enabled: false,
        reviewState: "needs-review",
        blockerCount: 0,
        warningCount: 0
      }
    ],
    validationIssues: enabled
      ? []
      : [
          {
            id: "set-default:no-enabled-alerts",
            severity: "blocker",
            code: "NO_ENABLED_ALERTS",
            message: "This alert set has no enabled alerts.",
            nextStep: "Review and enable at least one valid alert.",
            targetProfileId: "landscape",
            providerKind: null,
            eventType: null,
            alertId: null,
            referenceId: null
          }
        ],
    outputs: []
  });

  const detail = () => ({
    overview: overview(),
    inventory: [
      {
        id: "alert-follow",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "follow",
        name: "New follower",
        kind: "default",
        enabled,
        reviewState: enabled ? "ready" : "needs-review",
        targetProfileIds: ["landscape"],
        previewText: "Thanks for following, {actor.displayName}!"
      }
    ],
    browserSources: [
      {
        id: "module:alerts:landscape:live",
        targetProfileId: "landscape",
        purpose: "live",
        connectionState: listening ? "connected" : "disconnected",
        lastConnectedAt: "2026-07-15T05:00:00.000Z",
        keyId: "key-landscape",
        url: `http://127.0.0.1:39187/overlay/modules/alerts/live/${routeKey}?profile=landscape`,
        copyableUrlStatus: "available"
      },
      {
        id: "module:alerts:vertical:live",
        targetProfileId: "vertical",
        purpose: "live",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
      }
    ]
  });

  await page.route("**/management/alert-sets", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    await route.fulfill({ contentType: "application/json", json: [overview()] });
  });
  await page.route("**/management/alert-sets/set-default", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    await route.fulfill({ contentType: "application/json", json: detail() });
  });
  await page.route("**/management/alert-sets/set-default/starter-review", async (route) => {
    reviewed = true;
    commands.push({ command: "review", body: route.request().postDataJSON() });
    await route.fulfill({ contentType: "application/json", json: overview() });
  });
  await page.route("**/management/alerts/alert-follow/enabled", async (route) => {
    const body = route.request().postDataJSON() as { readonly enabled: boolean };
    enabled = body.enabled;
    commands.push({ command: "enable", body });
    await route.fulfill({ contentType: "application/json", json: detail() });
  });
  await page.route("**/management/alerts/alert-follow/editor", async (route) => {
    await route.fulfill({ contentType: "application/json", json: editorDocument });
  });
  await page.route("**/management/alerts/alert-follow/editor/test", async (route) => {
    testRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      json: { status: "queued", targetProfileId: "landscape", referenceId: "ref-inline-e2e", test: true }
    });
  });
  await page.route("**/management/overlay-outputs/keys/regenerate", async (route) => {
    const body = route.request().postDataJSON();
    commands.push({ command: "regenerate", body });
    routeKey = "ovl_regenerated_e2e";
    await route.fulfill({
      contentType: "application/json",
      json: {
        keyId: "key-regenerated",
        url: `http://127.0.0.1:39187/overlay/modules/alerts/live/${routeKey}?profile=landscape`,
        output: {
          id: "module:alerts:landscape:live",
          label: "Alerts Landscape Live",
          purpose: "live",
          scope: "module",
          moduleId: "alerts",
          targetProfileId: "landscape",
          overlayId: "default",
          enabled: true,
          keyId: "key-regenerated",
          url: `http://127.0.0.1:39187/overlay/modules/alerts/live/${routeKey}?profile=landscape`,
          copyableUrlStatus: "available"
        }
      }
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/manage");
  await page.getByRole("link", { name: "Alerts" }).click();

  const browserSources = page.getByRole("region", { name: "Browser sources" });
  const alertSets = page.getByRole("region", { name: "Alert sets" });
  const selectedSet = page.getByRole("region", { name: "Default alert set" });
  await expect(alertSets.getByRole("region", { name: "Default alert set" })).toBeVisible();
  await expect(alertSets.getByRole("region", { name: "Browser sources" })).toHaveCount(0);
  await expect(selectedSet.getByRole("button", { name: "Collapse Default" })).toBeVisible();
  await expect(browserSources.getByText("1 ready")).toBeVisible();
  await expect(browserSources.getByText("1 needs setup")).toBeVisible();
  await expect(browserSources.getByRole("article", { name: "Landscape browser source" })).toHaveCount(0);
  await browserSources.getByRole("button", { name: "Expand browser sources" }).click();
  const sourceCard = browserSources.getByRole("article", { name: "Landscape browser source" });
  await expect(sourceCard.getByRole("textbox", { name: "Landscape browser source" })).toHaveCount(0);
  await expect(sourceCard.locator("code")).toContainText("********");
  await expect(sourceCard.getByText("Ready")).toBeVisible();
  await expect(sourceCard.getByText("Profile enabled")).toBeVisible();
  await expect(sourceCard.getByText("Listening now")).toBeVisible();
  await expect(sourceCard.getByText("1920 x 1080", { exact: true })).toBeVisible();
  await expect(sourceCard.getByText(/Add a Browser source in OBS at 1920 x 1080/u)).toBeVisible();
  const alertRow = page.getByRole("row", { name: /New follower/u });
  await expect(alertRow.getByRole("button", { name: "Edit New follower" })).toBeVisible();
  await expect(alertRow.getByRole("button", { name: "Test New follower" })).toBeVisible();
  await expect(alertRow.getByRole("button", { name: "Enable New follower" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  listening = false;
  await expect(sourceCard.getByText(/Not listening\. Last seen/u)).toBeVisible({ timeout: 7_000 });
  await page.getByRole("button", { name: "Reveal Landscape URL" }).click();
  const source = sourceCard.getByRole("textbox", { name: "Landscape browser source" });
  await expect(source).toHaveValue(
    "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape_e2e?profile=landscape"
  );
  await page.getByRole("button", { name: "Hide Landscape URL" }).click();
  await expect(sourceCard.getByRole("textbox", { name: "Landscape browser source" })).toHaveCount(0);

  await page.getByRole("button", { name: "Enable New follower" }).click();
  await expect(page.getByText("New follower enabled.")).toBeVisible();
  await page.getByRole("button", { name: "Mark starter review done" }).click();
  await expect(page.getByText("Starter review marked complete. Alerts remain disabled until you enable them.")).toBeVisible();
  await page.getByRole("button", { name: "Test New follower" }).click();
  await expect(page.getByText("New follower test queued for Landscape. Reference ref-inline-e2e.")).toBeVisible();
  expect(testRequests).toHaveLength(1);
  expect(testRequests[0]).toMatchObject({
    targetProfileId: "landscape",
    samplePayload: { actor: { displayName: "James" } },
    includeAudio: true,
    includeTts: true
  });

  await page.getByRole("button", { name: "Regenerate Landscape URL" }).click();
  const dialog = page.getByRole("dialog", { name: "Regenerate Landscape URL?" });
  await expect(dialog.getByRole("button", { name: "Regenerate URL" })).toBeDisabled();
  await dialog.getByLabel("Type REGENERATE to continue").fill("REGENERATE");
  await dialog.getByRole("button", { name: "Regenerate URL" }).click();
  await expect(page.getByText(/Landscape URL regenerated/u)).toBeVisible();

  expect(commands).toEqual([
    { command: "enable", body: { enabled: true } },
    { command: "review", body: null },
    {
      command: "regenerate",
      body: {
        overlayId: "default",
        scope: "module",
        moduleId: "alerts",
        purpose: "live",
        targetProfileId: "landscape"
      }
    }
  ]);

});

test("management alerts creates and tests a disabled community-gift alert", async ({ page }) => {
  await mockManagementShell(page);
  const createAlertRequests: unknown[] = [];
  const testRequests: unknown[] = [];
  let communityGiftCreated = false;
  const document = alertEditorDocument();
  const overview = {
    id: "set-default",
    name: "Default",
    active: true,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
  const detail = () => ({
    overview,
    inventory: [
      {
        id: "alert-follow",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "follow",
        name: "New follower",
        kind: "default",
        enabled: true,
        reviewState: "ready",
        targetProfileIds: ["landscape"],
        previewText: "Thanks for following!"
      },
      ...(communityGiftCreated ? [{
        id: "alert-community-gift",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "community_gift",
        name: "Community gift received",
        kind: "default",
        enabled: false,
        reviewState: "needs-review",
        targetProfileIds: ["landscape", "vertical"],
        previewText: "StreamerFan gifted 5 Tier 1000 subscriptions!"
      }] : [])
    ],
    browserSources: [{
      id: "module:alerts:landscape:live",
      targetProfileId: "landscape",
      purpose: "live",
      connectionState: "connected",
      lastConnectedAt: "2026-07-15T05:00:00.000Z",
      keyId: "key-landscape",
      url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape?profile=landscape",
      copyableUrlStatus: "available"
    }]
  });

  await page.route("**/management/alert-sets", (route) => route.fulfill({ contentType: "application/json", json: [overview] }));
  await page.route("**/management/alert-sets/set-default", (route) => route.fulfill({ contentType: "application/json", json: detail() }));
  await page.route("**/management/alert-sets/set-default/alerts", async (route) => {
    const body = route.request().postDataJSON() as { readonly eventType: string; readonly name: string };
    createAlertRequests.push(body);
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      json: {
        id: "alert-community-gift",
        setId: "set-default",
        providerKind: "twitch",
        eventType: body.eventType,
        name: body.name,
        kind: "default",
        enabled: false,
        reviewState: "needs-review",
        targetProfileIds: ["landscape", "vertical"],
        previewText: "StreamerFan gifted 5 Tier 1000 subscriptions!"
      }
    });
    communityGiftCreated = true;
  });
  await page.route("**/management/alerts/alert-community-gift/editor", (route) => route.fulfill({
    contentType: "application/json",
    json: {
      ...document,
      id: "alert-community-gift",
      eventType: "community_gift",
      name: "Community gift received",
      enabled: false,
      targetProfiles: document.targetProfiles.map((profile) => profile.id === "landscape"
        ? { ...profile, enabled: true, reviewState: "ready" }
        : { ...profile, enabled: false, reviewState: "needs-review" }),
      samplePayloads: [
        { id: "normal", label: "Aggregate community gift", kind: "built-in", payload: { actor: { id: "sample-user", displayName: "StreamerFan" }, userName: "StreamerFan", amount: 5, tier: "1000", cumulativeTotal: 42, frequency: "Aggregate community gift" } },
        { id: "edge", label: "Aggregate community gift edge", kind: "built-in", payload: { actor: { id: "sample-edge", displayName: "A-Very-Long-Display-Name-For-Layout-Review" }, userName: "A-Very-Long-Display-Name-For-Layout-Review", amount: 100, tier: "3000", cumulativeTotal: 9999, frequency: "Aggregate community gift" } }
      ]
    }
  }));
  await page.route("**/management/alerts/alert-community-gift/editor/test", async (route) => {
    testRequests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", json: { status: "queued", targetProfileId: "landscape", referenceId: "ref-community-gift", test: true } });
  });

  await page.goto("/manage/modules/alerts");
  const selectedSet = page.getByRole("region", { name: "Default alert set" });
  await selectedSet.getByRole("button", { name: "Add alert" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add alert" });
  await createDialog.getByLabel("Event type").selectOption("community_gift");
  await expect(createDialog.getByLabel("Alert name")).toHaveValue("Community gift received");
  await createDialog.getByRole("button", { name: "Create alert" }).click();

  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/alert-community-gift\?.*profile=landscape/u);
  await expect(page.getByRole("region", { name: "Landscape alert canvas" })).toBeVisible();
  await page.getByRole("tab", { name: "Event" }).click();
  await expect(page.getByRole("combobox", { name: "Sample payload" })).toHaveValue("normal");
  await expect(page.getByRole("button", { name: "Add gift count minimum" })).toBeVisible();
  await page.getByLabel("Alert inspector").getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText(/Queued on Landscape.*ref-community-gift/u)).toBeVisible();
  expect(testRequests).toEqual([expect.objectContaining({
    targetProfileId: "landscape",
    samplePayload: expect.objectContaining({ amount: 5, tier: "1000" })
  })]);
  await page.getByRole("button", { name: "Back to alerts" }).click();
  const createdRow = page.getByRole("row", { name: /Community gift received/u });
  await expect(createdRow).toContainText("Disabled");
  await expect(createdRow).toContainText("Needs review");
  expect(createAlertRequests).toEqual([{ eventType: "community_gift", name: "Community gift received" }]);
});

test("alert variation can be created edited duplicated and selectively deleted", async ({ page }) => {
  await mockManagementShell(page);
  const requests: Array<{ readonly command: string; readonly id: string; readonly body: unknown }> = [];
  const overview = {
    id: "set-default",
    name: "Default",
    active: true,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
  const defaultRaid: AlertInventoryFixture = {
    id: "alert-raid",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "raid",
    parentAlertId: null,
    name: "New raid",
    kind: "default",
    enabled: true,
    reviewState: "ready",
    targetProfileIds: ["landscape"],
    previewText: "Raid preview"
  };
  let inventory: AlertInventoryFixture[] = [defaultRaid];
  let variationDocument = {
    ...alertEditorDocument(),
    id: "variant-large-raid",
    eventType: "raid",
    kind: "variation",
    parentAlertId: defaultRaid.id,
    name: "Large raid",
    enabled: false,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    targetProfiles: alertEditorDocument().targetProfiles.map((profile) => ({
      ...profile,
      enabled: false,
      reviewState: "needs-review" as const
    }))
  };
  const detail = () => ({ overview, inventory, browserSources: [] });

  await page.route("**/management/alert-sets", (route) => route.fulfill({ contentType: "application/json", json: [overview] }));
  await page.route("**/management/alert-sets/set-default", (route) => route.fulfill({ contentType: "application/json", json: detail() }));
  await page.route("**/management/alerts/alert-raid/variations", async (route) => {
    const body = route.request().postDataJSON() as { readonly name: string };
    const created: AlertInventoryFixture = {
      ...defaultRaid,
      id: variationDocument.id,
      parentAlertId: defaultRaid.id,
      name: body.name,
      kind: "variation",
      enabled: false,
      reviewState: "needs-review",
      targetProfileIds: []
    };
    inventory = [...inventory, created];
    variationDocument = { ...variationDocument, name: body.name };
    requests.push({ command: "create", id: defaultRaid.id, body });
    await route.fulfill({ contentType: "application/json", status: 201, json: created });
  });
  await page.route("**/management/alerts/variant-large-raid/editor", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { readonly document: typeof variationDocument; readonly confirmLiveImpact: boolean };
      variationDocument = body.document;
      requests.push({ command: "save", id: variationDocument.id, body });
    }
    await route.fulfill({ contentType: "application/json", json: variationDocument });
  });
  await page.route("**/management/alerts/variant-large-raid/duplicate", async (route) => {
    const duplicate: AlertInventoryFixture = {
      ...inventory.find((alert) => alert.id === variationDocument.id)!,
      id: "variant-large-raid-copy",
      name: "Large raid copy",
      enabled: false,
      reviewState: "needs-review"
    };
    inventory = [...inventory, duplicate];
    requests.push({ command: "duplicate", id: variationDocument.id, body: null });
    await route.fulfill({ contentType: "application/json", status: 201, json: duplicate });
  });
  await page.route("**/management/alerts/variant-large-raid-copy", async (route) => {
    const body = route.request().postDataJSON();
    inventory = inventory.filter((alert) => alert.id !== "variant-large-raid-copy");
    requests.push({ command: "delete", id: "variant-large-raid-copy", body });
    await route.fulfill({ status: 204 });
  });

  await page.goto("/manage/modules/alerts");
  await page.getByRole("row", { name: /New raid/u }).getByText("More", { exact: true }).click();
  await page.getByRole("button", { name: "Add variation to New raid" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add variation to New raid" });
  await createDialog.getByLabel("Variation name").fill("Large raid");
  await createDialog.getByRole("button", { name: "Create variation" }).click();
  await expect(page.getByText("Large raid created disabled and marked Needs review.")).toBeVisible();
  await page.getByRole("button", { name: "Edit Large raid" }).click();

  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/variant-large-raid/u);
  await page.getByRole("tab", { name: "Alert" }).click();
  await page.getByRole("button", { name: "Mark profile reviewed" }).click();
  await page.getByRole("checkbox", { name: "Use this profile for live alerts" }).check();
  await page.getByRole("tab", { name: "Event" }).click();
  const variationConditions = page.getByRole("group", { name: "Variation conditions" });
  await variationConditions.getByRole("button", { name: "Add raid viewer minimum" }).click();
  await variationConditions.getByRole("spinbutton", { name: "Variation conditions Raid viewer minimum" }).fill("25");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();
  await page.getByRole("button", { name: "Back to alerts" }).click();

  await page.locator("summary[aria-label='More actions for Large raid']").click();
  await page.getByRole("button", { name: "Duplicate Large raid" }).click();
  await expect(page.getByText("Large raid copy duplicated disabled and marked Needs review.")).toBeVisible();
  await page.locator("summary[aria-label='More actions for Large raid']").click();
  await page.locator("summary[aria-label='More actions for Large raid copy']").click();
  await page.getByRole("button", { name: "Delete Large raid copy" }).click();
  await page.getByRole("dialog", { name: "Delete Large raid copy?" }).getByRole("button", { name: "Delete alert" }).click();
  await expect(page.getByText("Large raid copy deleted.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Large raid copy/u })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Large raid/u })).toBeVisible();

  expect(requests).toEqual([
    { command: "create", id: "alert-raid", body: { name: "Large raid" } },
    {
      command: "save",
      id: "variant-large-raid",
      body: expect.objectContaining({
        confirmLiveImpact: false,
        document: expect.objectContaining({ variantConditions: [{ field: "raidViewers", operator: "min", value: 25 }] })
      })
    },
    { command: "duplicate", id: "variant-large-raid", body: null },
    { command: "delete", id: "variant-large-raid-copy", body: { confirmLiveImpact: true } }
  ]);
});

test("focused alert editor saves layouts and separates preview from test delivery", async ({ page }) => {
  await mockManagementShell(page);
  await page.setViewportSize({ width: 820, height: 768 });
  const savedDocuments: unknown[] = [];
  const testRequests: unknown[] = [];
  const document = alertEditorDocument();
  const overview = {
    id: "set-default",
    name: "Default",
    active: true,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 1 }
    ],
    validationIssues: [],
    outputs: []
  };
  const detail = {
    overview,
    inventory: [{
      id: "alert-follow",
      setId: "set-default",
      providerKind: "twitch",
      eventType: "follow",
      name: "New follower",
      kind: "default",
      enabled: true,
      reviewState: "ready",
      targetProfileIds: ["landscape"],
      previewText: "Thanks for following!"
    }],
    browserSources: []
  };

  await page.route("**/management/alert-sets", (route) => route.fulfill({ contentType: "application/json", json: [overview] }));
  await page.route("**/management/alert-sets/set-default", (route) => route.fulfill({ contentType: "application/json", json: detail }));
  await page.route("**/management/alerts/alert-follow/editor", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { readonly document: unknown };
      savedDocuments.push(body.document);
      await route.fulfill({ contentType: "application/json", json: body.document });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: document });
  });
  await page.route("**/management/alerts/alert-follow/editor/test", async (route) => {
    testRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      json: { status: "queued", targetProfileId: "landscape", referenceId: "ref-e2e-editor", test: true }
    });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Alerts" }).click();
  await page.getByRole("button", { name: "Edit New follower" }).click();

  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/alert-follow\?.*profile=landscape/u);
  await expect(page.getByRole("region", { name: "Landscape alert canvas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const focusedContent = await page.locator(".management-route-content--focused").boundingBox();
  expect(focusedContent?.width).toBeGreaterThan(1280);
  await page.getByRole("textbox", { name: "Message template" }).fill("Welcome, {actor.displayName}!");
  await page.getByRole("button", { name: "Save" }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save changes to active alert?" });
  await expect(saveDialog.getByText("Follow events")).toBeVisible();
  await expect(saveDialog.getByText("Landscape")).toBeVisible();
  await saveDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();
  expect(savedDocuments).toHaveLength(1);
  expect(savedDocuments[0]).toMatchObject({ layers: [{ template: "Welcome, {actor.displayName}!" }] });

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Local preview is running.")).toBeVisible();
  expect(testRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText(/Queued on Landscape.*ref-e2e-editor/u)).toBeVisible();
  expect(testRequests).toHaveLength(1);

  await page.getByRole("button", { name: /Vertical/u }).click();
  await expect(page.getByRole("button", { name: "Send test" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Vertical alert canvas" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Alert editor requires a larger screen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to alerts" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Vertical alert canvas" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Save" })).toBeHidden();
});

test("focused alert editor authors TTS against the active provider", async ({ page }) => {
  await mockManagementShell(page);
  let providers: unknown[] = [];
  type EditorFixture = ReturnType<typeof alertEditorDocument>;
  let document: Omit<EditorFixture, "layers"> & { layers: Array<Record<string, unknown>> } = alertEditorDocument();
  const savedDocuments: unknown[] = [];
  const overview = {
    id: "set-default",
    name: "Default",
    active: false,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
  const detail = {
    overview,
    inventory: [{
      id: "alert-follow",
      setId: "set-default",
      providerKind: "twitch",
      eventType: "follow",
      parentAlertId: null,
      name: "New follower",
      kind: "default",
      enabled: true,
      reviewState: "ready",
      targetProfileIds: ["landscape"],
      previewText: "Thanks for following!"
    }],
    browserSources: []
  };

  await page.route("**/management/providers?capability=tts", (route) => route.fulfill({
    contentType: "application/json",
    json: providers
  }));
  await page.route("**/management/alert-sets/set-default", (route) => route.fulfill({
    contentType: "application/json",
    json: detail
  }));
  await page.route("**/management/alerts/alert-follow/editor", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { readonly document: typeof document };
      document = body.document;
      savedDocuments.push(document);
    }
    await route.fulfill({ contentType: "application/json", json: document });
  });

  await page.goto("/manage/modules/alerts/editor/alert-follow?profile=landscape");
  await page.getByRole("button", { name: "TTS" }).click();
  await expect(page.getByRole("checkbox", { name: "Enable TTS for this alert" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Set up a TTS provider" })).toHaveAttribute("href", "/manage/tts-providers");

  providers = [{
    id: "provider-speakerbot",
    name: "Studio Speaker.bot",
    kind: "speakerbot",
    capability: "tts",
    active: true,
    connectionState: "connected",
    intakeState: null,
    validatedAt: "2026-07-18T04:00:00.000Z",
    error: null,
    usedByAlertCount: 1
  }];
  document = {
    ...alertEditorDocument(),
    layers: [{
      id: "layer-tts",
      name: "Speech",
      type: "tts",
      visible: true,
      order: 0,
      enabled: true,
      providerId: "browser-speech",
      template: "Welcome {actor.displayName}",
      animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" }
    }],
    targetProfiles: alertEditorDocument().targetProfiles.map((profile) => ({ ...profile, layerLayouts: [] }))
  };
  await page.reload();

  await expect(page.getByText("Studio Speaker.bot")).toBeVisible();
  await page.getByRole("textbox", { name: "TTS template" }).fill("Hello {actor.displayName}");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();
  expect(savedDocuments).toHaveLength(1);
  expect(savedDocuments[0]).toMatchObject({
    layers: [{ type: "tts", enabled: true, providerId: "speakerbot", template: "Hello {actor.displayName}" }]
  });
});

function alertEditorDocument() {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "New follower",
    enabled: true,
    conditions: [],
    durationMs: 5_000,
    layers: [{
      id: "layer-text",
      name: "Message",
      type: "text",
      visible: true,
      order: 0,
      template: "Thanks, {actor.displayName}!",
      animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
    }],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "layer-text", x: 610, y: 720, width: 700, height: 160, zIndex: 0 }] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [{ layerId: "layer-text", x: 190, y: 1180, width: 700, height: 160, zIndex: 0 }] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { actor: { displayName: "James" } } }]
  };
}
