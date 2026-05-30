import { expect, test } from "@playwright/test";

test("module test overlay renders a test alert without displaying its route key", async ({ page }) => {
  await page.addInitScript(() => {
    class OverlayTestWebSocket extends EventTarget {
      readonly readyState = 1;

      constructor(readonly url: string) {
        super();
        setTimeout(() => this.dispatchEvent(new Event("open")), 0);
      }

      send(message: string) {
        const windowWithReports = window as Window & { __overlaySocketMessages?: unknown[] };
        windowWithReports.__overlaySocketMessages ??= [];
        windowWithReports.__overlaySocketMessages.push(JSON.parse(message) as unknown);
      }

      close() {
        this.dispatchEvent(new CloseEvent("close"));
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: OverlayTestWebSocket
    });
  });
  await page.route("**/overlay/modules/alerts/test/ovl_test/composition", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        overlayId: "default",
        purpose: "test",
        scope: "module",
        modules: [
          {
            moduleId: "alerts",
            enabled: true,
            instructions: [
              {
                id: "test-alert",
                overlayId: "default",
                moduleId: "alerts",
                purpose: "test",
                scope: "module",
                visual: null,
                audio: null,
                text: {
                  text: "Test alert rendered",
                  layout: {
                    x: 40,
                    y: 32,
                    width: 420,
                    height: 96,
                    zIndex: 10
                  }
                },
                tts: null,
                durationMs: 4000
              }
            ]
          }
        ]
      }
    });
  });

  await page.goto("/overlay/modules/alerts/test/ovl_test");

  await expect(page.getByText("Test alert rendered")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("ovl_test");
});
