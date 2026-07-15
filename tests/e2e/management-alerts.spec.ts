import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("management alerts reviews the starter set and safely manages its landscape output", async ({ page }) => {
  await mockManagementShell(page);
  const commands: Array<{ readonly command: string; readonly body: unknown }> = [];
  let reviewed = false;
  let enabled = false;
  let routeKey = "ovl_landscape_e2e";

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
        connectionState: "connected",
        lastConnectedAt: "2026-07-15T05:00:00.000Z",
        keyId: "key-landscape",
        url: `http://127.0.0.1:39187/overlay/modules/alerts/live/${routeKey}?profile=landscape`,
        copyableUrlStatus: "available"
      },
      {
        id: "module:alerts:landscape:test",
        targetProfileId: "landscape",
        purpose: "test",
        connectionState: "never-connected",
        lastConnectedAt: null,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
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
      },
      {
        id: "module:alerts:vertical:test",
        targetProfileId: "vertical",
        purpose: "test",
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

  await page.goto("/manage");
  await page.getByRole("link", { name: "Alerts" }).click();

  await expect(page.getByRole("heading", { name: "Default" })).toBeVisible();
  const source = page.getByRole("textbox", { name: "Landscape live browser source" });
  await expect(source).toHaveValue(
    "http://127.0.0.1:39187/overlay/modules/alerts/live/********?profile=landscape"
  );
  await page.getByRole("button", { name: "Reveal Landscape live URL" }).click();
  await expect(source).toHaveValue(
    "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_landscape_e2e?profile=landscape"
  );

  await page.getByRole("button", { name: "Enable New follower" }).click();
  await expect(page.getByText("New follower enabled.")).toBeVisible();
  await page.getByRole("button", { name: "Mark starter review done" }).click();
  await expect(page.getByText("Starter review marked complete. Alerts remain disabled until you enable them.")).toBeVisible();

  await page.getByRole("button", { name: "Regenerate Landscape live URL" }).click();
  const dialog = page.getByRole("dialog", { name: "Regenerate Landscape live URL?" });
  await expect(dialog.getByRole("button", { name: "Regenerate URL" })).toBeDisabled();
  await dialog.getByLabel("Type REGENERATE to continue").fill("REGENERATE");
  await dialog.getByRole("button", { name: "Regenerate URL" }).click();
  await expect(page.getByText(/Landscape live URL regenerated/u)).toBeVisible();

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
