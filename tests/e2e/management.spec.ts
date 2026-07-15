import { expect, test } from "@playwright/test";

test("management navigation shows copyable overlay URLs", async ({ page }) => {
  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_e2e" }
    });
  });
  await page.route("**/playback", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        current: null,
        queued: [],
        recent: [],
        paused: false,
        muted: false,
        doNotDisturb: false
      }
    });
  });
  await page.route("**/management/overlay-clients", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: []
    });
  });
  await page.route("**/management/overlay-outputs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: [
        {
          id: "alerts-test",
          overlayId: "default",
          label: "Alerts test",
          purpose: "test",
          scope: "module",
          moduleId: "alerts",
          enabled: true,
          keyId: "key-alerts-test",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test",
          copyableUrlStatus: "available"
        }
      ]
    });
  });

  await page.goto("/manage");

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await page.getByRole("link", { name: "Overlay outputs" }).click();

  await expect(page.getByRole("heading", { name: "Alerts test" })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Alerts test" })).toBeVisible();
});

test("management copies a recovered overlay URL after output state reloads", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_e2e" }
    });
  });
  await page.route("**/playback", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        current: null,
        queued: [],
        recent: [],
        paused: false,
        muted: false,
        doNotDisturb: false
      }
    });
  });
  await page.route("**/management/overlay-clients", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: []
    });
  });

  let storedUrl: string | null = null;
  await page.route("**/management/overlay-outputs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: [
        {
          id: "module:alerts:live",
          overlayId: "default",
          label: "Alerts Live",
          purpose: "live",
          scope: "module",
          moduleId: "alerts",
          enabled: true,
          keyId: storedUrl === null ? null : "key-alerts-live",
          url: storedUrl,
          copyableUrlStatus: storedUrl === null ? "create-required" : "available"
        }
      ]
    });
  });
  await page.route("**/management/overlay-outputs/keys", async (route) => {
    storedUrl = "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_recovered";
    await route.fulfill({
      contentType: "application/json",
      json: {
        keyId: "key-alerts-live",
        url: storedUrl,
        output: {
          id: "module:alerts:live",
          overlayId: "default",
          label: "Alerts Live",
          purpose: "live",
          scope: "module",
          moduleId: "alerts",
          enabled: true,
          keyId: "key-alerts-live",
          url: storedUrl,
          copyableUrlStatus: "available"
        }
      }
    });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Overlay outputs" }).click();
  await page.getByRole("button", { name: "Create URL" }).click();
  await expect(page.getByText("http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_recovered")).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: "Overlay outputs" }).click();
  await page.getByRole("button", { name: "Copy Alerts Live" }).click();

  await expect(page.getByText("Alerts Live copied.")).toBeVisible();
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe(
    "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_recovered"
  );
});

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
