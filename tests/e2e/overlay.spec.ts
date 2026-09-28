import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { installOverlayWebSocketMock } from "./e2e-helpers.js";

test("module test overlay renders a test alert without displaying its route key", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await installOverlayWebSocketMock(page);
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
  await expect(page.locator("body")).toHaveClass(/overlay-shell/u);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("ovl_test");
  const shellState = await page.evaluate(() => ({
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    rootBackground: getComputedStyle(document.documentElement).backgroundColor,
    resources: performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname)
  }));
  expect(shellState.bodyBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.rootBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.resources).toContain("/src/overlay/OverlayApp.tsx");
  expect(shellState.resources).not.toContain("/src/App.tsx");
  expect(shellState.resources.some((path) => path.startsWith("/src/management/"))).toBe(false);
  expect(browserErrors).toEqual([]);
});

test("management test audio can be enabled after the browser blocks autoplay", async ({ page }) => {
  await installOverlayWebSocketMock(page);
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

for (const scenario of [
  { mode: "play", stage: "play", errorName: "NotSupportedError", errorMessage: "play denied" },
  { mode: "seek", stage: "seek", errorName: "InvalidStateError", errorMessage: "seek denied" }
] as const) {
  test(`timed video ${scenario.mode} failure stays transparent and reports structured provenance`, async ({ page }) => {
    await installOverlayWebSocketMock(page);
    await page.addInitScript(({ mode }) => {
      const state = window as Window & { __mediaPosition?: number };
      Object.defineProperties(HTMLMediaElement.prototype, {
        readyState: { configurable: true, get: () => 1 },
        seeking: { configurable: true, get: () => false },
        currentTime: {
          configurable: true,
          get: () => state.__mediaPosition ?? 0,
          set(value: number) {
            if (mode === "seek") throw new DOMException("seek denied", "InvalidStateError");
            state.__mediaPosition = value;
          }
        },
        play: {
          configurable: true,
          value() {
            return mode === "play"
              ? Promise.reject(new DOMException("play denied", "NotSupportedError"))
              : Promise.resolve();
          }
        },
        pause: { configurable: true, value() {} }
      });
    }, { mode: scenario.mode });
    await page.route("**/overlay/modules/alerts/live/ovl_failure/composition*", route => {
      const now = Date.now();
      return route.fulfill({ contentType: "application/json", json: {
        overlayId: "default",
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical",
        modules: [{ moduleId: "alerts", enabled: true, instructions: [{
          id: `video-${scenario.mode}`,
          overlayId: "default",
          moduleId: "alerts",
          purpose: "live",
          scope: "module",
          targetProfileId: "vertical",
          visual: {
            assetId: "failure-video",
            mediaType: "video",
            layout: { x: 0, y: 0, width: 1080, height: 1920, zIndex: 1 }
          },
          audio: null,
          text: null,
          tts: null,
          durationMs: 5_000,
          timing: { startsAtEpochMs: now - 1_000, endsAtEpochMs: now + 4_000 }
        }] }]
      } });
    });
    await page.route("**/assets/failure-video*", route => route.fulfill({ body: "", contentType: "video/webm" }));

    await page.goto("/overlay/modules/alerts/live/ovl_failure?profile=vertical");

    await expect.poll(async () => page.evaluate(() => {
      const messages = (window as Window & { __overlaySocketMessages?: unknown[] }).__overlaySocketMessages ?? [];
      return messages.find((message) => typeof message === "object" && message !== null
        && "type" in message && message.type === "overlay.playback.failed") ?? null;
    })).toMatchObject({
      instructionId: `video-${scenario.mode}`,
      referenceId: expect.stringMatching(/^err_/),
      stage: scenario.stage,
      exception: scenario.mode === "seek"
        ? expect.objectContaining({
            type: "TimedMediaPreparationError",
            cause: expect.objectContaining({ type: scenario.errorName, message: scenario.errorMessage })
          })
        : expect.objectContaining({ type: scenario.errorName, message: scenario.errorMessage })
    });
    await expect(page.getByTestId(`overlay-video-video-${scenario.mode}`)).toHaveCount(0);
    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toContain(scenario.errorMessage);
    expect(visibleText).not.toContain("err_");
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
