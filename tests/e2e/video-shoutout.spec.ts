import { expect, test, type Page } from "@playwright/test";
import { installOverlayWebSocketMock } from "./e2e-helpers.js";

const clip = {
  login: "friendly_streamer",
  displayName: "Friendly Streamer",
  clipId: "ClipOne",
  embedUrl: "https://clips.twitch.tv/embed?clip=ClipOne&parent=127.0.0.1",
  title: "The big play",
  durationMs: 20_000,
  avatarUrl: null
};

function composition(shoutout: unknown) {
  return {
    overlayId: "default",
    purpose: "live",
    scope: "module",
    modules: [{ moduleId: "video-shoutout", enabled: true, instructions: [], presentation: { kind: "video-shoutout", shoutout } }]
  };
}

async function pushComposition(page: Page, next: unknown): Promise<void> {
  await page.evaluate((candidate) => {
    const sockets = (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets ?? [];
    const socket = sockets.at(-1);
    if (socket === undefined) throw new Error("Overlay WebSocket mock was not created");
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "overlay.composition", composition: candidate }) }));
  }, next);
}

async function socketMessages(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as Window & { __overlaySocketMessages?: unknown[] }).__overlaySocketMessages ?? []);
}

test("renders a Streamer.bot clip on the video shoutout browser source and returns to idle", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const twitchRequests: string[] = [];
  // Deterministic stand-in for the Twitch player; the test never reaches Twitch.
  await page.route("https://clips.twitch.tv/**", async (route) => {
    twitchRequests.push(route.request().url());
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Clip</title><p>clip player</p>" });
  });
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/video-shoutout/live/ovl_shoutout/composition", route =>
    route.fulfill({ contentType: "application/json", json: composition({ status: "idle" }) }));

  await page.goto("/overlay/modules/video-shoutout/live/ovl_shoutout");
  await expect(page.getByTestId("overlay-root")).toBeVisible();
  await expect(page.getByTestId("video-shoutout")).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  await pushComposition(page, composition({ status: "loading", activationId: "video-shoutout:one", clip }));
  const player = page.getByTitle("Twitch clip: The big play");
  await expect(player).toHaveAttribute("src", clip.embedUrl);
  await expect(page.getByTestId("video-shoutout")).toHaveAttribute("data-state", "playing");
  await expect(page.frameLocator("iframe[title='Twitch clip: The big play']").getByText("clip player")).toBeVisible();
  await expect(page.getByText("Friendly Streamer")).toBeVisible();
  await expect(page.getByText("The big play")).toBeVisible();
  await expect.poll(() => socketMessages(page)).toContainEqual({ type: "overlay.playback.started", instructionId: "video-shoutout:one" });
  expect(twitchRequests).toEqual([clip.embedUrl]);
  expect(await page.locator("body").innerText()).not.toContain("ovl_shoutout");

  await pushComposition(page, composition({ status: "error", activationId: "video-shoutout:two", reason: "no-clip", displayName: "Quiet Friend" }));
  await expect(page.getByRole("status")).toHaveText("Quiet FriendNo clip to show right now");
  await expect(page.locator("iframe")).toHaveCount(0);

  await pushComposition(page, composition({ status: "idle" }));
  await expect(page.getByTestId("video-shoutout")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("refuses an unsafe embed URL on the live browser source", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/video-shoutout/live/ovl_shoutout/composition", route =>
    route.fulfill({ contentType: "application/json", json: composition({ status: "idle" }) }));
  const outbound: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1")) outbound.push(request.url()); });

  await page.goto("/overlay/modules/video-shoutout/live/ovl_shoutout");
  await expect(page.getByTestId("overlay-root")).toBeVisible();
  await pushComposition(page, composition({ status: "loading", activationId: "video-shoutout:bad",
    clip: { ...clip, embedUrl: "https://evil.example/embed?clip=ClipOne&parent=127.0.0.1" } }));
  await page.waitForTimeout(250);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByTestId("video-shoutout")).toHaveCount(0);
  expect(outbound.filter(url => url.includes("evil.example"))).toEqual([]);
});
