import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

test("module test overlay renders a test alert without displaying its route key", async ({ page }) => {
  await installOverlaySocketMock(page);
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

test("management test audio can be enabled after the browser blocks autoplay", async ({ page }) => {
  await installOverlaySocketMock(page);
  await page.addInitScript(() => {
    const state = window as Window & {
      __audioActivationClick?: boolean;
      __audioPlayAttempts?: number;
      __audioPlaySucceeded?: boolean;
    };
    window.addEventListener("pointerdown", () => {
      state.__audioActivationClick = true;
    }, { capture: true });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        state.__audioPlayAttempts = (state.__audioPlayAttempts ?? 0) + 1;
        if (state.__audioActivationClick === true) {
          state.__audioPlaySucceeded = true;
          return Promise.resolve();
        }
        return Promise.reject(new DOMException("Playback requires user interaction", "NotAllowedError"));
      }
    });
  });
  await page.route("**/overlay/modules/alerts/live/ovl_audio/composition*", (route) => route.fulfill({
    contentType: "application/json",
    json: {
      overlayId: "default",
      purpose: "live",
      scope: "module",
      targetProfileId: "landscape",
      modules: [{
        moduleId: "alerts",
        enabled: true,
        instructions: [{
          id: "test-audio",
          overlayId: "default",
          moduleId: "alerts",
          operatorTest: true,
          purpose: "live",
          scope: "module",
          targetProfileId: "landscape",
          visual: null,
          audio: { assetId: "asset-audio", volume: 0.5 },
          text: null,
          tts: null,
          durationMs: 4_000
        }]
      }]
    }
  }));
  await page.route("**/overlay/modules/alerts/live/ovl_audio/assets/asset-audio*", (route) => route.fulfill({
    body: silentWav(),
    contentType: "audio/wav"
  }));

  await page.goto("/overlay/modules/alerts/live/ovl_audio?profile=landscape");

  const enableAudio = page.getByRole("button", { name: "Enable alert audio" });
  await expect(enableAudio).toBeVisible();
  await enableAudio.click();
  await expect(enableAudio).toHaveCount(0);
  const audioState = await page.evaluate(() => {
    const state = window as Window & { __audioPlayAttempts?: number; __audioPlaySucceeded?: boolean };
    return { attempts: state.__audioPlayAttempts ?? 0, succeeded: state.__audioPlaySucceeded === true };
  });
  expect(audioState.attempts).toBeGreaterThan(1);
  expect(audioState.succeeded).toBe(true);
});

async function installOverlaySocketMock(page: Page): Promise<void> {
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
}

function silentWav(): Buffer {
  const sampleCount = 8_000;
  const wav = Buffer.alloc(44 + sampleCount, 128);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24);
  wav.writeUInt32LE(8_000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount, 40);
  return wav;
}
