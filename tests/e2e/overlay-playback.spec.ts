import { expect, test } from "@playwright/test";
import { emptyComposition, installOverlayWebSocketMock, sendOverlayPlayback, textInstruction } from "./e2e-helpers.js";

test("live module overlay renders a synthetic follow playback event", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/alerts/live/ovl_live/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "live",
        scope: "module",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: [
              textInstruction({
                id: "live-overlay-ready",
                purpose: "live",
                scope: "module",
                text: "Live overlay ready"
              })
            ]
          }
        ]
      })
    });
  });

  await page.goto("/overlay/modules/alerts/live/ovl_live");
  await expect(page.getByText("Live overlay ready")).toBeVisible();
  await sendOverlayPlayback(page, textInstruction({
    id: "live-follow",
    purpose: "live",
    scope: "module",
    text: "Live follow from Viewer"
  }));

  await expect(page.getByText("Live follow from Viewer")).toBeVisible();
});

test("unified overlay renders enabled modules and excludes disabled modules", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/unified/live/ovl_unified/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: emptyComposition({
        purpose: "live",
        scope: "unified",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: [
              textInstruction({
                id: "initial-unified-alert",
                purpose: "live",
                scope: "unified",
                text: "Unified alert ready"
              })
            ]
          },
          {
            moduleId: "goals",
            enabled: false,
            instructions: [
              textInstruction({
                id: "disabled-goal-alert",
                moduleId: "goals",
                purpose: "live",
                scope: "unified",
                text: "Disabled goal should not render"
              })
            ]
          }
        ]
      })
    });
  });

  await page.goto("/overlay/unified/live/ovl_unified");

  await expect(page.getByText("Unified alert ready")).toBeVisible();
  await expect(page.getByText("Disabled goal should not render")).toHaveCount(0);

  await sendOverlayPlayback(page, textInstruction({
    id: "unified-live-event",
    purpose: "live",
    scope: "unified",
    text: "Unified synthetic event"
  }));

  await expect(page.getByText("Unified synthetic event")).toBeVisible();
});
