import { expect, test, type Page } from "@playwright/test";
import { installOverlayWebSocketMock } from "./e2e-helpers.js";

const clipSource = { provider: "twitch-clip", clipSlug: "ClipOne" } as const;
const layout = { x: 269, y: 140, width: 1382, height: 876 } as const;

function composition(videos: unknown) {
  return {
    overlayId: "default",
    purpose: "live",
    scope: "module",
    modules: [{ moduleId: "videos", enabled: true, instructions: [], presentation: { kind: "videos", videos } }]
  };
}

function active(itemId: string, source: unknown, overrides: Record<string, unknown> = {}) {
  return {
    status: "active", itemId, title: "The big play", requester: "Friendly Streamer", layout,
    delivery: { mode: "player", source, clock: { state: "playing", positionMs: 0, atEpochMs: Date.now() }, obsAudio: true },
    ...overrides
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

test("plays a queued Twitch clip on the Videos browser source, shows a notice, and returns to idle", async ({ page }) => {
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
  await page.route("**/overlay/modules/videos/live/ovl_videos/composition", route =>
    route.fulfill({ contentType: "application/json", json: composition({ status: "idle" }) }));

  await page.goto("/overlay/modules/videos/live/ovl_videos");
  await expect(page.getByTestId("overlay-root")).toBeVisible();
  await expect(page.getByTestId("video-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  await pushComposition(page, composition(active("one", clipSource)));
  const player = page.getByTitle("Video player");
  await expect(player).toHaveAttribute("src", /^https:\/\/clips\.twitch\.tv\/embed\?clip=ClipOne&parent=127\.0\.0\.1&autoplay=true&muted=false$/u);
  await expect(page.frameLocator("iframe[title='Video player']").getByText("clip player")).toBeVisible();
  await expect(page.getByText("The big play")).toBeVisible();
  await expect(page.getByText("Requested by Friendly Streamer")).toBeVisible();
  await expect.poll(() => socketMessages(page)).toContainEqual({ type: "overlay.playback.started", instructionId: "video:one" });
  expect(twitchRequests).toHaveLength(1);
  expect(await page.locator("body").innerText()).not.toContain("ovl_videos");

  await pushComposition(page, composition({ status: "notice", noticeId: "notice-1", notice: "no-clip", displayName: "Quiet Friend", layout }));
  await expect(page.getByRole("status")).toHaveText("Quiet FriendNo clip to show right now");
  await expect(page.locator("iframe")).toHaveCount(0);

  await pushComposition(page, composition({ status: "idle" }));
  await expect(page.getByTestId("video-overlay")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("refuses a source outside the allowlist on the live browser source", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/videos/live/ovl_videos/composition", route =>
    route.fulfill({ contentType: "application/json", json: composition({ status: "idle" }) }));
  const outbound: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1")) outbound.push(request.url()); });

  await page.goto("/overlay/modules/videos/live/ovl_videos");
  await expect(page.getByTestId("overlay-root")).toBeVisible();
  await pushComposition(page, composition(active("bad", { provider: "direct", url: "http://evil.example/video.mp4" })));
  await pushComposition(page, composition(active("bad-2", { provider: "youtube", videoId: "../../evil", startAtMs: 0 })));
  await page.waitForTimeout(250);
  await expect(page.locator("iframe, video")).toHaveCount(0);
  await expect(page.getByTestId("video-overlay")).toHaveCount(0);
  expect(outbound.filter(url => url.includes("evil"))).toEqual([]);
});

test("refuses a video box that leaves the canvas", async ({ page }) => {
  await page.route("https://clips.twitch.tv/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Clip</title>" }));
  await installOverlayWebSocketMock(page);
  await page.route("**/overlay/modules/videos/live/ovl_videos/composition", route =>
    route.fulfill({ contentType: "application/json", json: composition({ status: "idle" }) }));
  await page.goto("/overlay/modules/videos/live/ovl_videos");
  await expect(page.getByTestId("overlay-root")).toBeVisible();
  await pushComposition(page, composition(active("off-canvas", clipSource, { layout: { x: 1700, y: 0, width: 480, height: 320 } })));
  await expect.poll(() => socketMessages(page)).toContainEqual(expect.objectContaining({ type: "overlay.playback.failed", instructionId: "video:off-canvas" }));
  await expect(page.locator("iframe, video")).toHaveCount(0);
  await expect(page.getByTestId("video-overlay")).toHaveCount(0);
});
