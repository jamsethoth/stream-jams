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
          label: "Alerts test",
          purpose: "test",
          scope: "module",
          moduleId: "alerts",
          url: "http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test"
        }
      ]
    });
  });

  await page.goto("/manage");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("tab", { name: "Overlays" }).click();

  await expect(page.getByRole("heading", { name: "Alerts test" })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Alerts test" })).toBeVisible();
});

test("management diagnostics include backend error code and id", async ({ page }) => {
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
