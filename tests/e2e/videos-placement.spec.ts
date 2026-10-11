import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

// Videos placement against a real local runtime: the operator places the box on the management page,
// saves, and the live browser source moves the playing video there. Providers are stubbed locally.
test.use({ trace: "off", screenshot: "off", video: "off" });

type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
type Layout = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
let fixture: Fixture;

const youTubeStub = `<!doctype html><title>YouTube stub</title><p>stub player</p>
<script>
  addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.event === "command" && message.func === "playVideo") parent.postMessage(JSON.stringify({ event: "infoDelivery", info: { playerState: 1, currentTime: 0 } }), "*");
  });
</script>`;

test.beforeEach(async () => {
  fixture = await createProviderSecurityRuntimeFixture();
  await fixture.start();
  expect((await fixture.request("/health")).status).toBe(200);
});

test.afterEach(async () => {
  await fixture.close();
});

test("the operator places the video box, saves it, and the live browser source moves the playing video there", async ({ context, page }) => {
  test.setTimeout(60_000);
  const outbound = await stubProviders(context);
  const overlay = await openBrowserSource(context);

  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const placement = page.getByRole("region", { name: "Video placement" });
  await expect(placement.getByLabel("Video X (px)")).toHaveValue("269");
  await expect(placement.getByLabel("Video width (px)")).toHaveValue("1382");

  // Exact values from the fields, then the keyboard.
  for (const [label, value] of [["Video width (px)", "640"], ["Video height (px)", "460"], ["Video X (px)", "1240"], ["Video Y (px)", "40"]] as const) {
    await placement.getByLabel(label).fill(value);
    await placement.getByLabel(label).press("Enter");
  }
  await placement.getByRole("button", { name: "Move video box" }).focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(placement.getByLabel("Video X (px)")).toHaveValue("1230");

  // A pointer drag near the right edge snaps flush to it and shows the guide only during the drag.
  const canvas = placement.getByRole("group", { name: "Video placement canvas" });
  await canvas.scrollIntoViewIfNeeded();
  const canvasBox = (await canvas.boundingBox())!;
  const scale = canvasBox.width / 1920;
  const handle = (await placement.getByRole("button", { name: "Move video box" }).boundingBox())!;
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 48 * scale, start.y, { steps: 4 });
  await expect(placement.locator("[data-snap-axis='x'][data-snap-position='1920']")).toHaveCount(1);
  await page.mouse.up();
  await expect(placement.locator("[data-snap-axis]")).toHaveCount(0);
  await expect(placement.getByLabel("Video X (px)")).toHaveValue("1280");
  await expect(page.getByTestId("video-placement-preview")).toHaveCSS("left", "1280px");

  await page.getByRole("button", { name: "Save Videos settings" }).click();
  await expect(page.getByText("Videos settings saved. They apply to later requests and runs.")).toBeVisible();
  expect(await savedLayout()).toEqual({ x: 1280, y: 40, width: 640, height: 460 });

  // Play a request: the browser source shows it in the saved box with a 16:9 picture.
  const queue = page.getByRole("region", { name: "Video queue" });
  const form = queue.getByRole("form", { name: "Add video" });
  await form.getByRole("textbox", { name: "Video link" }).fill("https://youtu.be/e2ePlacemnt");
  await form.getByRole("textbox", { name: "Title (optional)" }).fill("Placed clip");
  await form.getByRole("button", { name: "Add video" }).click();
  await queue.getByRole("button", { name: "Play next" }).click();
  await expect(overlay.frameLocator("iframe[title='Video player']").getByText("stub player")).toBeVisible();
  await expect(overlay.getByText("Placed clip")).toBeVisible();
  await expectBox(overlay, { x: 1280, y: 40, width: 640, height: 460 });
  const frame = (await overlay.locator(".video-overlay__frame").boundingBox())!;
  expect(frame.width).toBeCloseTo(640, 0);
  expect(frame.height).toBeCloseTo(360, 0);
  expect(frame.y + frame.height).toBeLessThanOrEqual(500);

  // Resetting and saving moves the running output back without a reload.
  await placement.getByRole("button", { name: "Reset to default placement" }).click();
  await page.getByRole("button", { name: "Save Videos settings" }).click();
  await expectBox(overlay, { x: 269, y: 140, width: 1382, height: 876 });
  expect(outbound()).toEqual([]);
});

test("the server refuses an off-canvas box and keeps the saved placement", async () => {
  const before = await fixture.request("/overlay-modules/videos/config");
  const { config } = await before.json() as { config: Record<string, unknown> };
  const refused = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled: true, config: { ...config, layout: { x: 1700, y: 0, width: 480, height: 320 } } });
  expect(refused.status).toBe(400);
  expect(await savedLayout()).toEqual({ x: 269, y: 140, width: 1382, height: 876 });
});

async function savedLayout(): Promise<Layout> {
  const response = await fixture.request("/overlay-modules/videos/config");
  expect(response.status).toBe(200);
  return (await response.json() as { config: { layout: Layout } }).config.layout;
}

async function expectBox(overlay: Page, expected: Layout): Promise<void> {
  await expect.poll(async () => {
    const box = await overlay.getByTestId("video-overlay").boundingBox();
    return box === null ? null : { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  }).toEqual(expected);
}

async function openBrowserSource(context: BrowserContext): Promise<Page> {
  const output = await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", scope: "module", moduleId: "videos", purpose: "live", targetProfileId: null });
  expect(output.status).toBe(200);
  const { url } = await output.json() as { url: string };
  const overlay = await context.newPage();
  // The size OBS is told to use for the Videos Browser Source.
  await overlay.setViewportSize({ width: 1920, height: 1080 });
  await overlay.goto(url);
  await expect(overlay.getByTestId("overlay-root")).toBeVisible();
  return overlay;
}

/** Answers the YouTube player locally and records anything else that tried to leave the machine. */
async function stubProviders(context: BrowserContext): Promise<() => readonly string[]> {
  const unexpected: string[] = [];
  await context.route(url => url.protocol !== "http:" || url.hostname !== "127.0.0.1", async route => {
    const url = new URL(route.request().url());
    if (url.origin === "https://www.youtube-nocookie.com" && url.pathname.startsWith("/embed/")) return route.fulfill({ contentType: "text/html", body: youTubeStub });
    unexpected.push(url.origin);
    return route.abort("blockedbyclient");
  });
  return () => unexpected;
}
