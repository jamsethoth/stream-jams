import { expect, test } from "@playwright/test";
import { emptyComposition, installOverlayWebSocketMock, sendOverlayPlayback, textInstruction } from "./e2e-helpers.js";

test("test overlay ignores live provider playback events", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/alerts/test/ovl_test/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "test",
        scope: "module",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: []
          }
        ]
      })
    });
  });

  await page.goto("/overlay/modules/alerts/test/ovl_test");
  await sendOverlayPlayback(page, textInstruction({
    id: "live-event-for-test-overlay",
    purpose: "live",
    scope: "module",
    text: "Live event should stay out"
  }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

  expect(await page.locator("body").innerText()).not.toContain("Live event should stay out");
});

test("revoked overlay keys cannot load a composition or leak the route key", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/alerts/live/revoked_key/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: {
          code: "OVERLAY_ROUTE_KEY_REVOKED",
          message: "Overlay route key is not authorized for this output"
        }
      },
      status: 403
    });
  });

  await page.goto("/overlay/modules/alerts/live/revoked_key");

  const overlayRoot = page.getByTestId("overlay-root");
  await expect(overlayRoot).toBeAttached();
  await expect(overlayRoot).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".overlay-error")).toHaveCount(0);
  expect(await overlayRoot.locator(":scope > *").count()).toBe(0);
  await expect(overlayRoot).toHaveText("");
  expect(await page.locator("body").innerText()).not.toContain("revoked_key");
  await expect(page.getByText("Live alert rendered")).toHaveCount(0);
});
