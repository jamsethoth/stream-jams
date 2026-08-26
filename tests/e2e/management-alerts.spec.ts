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
  const editAction = alertRow.getByRole("button", { name: "Edit New follower" });
  await expect(editAction).toBeVisible();
  await expect(alertRow.getByRole("button", { name: "Test New follower" })).toBeVisible();
  const moreAction = alertRow.locator("summary[aria-label='More actions for New follower']");
  const compactControlMetrics = async (locator: typeof editAction) => locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderRadius: style.borderRadius,
      fontSize: style.fontSize,
      height: element.getBoundingClientRect().height,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight
    };
  });
  expect(await compactControlMetrics(moreAction)).toEqual(await compactControlMetrics(editAction));
  const enableToggle = alertRow.getByRole("button", { name: "Enable New follower" });
  await expect(enableToggle).toBeVisible();
  const enableBox = await enableToggle.boundingBox();
  expect(enableBox).not.toBeNull();
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  listening = false;
  await expect(sourceCard.getByText(/Not listening\. Last seen/u)).toBeVisible({ timeout: 7_000 });
  await page.getByRole("button", { name: "Reveal Landscape URL" }).click();
  const source = sourceCard.getByRole("textbox", { name: "Landscape browser source" });
  await expect(source).toHaveValue(
    "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape_e2e?profile=landscape"
  );
  await page.getByRole("button", { name: "Hide Landscape URL" }).click();
  await expect(sourceCard.getByRole("textbox", { name: "Landscape browser source" })).toHaveCount(0);

  await enableToggle.click();
  const disableToggle = alertRow.getByRole("button", { name: "Disable New follower" });
  await expect(disableToggle).toBeVisible();
  const disableBox = await disableToggle.boundingBox();
  expect(disableBox).not.toBeNull();
  expect(disableBox!.width).toBe(enableBox!.width);
  await expect(page.locator(".management-toast--success")).toContainText("New follower enabled.");
  await page.getByRole("button", { name: "Mark starter review done" }).click();
  const reviewWarning = page.locator(".management-toast--warning");
  await expect(reviewWarning).toContainText("Starter review marked complete.");
  await expect(reviewWarning).toContainText("Alerts remain disabled until you enable them.");
  await page.getByRole("button", { name: "Test New follower" }).click();
  const successToast = page.locator(".management-toast--success");
  await expect(successToast).toContainText("New follower test queued for Landscape. Reference ref-inline-e2e.");
  const toastBounds = await successToast.boundingBox();
  if (toastBounds === null) throw new Error("Expected the success toast to have visible bounds.");
  expect(toastBounds.x).toBeGreaterThanOrEqual(0);
  expect(toastBounds.x + toastBounds.width).toBeLessThanOrEqual(390);
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
  await expect(page.locator(".management-toast--warning")).toContainText("Landscape URL regenerated.");
  await expect(page.locator(".management-toast--warning")).toContainText("Update every browser source that used the old URL.");

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
  await page.route("**/management/alerts/alert-community-gift/editor/variation-context", (route) => route.fulfill({
    contentType: "application/json",
    json: defaultVariationContext({
      id: "alert-community-gift",
      eventType: "community_gift",
      enabled: false,
      weight: 1,
      priority: null
    })
  }));
  await page.route("**/management/alerts/alert-community-gift/editor/test", async (route) => {
    testRequests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", json: { status: "queued", targetProfileId: "landscape", referenceId: "ref-community-gift", test: true } });
  });

  await page.goto("/manage/modules/alerts");
  const selectedSet = page.getByRole("region", { name: "Default alert set" });
  await selectedSet.getByRole("button", { name: "Add alert for Community gift received" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add alert" });
  await expect(createDialog.getByLabel("Event type")).toBeDisabled();
  await expect(createDialog.getByLabel("Event type")).toHaveValue("community_gift");
  await expect(createDialog.getByLabel("Alert name")).toHaveValue("Community gift received");
  await createDialog.getByRole("button", { name: "Create alert" }).click();

  await expect(page).toHaveURL(/\/manage\/modules\/alerts$/u);
  const createdRow = page.getByRole("row", { name: /Community gift received/u });
  await expect(createdRow).toContainText("Disabled");
  await expect(createdRow).toContainText("Needs review");
  const editCreated = createdRow.getByRole("button", { name: "Edit Community gift received" });
  await expect(editCreated).toBeFocused();
  await editCreated.click();
  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/alert-community-gift\?.*profile=landscape/u);
  await expect(page.getByRole("region", { name: "Landscape alert canvas" })).toBeVisible();
  await page.getByRole("tab", { name: "Event" }).click();
  await expect(page.getByRole("combobox", { name: "Sample payload" })).toHaveValue("normal");
  const ruleConditions = page.getByRole("group", { name: "Rule conditions" });
  await ruleConditions.getByRole("button", { name: "Add condition" }).click();
  await ruleConditions.getByRole("combobox", { name: "Rule conditions condition 1 field" }).selectOption("giftCount");
  await ruleConditions.getByRole("combobox", { name: "Rule conditions Gift count operator" }).selectOption("min");
  await expect(ruleConditions.getByRole("spinbutton", { name: "Rule conditions Gift count value" })).toBeVisible();
  await page.getByLabel("Alert inspector").getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText(/Queued on Landscape.*ref-community-gift/u)).toBeVisible();
  expect(testRequests).toEqual([expect.objectContaining({
    targetProfileId: "landscape",
    samplePayload: expect.objectContaining({ amount: 5, tier: "1000" })
  })]);
  await page.getByRole("button", { name: "Revert" }).click();
  await page.getByRole("button", { name: "Back to alerts" }).click();
  await expect(createdRow).toContainText("Disabled");
  await expect(createdRow).toContainText("Needs review");
  expect(createAlertRequests).toEqual([{ eventType: "community_gift", name: "Community gift received" }]);
});

test("management alerts resets event disclosures when switching alert sets", async ({ page }) => {
  await mockManagementShell(page);
  const overview = (id: string, name: string, active: boolean) => ({
    id,
    name,
    active,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  });
  const defaultOverview = overview("set-default", "Default", true);
  const seasonalOverview = overview("set-seasonal", "Seasonal", false);
  const detail = (setOverview: ReturnType<typeof overview>, eventType: "follow" | "raid", name: string) => ({
    overview: setOverview,
    inventory: [{
      id: `alert-${eventType}`,
      setId: setOverview.id,
      providerKind: "twitch",
      eventType,
      name,
      kind: "default",
      enabled: true,
      reviewState: "ready",
      targetProfileIds: ["landscape"],
      previewText: `${name} preview`
    }],
    browserSources: []
  });

  await page.route("**/management/alert-sets", (route) => route.fulfill({
    contentType: "application/json",
    json: [defaultOverview, seasonalOverview]
  }));
  await page.route("**/management/alert-sets/set-default", (route) => route.fulfill({
    contentType: "application/json",
    json: detail(defaultOverview, "follow", "New follower")
  }));
  await page.route("**/management/alert-sets/set-seasonal", (route) => route.fulfill({
    contentType: "application/json",
    json: detail(seasonalOverview, "raid", "Seasonal raid")
  }));

  await page.goto("/manage/modules/alerts");
  await page.getByRole("button", { name: "Collapse Follow alerts" }).click();
  await expect(page.getByRole("button", { name: "Expand Follow alerts" })).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Expand Seasonal" }).click();
  await expect(page.getByRole("button", { name: "Collapse Raid alerts" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Edit Seasonal raid" })).toBeVisible();

  await page.getByRole("button", { name: "Expand Default" }).click();
  await expect(page.getByRole("button", { name: "Collapse Follow alerts" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Edit New follower" })).toBeVisible();
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
    priority: 5,
    cooldownSeconds: 0,
    rulePriority: 0,
    targetProfiles: alertEditorDocument().targetProfiles.map((profile) => ({
      ...profile,
      enabled: false,
      reviewState: "needs-review" as const
    })),
    samplePayloads: [{
      id: "normal",
      label: "Normal raid",
      kind: "built-in",
      payload: { userName: "Raider", raidViewers: 25, amount: 25 }
    }]
  };
  let siblingCandidates = [
    { editorId: "variant-weighted-raid", variantId: "variant-weighted-raid-resolver", kind: "variation", name: "Weighted raid", enabled: true, conditions: [{ field: "raidViewers", operator: "range", value: [10, 100] }], weight: 3, priority: 3 },
    { editorId: "variant-lower-raid", variantId: "variant-lower-raid-resolver", kind: "variation", name: "Lower raid", enabled: true, conditions: [], weight: 1, priority: 1 }
  ];
  let failNextSave = false;
  const testRequests: unknown[] = [];
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
      expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
      expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
      const body = route.request().postDataJSON() as {
        readonly document: typeof variationDocument;
        readonly confirmLiveImpact: boolean;
        readonly priorityAssignments?: readonly { readonly variationId: string; readonly priority: number }[];
      };
      if (failNextSave) {
        failNextSave = false;
        requests.push({ command: "save-failed", id: variationDocument.id, body });
        await route.fulfill({ contentType: "application/json", status: 500, json: { message: "Priority update failed. Reference ref-priority-save." } });
        return;
      }
      const priorities = new Map(body.priorityAssignments?.map((assignment) => [assignment.variationId, assignment.priority]));
      variationDocument = {
        ...body.document,
        priority: priorities.get("variant-large-raid-resolver") ?? body.document.priority
      };
      siblingCandidates = siblingCandidates.map((candidate) => ({
        ...candidate,
        priority: priorities.get(candidate.variantId) ?? candidate.priority
      }));
      requests.push({ command: "save", id: variationDocument.id, body });
    }
    await route.fulfill({ contentType: "application/json", json: variationDocument });
  });
  await page.route("**/management/alerts/variant-large-raid/editor/variation-context", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    await route.fulfill({
      contentType: "application/json",
      json: {
        ruleId: "alert-raid",
        eventType: "raid",
        candidates: [
          { editorId: "alert-raid", variantId: "alert-raid-default-resolver", kind: "default", name: "Default", enabled: true, conditions: [], weight: 1, priority: 0 },
          { editorId: variationDocument.id, variantId: "variant-large-raid-resolver", kind: "variation", name: variationDocument.name, enabled: variationDocument.enabled, conditions: variationDocument.variantConditions, weight: variationDocument.weight, priority: variationDocument.priority },
          ...siblingCandidates
        ]
      }
    });
  });
  await page.route("**/management/alerts/variant-large-raid/editor/test", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    expect(route.request().headers()["x-stream-jams-csrf"]).toBe("csrf_e2e");
    testRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      json: { status: "queued", targetProfileId: "landscape", referenceId: "ref-variation-selected", test: true }
    });
  });
  await page.route("**/management/alerts/variant-large-raid/editor/errors", async (route) => {
    const body = route.request().postDataJSON() as { readonly error: { readonly referenceId: string } };
    await route.fulfill({ contentType: "application/json", json: { referenceId: body.error.referenceId } });
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
  await page.getByRole("button", { name: "Add variation to New raid" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add variation to New raid" });
  await createDialog.getByLabel("Variation name").fill("Large raid");
  await createDialog.getByRole("button", { name: "Create variation" }).click();
  await expect(page.getByText("Large raid created disabled and marked Needs review.")).toBeVisible();
  await page.getByRole("button", { name: "Edit Large raid" }).click();

  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/variant-large-raid/u);
  await page.getByRole("tab", { name: "Alert" }).click();
  await page.getByRole("checkbox", { name: "Alert enabled" }).check();
  await page.getByRole("button", { name: "Mark profile reviewed" }).click();
  await page.getByRole("checkbox", { name: "Use this profile for live alerts" }).check();
  await page.getByRole("tab", { name: "Event" }).click();
  const priorityGroups = page.getByRole("region", { name: "Priority groups" });
  await priorityGroups.getByRole("group", { name: "Priority group 2" }).getByRole("button", { name: "Move group earlier" }).click();
  await priorityGroups.getByRole("combobox", { name: "Move Large raid to priority group" }).selectOption("0");
  const relativeChance = page.getByRole("spinbutton", { name: "Relative chance" });
  await relativeChance.fill("0");
  await expect(relativeChance).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Relative chance must be a positive whole number.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(page.locator(".alert-editor-page__header-actions").getByRole("button", { name: "Preview", exact: true })).toBeDisabled();
  await expect(page.locator(".alert-editor-page__header-actions").getByRole("button", { name: "Send test", exact: true })).toBeDisabled();
  await relativeChance.fill("1");
  const variationConditions = page.getByRole("group", { name: "Variation conditions" });
  await variationConditions.getByRole("button", { name: "Add condition" }).click();
  await variationConditions.getByRole("combobox", { name: "Variation conditions Raid viewers operator" }).selectOption("range");
  await variationConditions.getByRole("spinbutton", { name: "Variation conditions Raid viewers Maximum" }).fill("100");
  await variationConditions.getByRole("spinbutton", { name: "Variation conditions Raid viewers Minimum" }).fill("10");
  const explanation = page.getByRole("region", { name: "Sample selection explanation" });
  await expect(explanation).toContainText("1/4 weight · 25% relative chance");
  await expect(explanation).toContainText("3/4 weight · 75% relative chance");
  await page.getByRole("textbox", { name: "Session payload (JSON)" }).fill("{");
  await expect(explanation).toContainText("Correct the sample payload to explain selection.");
  await expect(page.locator(".alert-editor-page__header-actions").getByRole("button", { name: "Preview", exact: true })).toBeDisabled();
  await expect(page.locator(".alert-editor-page__header-actions").getByRole("button", { name: "Send test", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog", { name: "Save changes to active alert?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();

  const firstSave = requests.find((request) => request.command === "save");
  expect(firstSave?.body).toEqual(expect.objectContaining({
    confirmLiveImpact: true,
    document: expect.objectContaining({
      id: "variant-large-raid",
      weight: 1,
      variantConditions: [{ field: "raidViewers", operator: "range", value: [10, 100] }]
    }),
    priorityAssignments: [
      { variationId: "variant-weighted-raid-resolver", priority: 2 },
      { variationId: "variant-large-raid-resolver", priority: 2 },
      { variationId: "variant-lower-raid-resolver", priority: 1 }
    ]
  }));

  await page.reload();
  await page.getByRole("tab", { name: "Event" }).click();
  await expect(page.getByRole("region", { name: "Priority groups" }).getByRole("group", { name: "Priority group 1" })).toContainText("Large raid");
  await expect(page.getByRole("region", { name: "Priority groups" }).getByRole("group", { name: "Priority group 1" })).toContainText("Weighted raid");
  await page.getByLabel("Alert inspector").getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText(/Queued on Landscape.*ref-variation-selected/u)).toBeVisible();
  expect(testRequests).toEqual([expect.objectContaining({
    targetProfileId: "landscape",
    samplePayload: expect.objectContaining({ raidViewers: 25 })
  })]);

  const reloadedConditions = page.getByRole("group", { name: "Variation conditions" });
  const reloadedMinimum = reloadedConditions.getByRole("spinbutton", { name: "Variation conditions Raid viewers Minimum" });
  const reloadedMaximum = reloadedConditions.getByRole("spinbutton", { name: "Variation conditions Raid viewers Maximum" });
  await reloadedMinimum.fill("110");
  await expect(reloadedConditions.getByRole("alert")).toContainText("Raid viewers range minimum cannot exceed its maximum.");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  const headerActions = page.locator(".alert-editor-page__header-actions");
  await expect(headerActions.getByRole("button", { name: "Preview", exact: true })).toBeDisabled();
  await expect(headerActions.getByRole("button", { name: "Send test" })).toBeDisabled();
  await reloadedMinimum.fill("20");
  await reloadedMaximum.fill("60");
  const reloadedGroups = page.getByRole("region", { name: "Priority groups" });
  await reloadedGroups.getByRole("combobox", { name: "Move Lower raid to priority group" }).selectOption("0");
  failNextSave = true;
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog", { name: "Save changes to active alert?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("The alert was not saved")).toBeVisible();
  await expect(reloadedGroups.getByRole("group", { name: "Priority group 1" })).toContainText("Lower raid");
  await expect(reloadedMinimum).toHaveValue("20");
  await expect(reloadedMaximum).toHaveValue("60");
  await page.getByRole("button", { name: "Revert" }).click();
  await page.getByRole("button", { name: "Back to alerts" }).click();

  await page.locator("summary[aria-label='More actions for Large raid']").click();
  await page.getByRole("button", { name: "Duplicate Large raid" }).click();
  await expect(page.getByText("Large raid copy duplicated disabled and marked Needs review.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Large raid copy" })).toBeFocused();
  await page.locator("summary[aria-label='More actions for Large raid']").click();
  await page.locator("summary[aria-label='More actions for Large raid copy']").click();
  await page.getByRole("button", { name: "Delete Large raid copy" }).click();
  await page.getByRole("dialog", { name: "Delete Large raid copy?" }).getByRole("button", { name: "Delete alert" }).click();
  await expect(page.getByText("Large raid copy deleted.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Large raid copy/u })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Large raid/u })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Large raid" })).toBeFocused();

  expect(requests).toEqual([
    { command: "create", id: "alert-raid", body: { name: "Large raid" } },
    expect.objectContaining({ command: "save", id: "variant-large-raid" }),
    expect.objectContaining({ command: "save-failed", id: "variant-large-raid" }),
    { command: "duplicate", id: "variant-large-raid", body: null },
    { command: "delete", id: "variant-large-raid-copy", body: { confirmLiveImpact: true } }
  ]);
});

test("focused alert editor saves layouts and separates preview from test delivery", async ({ page }) => {
  await mockManagementShell(page);
  await page.setViewportSize({ width: 820, height: 768 });
  const savedDocuments: unknown[] = [];
  const previewRequests: unknown[] = [];
  const testRequests: unknown[] = [];
  const initialDocument = alertEditorDocument();
  let document: ReturnType<typeof alertEditorDocument> = {
    ...initialDocument,
    targetProfiles: initialDocument.targetProfiles.map((profile) => ({
      ...profile,
      enabled: true,
      reviewState: "needs-review"
    }))
  };
  const overview = {
    id: "set-default",
    name: "Default",
    active: true,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 1,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "needs-review", blockerCount: 0, warningCount: 1 },
      { id: "vertical", enabled: true, reviewState: "needs-review", blockerCount: 0, warningCount: 1 }
    ],
    validationIssues: [],
    outputs: []
  };
  const detail = {
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
        targetProfileIds: ["landscape", "vertical"],
        previewText: "Thanks for following!"
      },
      {
        id: "alert-raid",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "raid",
        parentAlertId: null,
        name: "New raid",
        kind: "default",
        enabled: true,
        conditions: [],
        weight: 1,
        priority: null,
        reviewState: "ready",
        targetProfileIds: ["landscape"],
        previewText: "Raid preview"
      },
      {
        id: "variant-large-raid",
        setId: "set-default",
        providerKind: "twitch",
        eventType: "raid",
        parentAlertId: "alert-raid",
        name: "Large raid",
        kind: "variation",
        enabled: true,
        conditions: [{ field: "raidViewers", operator: "min", value: 50 }],
        weight: 2,
        priority: 5,
        reviewState: "ready",
        targetProfileIds: ["landscape"],
        previewText: "Large raid preview"
      }
    ],
    browserSources: []
  };

  await page.route("**/management/alert-sets", (route) => route.fulfill({ contentType: "application/json", json: [overview] }));
  await page.route("**/management/alert-sets/set-default", (route) => route.fulfill({ contentType: "application/json", json: detail }));
  await page.route("**/management/alerts/alert-follow/editor", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { readonly document: typeof document };
      document = body.document;
      savedDocuments.push(body.document);
      await route.fulfill({ contentType: "application/json", json: body.document });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: document });
  });
  await page.route("**/management/alerts/alert-follow/editor/variation-context", (route) => route.fulfill({
    contentType: "application/json",
    json: defaultVariationContext(document)
  }));
  await page.route("**/management/alerts/alert-follow/editor/test", async (route) => {
    const request = route.request().postDataJSON() as { readonly targetProfileId: "landscape" | "vertical" };
    testRequests.push(request);
    await route.fulfill({
      contentType: "application/json",
      json: {
        status: "queued",
        targetProfileId: request.targetProfileId,
        referenceId: `ref-e2e-editor-${request.targetProfileId}`,
        test: true
      }
    });
  });
  await page.route("**/moderation/preview", async (route) => {
    const request = route.request().postDataJSON() as { readonly target: "rendered" | "tts"; readonly text: string };
    const removableSample = "Welcome, blocked-viewer https://viewer.example/path!";
    const expectedText = previewRequests.length === 0 ? removableSample : "Welcome, James!";
    expect(request).toEqual({ target: "rendered", text: expectedText });
    previewRequests.push(request);
    await route.fulfill({
      contentType: "application/json",
      json: {
        target: "rendered",
        settings: { maxLength: 240, blockedTerms: ["blocked-viewer"], stripUrls: true },
        text: request.text === removableSample ? "Welcome, Safe viewer!" : request.text,
        actions: request.text === removableSample
          ? [
              { type: "url-stripped", count: 1 },
              { type: "blocked-term-replaced", count: 1 }
            ]
          : []
      }
    });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Alerts" }).click();
  const tabletAlertRow = page.getByRole("row", { name: /New follower/u });
  await expect(tabletAlertRow.getByRole("button", { name: "Edit New follower" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit New follower" }).click();

  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/alert-follow\?.*profile=landscape/u);
  await expect(page.getByRole("region", { name: "Landscape alert canvas" })).toBeVisible();
  const selectedEvent = page.getByRole("button", { name: "Follow alerts, selected event" });
  await expect(selectedEvent).toHaveAttribute("aria-expanded", "true");
  await expect(selectedEvent).toBeDisabled();
  const raidDisclosure = page.getByRole("button", { name: /Collapse Raid alerts/u });
  await expect(raidDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Variation of New raid")).toBeVisible();
  await raidDisclosure.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Expand Raid alerts/u })).toHaveAttribute("aria-expanded", "false");
  await page.getByLabel("Search alerts").fill("Large raid");
  await expect(page.getByRole("button", { name: /Collapse Raid alerts/u })).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Search alerts").fill("");
  await expect(page.getByRole("button", { name: /Expand Raid alerts/u })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Fit" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const focusedContent = await page.locator(".management-route-content--focused").boundingBox();
  expect(focusedContent?.width).toBeGreaterThan(1280);
  const landscapeReviewWarning = page.locator(".alert-editor-page__profile-warning");
  await expect(landscapeReviewWarning).toContainText("Needs review");
  await landscapeReviewWarning.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("Unsaved")).toBeVisible();
  expect(savedDocuments).toHaveLength(0);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();
  expect(savedDocuments).toHaveLength(1);
  expect(savedDocuments[0]).toMatchObject({
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready" },
      { id: "vertical", enabled: true, reviewState: "needs-review" }
    ]
  });
  await page.getByRole("tab", { name: "Layers" }).click();
  const disclosures = [
    ["Typography", "Font size"],
    ["Text box", "Padding"],
    ["Position and size", "X"],
    ["Animation preset", "Animation duration (milliseconds)"]
  ] as const;
  const fontSize = page.getByLabel("Font size");
  for (const [label, controlLabel] of disclosures) {
    const summary = page.locator("summary").filter({ hasText: label });
    await expect(summary).toBeVisible();
    const control = page.getByLabel(controlLabel, { exact: true });
    await expect(control).toBeHidden();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(control).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  }
  await expect(fontSize).toHaveValue("32");
  await page.getByRole("textbox", { name: "Message template" }).fill("Welcome, {actor.displayName}!");
  await page.getByRole("button", { name: "100%" }).click();
  await page.getByLabel("Font preset").selectOption("serif");
  await fontSize.fill("48");
  await page.getByLabel("Font weight").selectOption("700");
  await page.getByLabel("Horizontal alignment").selectOption("right");
  await page.getByLabel("Vertical alignment").selectOption("bottom");
  await page.getByLabel("Background color color").fill("#102030");
  await page.getByLabel("Background color opacity").fill("75");
  await page.getByLabel("Padding").fill("16");
  await page.getByLabel("Corner radius").fill("18");
  const styledCanvasText = page.getByRole("region", { name: "Landscape alert canvas" }).getByText("Welcome, James!");
  await expect(styledCanvasText).toHaveCSS("font-size", "48px");
  await expect(styledCanvasText).toHaveCSS("justify-content", "flex-end");
  await expect(styledCanvasText).toHaveCSS("padding", "16px");
  await page.getByRole("button", { name: "Save" }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save changes to active alert?" });
  await expect(saveDialog.getByText("Follow events")).toBeVisible();
  await expect(saveDialog.getByText("Landscape")).toBeVisible();
  await saveDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();
  expect(savedDocuments).toHaveLength(2);
  expect(savedDocuments[1]).toMatchObject({
    layers: [{
      template: "Welcome, {actor.displayName}!",
      textStyle: {
        fontPreset: "serif",
        fontSizePx: 48,
        fontWeight: 700,
        horizontalAlign: "right",
        verticalAlign: "bottom"
      },
      boxStyle: {
        backgroundColor: "#102030BF",
        paddingPx: 16,
        cornerRadiusPx: 18
      }
    }]
  });

  await page.reload();
  await expect(page.getByLabel("Font preset")).toHaveValue("serif");
  await expect(page.getByLabel("Font size")).toHaveValue("48");
  await expect(page.getByLabel("Padding")).toHaveValue("16");
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shape", exact: true })).toBeVisible();
  await page.getByLabel("Fill color").fill("#336699");
  await page.getByLabel("Fill opacity").fill("80");
  await page.getByRole("textbox", { name: "Layer name" }).fill("Background panel");
  const shapePositionSummary = page.locator("summary").filter({ hasText: "Position and size" });
  await shapePositionSummary.click();
  await page.getByRole("group", { name: "Position and size" }).getByLabel("X", { exact: true }).fill("480");
  await page.getByRole("button", { name: "Move down" }).click();
  await page.getByRole("button", { name: "Move up" }).click();
  await expect(page.getByRole("region", { name: "Landscape alert canvas" }).locator(".alert-canvas__shape")).toHaveCSS("background-color", "rgba(51, 102, 153, 0.8)");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog", { name: "Save changes to active alert?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();
  expect(savedDocuments).toHaveLength(3);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Background panel" })).toBeVisible();
  await expect(page.getByLabel("Fill color")).toHaveValue("#336699");
  await expect(page.getByLabel("Fill opacity")).toHaveValue("80");
  await shapePositionSummary.click();
  await expect(page.getByRole("group", { name: "Position and size" }).getByLabel("X", { exact: true })).toHaveValue("480");
  await page.getByRole("tab", { name: "Event" }).click();
  await page.getByRole("textbox", { name: "Session payload (JSON)" }).fill(JSON.stringify({
    actor: { displayName: "blocked-viewer https://viewer.example/path" }
  }));
  const editorHeaderActions = page.locator(".alert-editor-page__header-actions");
  await editorHeaderActions.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Local preview is running.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Landscape alert canvas" }).getByText("Welcome, Safe viewer!", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Landscape alert canvas" }).locator(".alert-canvas__shape")).toBeVisible();
  expect(previewRequests).toContainEqual({
    target: "rendered",
    text: "Welcome, blocked-viewer https://viewer.example/path!"
  });
  expect(testRequests).toHaveLength(0);
  await editorHeaderActions.getByRole("button", { name: "Send test", exact: true }).click();
  await expect(page.getByText(/Queued on Landscape.*ref-e2e-editor-landscape/u)).toBeVisible();
  expect(testRequests).toHaveLength(1);
  expect(testRequests[0]).toMatchObject({
    document: {
      layers: expect.arrayContaining([
        expect.objectContaining({ type: "shape", name: "Background panel", fill: "#336699CC" })
      ])
    }
  });

  await page.getByRole("tab", { name: "Layers" }).click();
  await page.getByRole("button", { name: /Vertical/u }).click();
  await expect(editorHeaderActions.getByRole("button", { name: "Send test", exact: true })).toBeDisabled();
  const verticalCanvas = page.getByRole("region", { name: "Vertical alert canvas" });
  await expect(verticalCanvas).toBeVisible();
  await expect(verticalCanvas.getByText("Welcome, Safe viewer!", { exact: true })).toBeVisible();
  await expect(verticalCanvas.locator(".alert-canvas__shape")).toBeVisible();
  await expect(page.getByLabel("Fill color")).toHaveValue("#336699");
  await shapePositionSummary.click();
  await expect(page.getByRole("group", { name: "Position and size" }).getByLabel("X", { exact: true })).toHaveValue("190");
  await page.getByText("Message", { exact: true }).click();
  await expect(page.getByLabel("Font size")).toHaveValue("48");
  await expect(page.getByLabel("Padding")).toHaveValue("16");
  const verticalReviewWarning = page.locator(".alert-editor-page__profile-warning");
  await expect(verticalReviewWarning).toContainText("Needs review");
  await verticalReviewWarning.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Alert saved.")).toBeVisible();

  const verticalEditorUrl = new URL(page.url());
  verticalEditorUrl.searchParams.set("profile", "vertical");
  await page.goto(verticalEditorUrl.toString());
  await page.reload();
  await expect(page).toHaveURL(/profile=vertical/u);
  await expect(verticalCanvas).toBeVisible();
  await expect(verticalCanvas.getByText("Welcome, James!", { exact: true })).toBeVisible();
  await expect(verticalCanvas.locator(".alert-canvas__shape")).toBeVisible();
  await page.getByText("Message", { exact: true }).click();
  await expect(page.getByLabel("Font size")).toHaveValue("48");
  await expect(page.getByLabel("Padding")).toHaveValue("16");
  await editorHeaderActions.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Local preview is running.")).toBeVisible();
  await editorHeaderActions.getByRole("button", { name: "Send test", exact: true }).click();
  await expect(page.getByText(/Queued on Vertical.*ref-e2e-editor-vertical/u)).toBeVisible();
  expect(testRequests).toHaveLength(2);
  expect(testRequests).toEqual([
    expect.objectContaining({ targetProfileId: "landscape" }),
    expect.objectContaining({ targetProfileId: "vertical" })
  ]);
  const latestSavedDocument = savedDocuments.at(-1) as ReturnType<typeof alertEditorDocument>;
  const latestTextLayer = latestSavedDocument.layers.find((layer) => layer.type === "text");
  expect(latestTextLayer).toMatchObject({
    textStyle: { fontPreset: "serif", fontSizePx: 48 },
    boxStyle: { paddingPx: 16, cornerRadiusPx: 18 }
  });
  expect(latestSavedDocument.targetProfiles[0]?.layerLayouts).not.toEqual(
    latestSavedDocument.targetProfiles[1]?.layerLayouts
  );

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
  await page.route("**/management/alerts/alert-follow/editor/variation-context", (route) => route.fulfill({
    contentType: "application/json",
    json: defaultVariationContext(document)
  }));

  await page.goto("/manage/modules/alerts/editor/alert-follow?profile=landscape");
  await page.getByRole("button", { name: "TTS" }).click();
  await page.locator("summary").filter({ hasText: "Live TTS" }).click();
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

  const liveTtsSummary = page.locator("summary").filter({ hasText: "Live TTS" });
  const enabled = page.getByRole("checkbox", { name: "Enable TTS for this alert" });
  await expect(enabled).toBeHidden();
  await liveTtsSummary.focus();
  await page.keyboard.press("Enter");
  await expect(enabled).toBeVisible();
  await expect(page.getByText("Studio Speaker.bot")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
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
      textStyle: {
        fontPreset: "system-sans",
        fontSizePx: 32,
        fontWeight: 800,
        lineHeight: 1.15,
        horizontalAlign: "center",
        verticalAlign: "center",
        color: "#FFFFFFFF",
        shadow: { offsetX: 0, offsetY: 2, blur: 8, color: "#000000B8" }
      },
      boxStyle: {
        backgroundColor: "#00000000",
        paddingPx: 0,
        cornerRadiusPx: 0,
        shadow: null
      },
      animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }
    }],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "layer-text", x: 610, y: 720, width: 700, height: 160, zIndex: 0 }] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [{ layerId: "layer-text", x: 190, y: 1180, width: 700, height: 160, zIndex: 0 }] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal example", kind: "built-in", payload: { actor: { displayName: "James" } } }]
  };
}

function defaultVariationContext(document: {
  readonly id: string;
  readonly eventType: string;
  readonly enabled: boolean;
  readonly weight?: number;
  readonly priority?: number | null;
}) {
  return {
    ruleId: document.id,
    eventType: document.eventType,
    candidates: [{
      editorId: document.id,
      variantId: `${document.id}-default-resolver`,
      kind: "default",
      name: "Default",
      enabled: document.enabled,
      conditions: [],
      weight: document.weight ?? 1,
      priority: document.priority ?? null
    }]
  };
}
