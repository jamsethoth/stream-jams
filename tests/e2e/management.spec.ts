import { expect, test } from "@playwright/test";

test("management diagnostics include backend error code and id", async ({ page }) => {
  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_e2e" }
    });
  });
  await page.route("**/management/home", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          id: "err_dashboard",
          message: "A server error occurred. Use the error ID to find details in backend logs."
        }
      },
      status: 500
    });
  });
  await page.route("**/management/overlay-clients", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: []
    });
  });

  await page.goto("/manage");

  await expect(
    page.getByText(
      "A server error occurred. Use the error ID to find details in backend logs. (INTERNAL_SERVER_ERROR, err_dashboard)"
    )
  ).toBeVisible();
});

test("diagnostics workspace preserves correction context and copies sanitized evidence", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_diagnostics_e2e" }
    });
  });
  const alertSet = {
    id: "set-diagnostics",
    name: "Diagnostics alerts",
    active: true,
    starter: false,
    starterReviewState: "complete",
    enabledAlertCount: 0,
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", blockerCount: 0, warningCount: 0 },
      { id: "vertical", enabled: false, reviewState: "needs-review", blockerCount: 0, warningCount: 0 }
    ],
    validationIssues: [],
    outputs: []
  };
  await page.route("**/management/alert-sets", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [alertSet] });
  });
  await page.route("**/management/alert-sets/set-diagnostics", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { overview: alertSet, inventory: [], browserSources: [] }
    });
  });
  await page.route("**/management/diagnostics/workspace", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        problems: [
          {
            id: "problem-output",
            area: "outputs",
            summary: "Send test blocked",
            cause: "No browser-source client is connected.",
            nextStep: "Reconnect the browser-source output.",
            severity: "error",
            occurredAt: "2026-07-15T22:41:18.000Z",
            referenceId: "ref-output-e2e",
            correction: {
              label: "Open browser sources",
              route: "/manage/modules/alerts?diagnostic=ref-output-e2e#browser-sources"
            }
          }
        ],
        events: [
          {
            id: "event-e2e",
            providerId: "twitch",
            providerKind: "twitch",
            eventType: "subscription",
            occurredAt: "2026-07-15T22:28:07.000Z",
            outcome: "failed",
            test: false,
            referenceId: "ref-event-e2e",
            processingId: "processing-e2e",
            actorDisplayName: "viewer42",
            alertIds: ["alert-sub"],
            matchedRuleIds: ["rule-sub"],
            playbackStatus: "failed",
            errorMessage: "Alert rendering failed.",
            sanitizedPayload: { userName: "viewer42", authorization: "[REDACTED]" },
            correction: {
              label: "Open alert",
              route: "/manage/modules/alerts/editor/alert-sub?diagnostic=ref-event-e2e"
            }
          }
        ],
        rawLogs: [
          {
            id: "log-e2e",
            timestamp: "2026-07-15T22:31:44.000Z",
            level: "ERROR",
            component: "overlay",
            event: "test.blocked",
            referenceId: "ref-runtime-e2e",
            processingId: "processing-e2e",
            message: "Send test blocked because no client is connected.",
            data: { routeKey: "[REDACTED]" },
            correction: {
              label: "Open browser sources",
              route: "/manage/modules/alerts?diagnostic=ref-runtime-e2e#browser-sources"
            }
          }
        ]
      }
    });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Diagnostics" }).click();
  await page.getByPlaceholder("Reference ID or message").fill("ref-output-e2e");

  await expect(page.getByRole("link", { name: "Open browser sources" })).toHaveAttribute(
    "href",
    "/manage/modules/alerts?diagnostic=ref-output-e2e#browser-sources"
  );
  await page.getByRole("link", { name: "Open browser sources" }).click();
  await expect(page).toHaveURL(/\/modules\/alerts\?diagnostic=ref-output-e2e#browser-sources$/);
  await expect(page.getByRole("heading", { name: "Browser sources" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browser sources" })).toBeInViewport();
  await page.getByRole("link", { name: "Diagnostics" }).click();

  await page.getByPlaceholder("Reference ID or message").fill("");
  await page.getByRole("tab", { name: /Events/ }).click();
  await page.getByRole("button", { name: "subscription" }).click();
  await expect(page.getByLabel("Event detail")).toContainText("Alert rendering failed.");
  await expect(page.getByRole("link", { name: "Open alert" })).toHaveAttribute(
    "href",
    "/manage/modules/alerts/editor/alert-sub?diagnostic=ref-event-e2e"
  );

  await page.getByRole("tab", { name: /Raw logs/ }).click();
  await page.getByRole("button", { name: /ref-runtime-e2e/ }).click();
  await page.getByRole("button", { name: "Copy sanitized event" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("[REDACTED]");
  expect(copied).not.toContain("oauth-secret");

  await page.getByRole("tab", { name: /Events/ }).click();
  await page.getByRole("link", { name: "Open alert" }).click();
  await expect(page).toHaveURL(/\/modules\/alerts\/editor\/alert-sub\?diagnostic=ref-event-e2e$/);
});
