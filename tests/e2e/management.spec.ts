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

test("event source onboarding connects validates and registers Twitch", async ({ page }) => {
  let twitchStatusChecks = 0;
  let registered = false;
  const provider = {
    id: "provider-twitch-e2e",
    name: "Twitch",
    kind: "twitch",
    capability: "event-source",
    active: true,
    connectionState: "connected",
    intakeState: "active",
    validatedAt: "2026-07-16T12:00:00.000Z",
    error: null,
    usedByAlertCount: 0
  };
  const detail = {
    provider,
    configuration: {},
    availableVoices: [],
    ttsSafety: null
  };
  const validation = {
    valid: true,
    connectionState: "connected",
    intakeState: "inactive",
    validatedAt: "2026-07-16T12:00:00.000Z",
    availableVoices: [],
    error: null
  };

  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { id: "mgmt_provider_e2e", csrfToken: "csrf_provider_e2e" } });
  });
  await page.route("**/twitch/auth/status", async (route) => {
    twitchStatusChecks += 1;
    await route.fulfill({
      contentType: "application/json",
      json: twitchStatusChecks === 1
        ? { connected: false, account: null }
        : {
            connected: true,
            account: {
              accountId: "account-e2e",
              login: "jamsethoth",
              displayName: "Jamsethoth",
              scopes: ["user:read:chat"],
              connectedAt: "2026-07-16T12:00:00.000Z",
              updatedAt: "2026-07-16T12:00:00.000Z"
            }
          }
    });
  });
  await page.route("**/twitch/auth/start", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      redirectUri: "http://127.0.0.1:4173/twitch/auth/callback"
    });
    await route.fulfill({
      contentType: "application/json",
      json: {
        authorizationUrl: "https://id.twitch.tv/oauth2/authorize?state=e2e",
        state: "e2e",
        scopes: ["user:read:chat"]
      }
    });
  });
  await page.route(/^https?:\/\/[^/]+\/management\/providers(?:[/?].*)?$/u, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/management/providers" && request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", json: registered ? [provider] : [] });
      return;
    }
    if (url.pathname === "/management/providers/validate") {
      expect(request.postDataJSON()).toEqual({ name: "Twitch", kind: "twitch", configuration: {} });
      await route.fulfill({ contentType: "application/json", json: validation });
      return;
    }
    if (url.pathname === "/management/providers" && request.method() === "POST") {
      registered = true;
      await route.fulfill({ contentType: "application/json", json: { status: "registered", provider: detail, validation } });
      return;
    }
    if (url.pathname === `/management/providers/${provider.id}`) {
      await route.fulfill({ contentType: "application/json", json: detail });
      return;
    }
    await route.abort("failed");
  });

  await page.goto("/manage/event-sources");
  await page.getByRole("button", { name: "Add event source" }).click();
  await expect(page.getByRole("dialog", { name: "Add event source" })).toContainText("Step 1 of 3");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Configure Twitch" })).toBeVisible();
  await expect(page.getByText("No Twitch account connected")).toBeVisible();

  await page.getByRole("button", { name: "Connect Twitch" }).click();
  await expect(page.getByRole("link", { name: "Continue in Twitch" })).toHaveAttribute(
    "href",
    "https://id.twitch.tv/oauth2/authorize?state=e2e"
  );
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("heading", { name: "Review event source" })).toBeVisible();
  await expect(page.getByText("Jamsethoth (@jamsethoth)")).toBeVisible();

  await page.getByRole("button", { name: "Register event source" }).click();
  await expect(page.getByText("Twitch registered and active.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Twitch/ })).toContainText("Active");
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
