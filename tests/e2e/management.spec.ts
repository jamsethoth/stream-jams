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
