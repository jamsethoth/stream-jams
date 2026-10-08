import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Frame, type Page } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

// Videos queue acceptance against a real local runtime. Providers are stubbed: every
// non-loopback request is answered locally, so no test reaches YouTube, Twitch or a file host.
test.use({ trace: "off", screenshot: "off", video: "off" });

type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
type QueueItem = { readonly id: string; readonly status: string; readonly holdReason: string | null; readonly title: string | null; readonly submittedVia: string; readonly autoplay: boolean };
type Queue = { readonly revision: number; readonly queuePaused: boolean; readonly runRemaining: number; readonly items: readonly QueueItem[];
  readonly current: { readonly itemId: string; readonly phase: string; readonly positionMs: number } | null; readonly mirror: { readonly available: boolean } };

const directHost = "videos.example.com";
// VP9 so it decodes in the bundled Chromium, which has no H.264.
const tinyVideo = readFile(resolve("tests/fixtures/media/neutral-trackless.webm"));

// A stand-in for the YouTube iframe player that speaks the enablejsapi postMessage protocol:
// it answers playVideo/pauseVideo/seekTo with infoDelivery messages and shows the last command.
const youTubeStub = `<!doctype html><title>YouTube stub</title>
<p id="video"></p><p id="state">waiting</p><p id="seek">no seek</p>
<script>
  let time = 0;
  document.getElementById("video").textContent = "video " + location.pathname.split("/").at(-1);
  const post = info => parent.postMessage(JSON.stringify({ event: "infoDelivery", info }), "*");
  const show = (id, text) => { document.getElementById(id).textContent = text; };
  addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.event !== "command") return;
    if (message.func === "playVideo") { show("state", "state playing"); post({ playerState: 1, currentTime: time }); }
    if (message.func === "pauseVideo") { show("state", "state paused"); post({ playerState: 2, currentTime: time }); }
    if (message.func === "seekTo") { time = Number(message.args[0]); show("seek", "seek " + Math.round(time)); post({ currentTime: time }); }
  });
  window.endStubVideo = () => post({ playerState: 0, currentTime: time });
</script>`;

let fixture: Fixture;

test.beforeEach(async () => {
  fixture = await createProviderSecurityRuntimeFixture();
  await fixture.start();
  expect((await fixture.request("/health")).status).toBe(200);
});

test.afterEach(async () => {
  await fixture.close();
});

test("management submit queues a safe link as held and rejects unsafe, unknown and disallowed links with a visible reason", async ({ context, page }) => {
  const outbound = await stubProviders(context);
  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const queue = page.getByRole("region", { name: "Video queue" });
  await expect(queue.getByRole("heading", { name: "Waiting (0)" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Mirroring unavailable: desktop app not running");

  const form = queue.getByRole("form", { name: "Add video" });
  const link = form.getByRole("textbox", { name: "Video link" });
  const add = form.getByRole("button", { name: "Add video" });

  await add.click();
  await expect(form.getByText("Paste a Twitch, YouTube or direct video link.")).toBeVisible();

  const unsafe = "Links must use HTTPS with no login, port or # fragment.";
  const notAllowed = "That site is not allowed. Add direct-file hosts in Videos settings.";
  const unrecognized = "That link is not a recognizable Twitch, YouTube or direct video link.";
  const rejectedLinks: readonly (readonly [string, string])[] = [
    ["http://www.youtube.com/watch?v=e2eRejectA1", unsafe],
    ["https://viewer:secret@www.youtube.com/watch?v=e2eRejectA2", unsafe],
    ["https://www.youtube.com:8443/watch?v=e2eRejectA3", unsafe],
    ["https://www.youtube.com/watch?v=e2eRejectA4#t=5", unsafe],
    ["javascript:alert(1)", unsafe],
    [`https://${directHost}/not-allowed-yet.mp4`, notAllowed],
    ["https://evil.example/watch?v=e2eRejectA5", notAllowed],
    ["https://www.youtube.com/watch?list=e2eNoVideoId", unrecognized],
    ["not a link", unrecognized]
  ];
  for (const [value, message] of rejectedLinks) {
    await link.fill(value);
    await add.click();
    await expect(form.getByText(message, { exact: true })).toBeVisible();
    // The rejected link stays for correction; nothing reaches the queue.
    await expect(link).toHaveValue(value);
  }
  await expect(queue.getByRole("heading", { name: "Waiting (0)" })).toBeVisible();
  expect((await readQueue()).items).toEqual([]);

  // A disabled module rejects even a safe link.
  await page.getByRole("button", { name: "Disable Videos module" }).click();
  await expect(page.getByText("Module disabled", { exact: true })).toBeVisible();
  await link.fill("https://youtu.be/e2eDisable1");
  await add.click();
  await expect(form.getByText("The Videos module is turned off. Turn it on in Videos settings.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enable Videos module" }).click();
  await expect(page.getByText("Module enabled", { exact: true })).toBeVisible();

  // A safe YouTube link without a length is queued but held until Play anyway.
  await link.fill("https://www.youtube.com/watch?v=e2eSubmitA1&t=5");
  await form.getByRole("textbox", { name: "Title (optional)" }).fill("Management pick");
  await add.click();
  await expect(queue.getByRole("status").filter({ hasText: "Video added and held: its length is unknown." })).toBeVisible();
  await expect(link).toHaveValue("");
  await expect(queue.getByRole("heading", { name: "Waiting (1)" })).toBeVisible();
  const held = queue.getByRole("article", { name: "Management pick" });
  await expect(held).toContainText("Held");
  await expect(held).toContainText("Length unknown");
  await expect(held).toContainText("YouTube · Length unknown · via management");
  await expect(queue.getByRole("button", { name: "Play anyway: Management pick" })).toBeEnabled();
  // Held items are not playable without Play anyway.
  await expect(queue.getByRole("button", { name: "Play next" })).toBeDisabled();
  await expect(queue.getByRole("button", { name: "Play all now" })).toBeDisabled();

  const state = await readQueue();
  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({ status: "held", holdReason: "unknown-length", title: "Management pick", submittedVia: "management" });
  // Rejections are logged by reason and field only, never with the submitted link.
  const logs = await fixture.readLogs();
  for (const [value] of rejectedLinks) expect(logs).not.toContain(value);
  expect(logs).not.toContain("secret@");
  expect(outbound()).toEqual([]);
});

test("an over-limit automation request waits held, plays through Play anyway, and pause and seek reach the browser source", async ({ context, page, request }) => {
  test.setTimeout(60_000);
  await stubProviders(context);
  const submitOnly = await pairAutomation(request, ["videos:read", "videos:submit"]);
  const accepted = await request.post(`${fixture.runtime.url}/automation/v1/videos/live/requests`, { headers: submitOnly,
    data: { link: "https://youtu.be/e2eOverLimt", title: "Long request", requester: "Patient Viewer", durationSeconds: 600, autoplay: true } });
  expect(accepted.status()).toBe(201);
  const { item } = await accepted.json() as { item: QueueItem };
  // Over the default 120 s limit: held, and autoplay is ignored without videos:control.
  expect(item).toMatchObject({ status: "held", holdReason: "over-limit", autoplay: false, submittedVia: "automation" });
  // Submit-only installations cannot control the queue.
  const denied = await request.post(`${fixture.runtime.url}/automation/v1/videos/live/commands`, { headers: submitOnly,
    data: { expectedRevision: (await readQueue()).revision, command: { kind: "play-anyway", itemId: item.id } } });
  expect(denied.status()).toBe(403);
  // A browser Origin is refused even with a valid token.
  const browserOrigin = await request.post(`${fixture.runtime.url}/automation/v1/videos/live/requests`, { headers: { ...submitOnly, origin: fixture.runtime.url },
    data: { link: "https://youtu.be/e2eOriginA1" } });
  expect(browserOrigin.status()).toBe(403);

  const overlay = await openBrowserSource(context);
  await expect(overlay.getByTestId("overlay-root")).toBeVisible();
  await expect(overlay.getByTestId("video-overlay")).toHaveCount(0);

  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const queue = page.getByRole("region", { name: "Video queue" });
  const held = queue.getByRole("article", { name: "Long request" });
  await expect(held).toContainText("Over the length limit");
  await expect(held).toContainText("Requested by Patient Viewer · YouTube · 10:00 · via automation");
  await expect(queue.getByRole("button", { name: "Play next" })).toBeDisabled();

  await queue.getByRole("button", { name: "Play anyway: Long request" }).click();
  await expect(queue.getByRole("status").filter({ hasText: "Playing Long request despite the hold." })).toBeVisible();
  const player = overlay.getByTitle("Video player");
  await expect(player).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/e2eOverLimt\?enablejsapi=1&/u);
  const stub = overlay.frameLocator("iframe[title='Video player']");
  await expect(stub.getByText("video e2eOverLimt")).toBeVisible();
  await expect(overlay.getByText("Long request")).toBeVisible();
  await expect(overlay.getByText("Requested by Patient Viewer")).toBeVisible();

  const nowPlaying = queue.getByRole("article", { name: "Now playing" });
  // The stub player reports playing; the server leaves loading and the UI enables pause.
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect(nowPlaying).toContainText("Long request");
  await expect(nowPlaying).toContainText("/ 10:00");
  await expect(queue.getByRole("heading", { name: "Waiting (0)" })).toBeVisible();
  await expect(stub.getByText("state playing")).toBeVisible();

  await nowPlaying.getByRole("button", { name: "Pause video" }).click();
  await expect(nowPlaying.getByText("Paused", { exact: true })).toBeVisible();
  await expect(nowPlaying.getByRole("button", { name: "Resume video" })).toBeVisible();
  await expect(stub.getByText("state paused")).toBeVisible();
  expect((await readQueue()).current).toMatchObject({ itemId: item.id, phase: "paused" });

  // Seek to the end with the keyboard: the server clamps to one second before the end.
  const seek = nowPlaying.getByRole("slider", { name: "Seek" });
  await seek.focus();
  await seek.press("End");
  await expect(queue.getByRole("status").filter({ hasText: "Moved to 10:00." })).toBeVisible();
  await expect(nowPlaying.getByLabel("Playback position")).toHaveText("9:59 / 10:00");
  await expect(seek).toHaveAttribute("aria-valuetext", "9:59 of 10:00");
  await expect(stub.getByText("seek 599")).toBeVisible();
  // Still paused after the seek.
  await expect(stub.getByText("state paused")).toBeVisible();
  expect((await readQueue()).current).toMatchObject({ phase: "paused", positionMs: 599_000 });

  // A control aimed at another item is refused and changes nothing.
  const mismatch = await fixture.request("/videos/live/current/resume", "POST", { expectedItemId: "video:not-current" });
  expect(mismatch.status).toBe(409);
  // A seek without a position is invalid input.
  expect((await fixture.request("/videos/live/current/seek", "POST", { expectedItemId: item.id })).status).toBe(400);
  expect((await readQueue()).current?.phase).toBe("paused");

  await nowPlaying.getByRole("button", { name: "Resume video" }).click();
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect(stub.getByText("state playing")).toBeVisible();

  await nowPlaying.getByRole("button", { name: "Stop" }).click();
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await expect(overlay.getByTestId("video-overlay")).toHaveCount(0);
  // Finished items leave the queue response.
  expect((await readQueue()).items.map(candidate => candidate.id)).not.toContain(item.id);
  expect(await overlay.locator("body").innerText()).not.toMatch(/ovl_|key=/u);
});

test("Play all now plays only the snapshot, Pause queue holds the run, and a direct file plays from an allowed host", async ({ context, page, request }) => {
  test.setTimeout(60_000);
  const outbound = await stubProviders(context);
  const saved = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled: true, config: {
    maxLengthSeconds: 120, gapSeconds: 3, allowedDirectHosts: [directHost], obsAudio: true, audioDeviceIds: [], audioDeviceDelaysMs: {}, streamerBotAutoplay: true, rewardMappings: []
  } });
  expect(saved.status).toBe(200);
  const control = await pairAutomation(request, ["videos:read", "videos:submit", "videos:control"]);
  const submit = async (data: Record<string, unknown>) => {
    const response = await request.post(`${fixture.runtime.url}/automation/v1/videos/live/requests`, { headers: control, data });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json() as { item: QueueItem }).item;
  };
  const first = await submit({ link: "https://www.youtube.com/watch?v=e2eSnapshtA", title: "First in run", durationSeconds: 60 });
  const second = await submit({ link: `https://${directHost}/clips/second.webm`, title: "Second in run", durationSeconds: 60 });
  // Within the length limit, so both wait as playable without Play anyway.
  expect([first.status, second.status]).toEqual(["queued", "queued"]);
  // An unsafe direct link from automation is rejected with a bounded reason.
  const unsafe = await request.post(`${fixture.runtime.url}/automation/v1/videos/live/requests`, { headers: control, data: { link: `http://${directHost}/clips/plain.mp4` } });
  expect(unsafe.status()).toBe(422);
  expect(await unsafe.json()).toMatchObject({ error: { code: "VIDEO_REQUEST_REJECTED", reason: "unsafe-link" }, fields: ["link"] });
  expect(await unsafe.text()).not.toContain(directHost);

  const overlay = await openBrowserSource(context);
  await expect(overlay.getByTestId("overlay-root")).toBeVisible();

  // The Operator console shares the queue panel; play all from there.
  await page.goto(`${fixture.runtime.url}/operator`);
  const queue = page.getByRole("region", { name: "Video queue" });
  await expect(queue.getByRole("heading", { name: "Waiting (2)" })).toBeVisible();
  await queue.getByRole("button", { name: "Play all now" }).click();
  await expect(queue.getByRole("status").filter({ hasText: "Playing 2 queued videos in order." })).toBeVisible();
  const stub = overlay.frameLocator("iframe[title='Video player']");
  await expect(stub.getByText("video e2eSnapshtA")).toBeVisible();
  const nowPlaying = queue.getByRole("article", { name: "Now playing" });
  await expect(nowPlaying).toContainText("First in run");
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect(queue.getByText("1 more in this run")).toBeVisible();

  // Submitted after the snapshot, even with autoplay while something plays: it waits and is not part of the run.
  const late = await submit({ link: "https://youtu.be/e2eLateItem", title: "Added later", durationSeconds: 30, autoplay: true });
  expect(late.status).toBe("queued");
  await expect(queue.getByRole("article", { name: "Added later" })).toContainText("Queued");
  await expect(queue.getByText("1 more in this run")).toBeVisible();

  // Pause the queue: the current video keeps playing, but nothing else starts after it.
  await queue.getByRole("button", { name: "Pause queue" }).click();
  await expect(queue.getByText("Queue paused", { exact: true })).toBeVisible();
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await endStubVideo(overlay);
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await expect(overlay.getByTestId("video-overlay")).toHaveCount(0);
  await expect(queue.getByText("1 more in this run")).toBeVisible();
  await expect(queue.getByRole("article", { name: "Second in run" })).toContainText("Queued");
  expect((await readQueue()).items.map(item => item.id)).toEqual([second.id, late.id]);

  // Resume continues the run with the second snapshot item, a direct file on the allowed host.
  await queue.getByRole("button", { name: "Resume queue" }).click();
  await expect(queue.getByText("Queue accepting playback", { exact: true })).toBeVisible();
  const direct = overlay.getByTestId("video-overlay-direct");
  await expect(direct).toHaveAttribute("src", `https://${directHost}/clips/second.webm`);
  await expect(nowPlaying).toContainText("Second in run");
  await expect(nowPlaying).toContainText("Direct file");
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect.poll(() => direct.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
  await expect(queue.getByText("more in this run")).toHaveCount(0);

  // Pausing the item pauses the browser source's own player.
  await nowPlaying.getByRole("button", { name: "Pause video" }).click();
  await expect(nowPlaying.getByText("Paused", { exact: true })).toBeVisible();
  await expect.poll(() => direct.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await nowPlaying.getByRole("button", { name: "Skip" }).click();

  // The run is over: the later request is still waiting and nothing plays.
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await expect(overlay.getByTestId("video-overlay")).toHaveCount(0);
  await expect(queue.getByRole("heading", { name: "Waiting (1)" })).toBeVisible();
  await expect(queue.getByRole("article", { name: "Added later" })).toContainText("Queued");
  const state = await readQueue();
  expect(state.runRemaining).toBe(0);
  expect(state.current).toBeNull();
  // Both snapshot items finished and left the queue; only the later request waits.
  expect(state.items.map(item => [item.id, item.status])).toEqual([[late.id, "queued"]]);

  // A stale revision from automation is refused, never applied.
  const stale = await request.post(`${fixture.runtime.url}/automation/v1/videos/live/commands`, { headers: control,
    data: { expectedRevision: state.revision - 1, command: { kind: "play-next" } } });
  expect(stale.status()).toBe(409);
  expect((await stale.json() as { error: { code: string } }).error.code).toBe("VIDEO_QUEUE_CONFLICT");
  expect((await readQueue()).current).toBeNull();
  expect(outbound()).toEqual([]);
});

async function readQueue(): Promise<Queue> {
  const response = await fixture.request("/videos/live");
  expect(response.status).toBe(200);
  return await response.json() as Queue;
}

async function pairAutomation(request: APIRequestContext, scopes: readonly string[]): Promise<Record<string, string>> {
  const verifier = randomBytes(32).toString("base64url");
  const pending = await request.post(`${fixture.runtime.url}/automation/v1/pairings`, { data: {
    clientName: "Videos acceptance", scopes, codeChallenge: createHash("sha256").update(verifier).digest("base64url")
  } });
  expect(pending.status()).toBe(201);
  const pairing = await pending.json() as { id: string };
  expect((await fixture.request(`/api/automation/pairings/${pairing.id}/approve`, "POST", { scopes })).status).toBe(200);
  const exchange = await request.post(`${fixture.runtime.url}/automation/v1/pairings/${pairing.id}/exchange`, { data: { verifier } });
  expect(exchange.status()).toBe(200);
  return { authorization: `Bearer ${(await exchange.json() as { token: string }).token}` };
}

async function openBrowserSource(context: BrowserContext): Promise<Page> {
  const output = await fixture.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", scope: "module", moduleId: "videos", purpose: "live", targetProfileId: null });
  expect(output.status).toBe(200);
  const { url } = await output.json() as { url: string };
  const overlay = await context.newPage();
  await overlay.goto(url);
  return overlay;
}

/** Answers every provider request locally and records anything else that tried to leave the machine. */
async function stubProviders(context: BrowserContext): Promise<() => readonly string[]> {
  const unexpected: string[] = [];
  const body = await tinyVideo;
  await context.route(url => url.protocol !== "http:" || url.hostname !== "127.0.0.1", async route => {
    const url = new URL(route.request().url());
    if (url.origin === "https://www.youtube-nocookie.com" && url.pathname.startsWith("/embed/")) {
      return route.fulfill({ contentType: "text/html", body: youTubeStub });
    }
    if (url.origin === `https://${directHost}` && url.pathname.endsWith(".webm")) {
      return route.fulfill({ contentType: "video/webm", headers: { "cache-control": "no-store" }, body });
    }
    unexpected.push(url.origin);
    return route.abort("blockedbyclient");
  });
  return () => unexpected;
}

async function endStubVideo(overlay: Page): Promise<void> {
  const frame = overlay.frames().find((candidate: Frame) => candidate.url().startsWith("https://www.youtube-nocookie.com/embed/"));
  if (frame === undefined) throw new Error("The stub YouTube player is not loaded");
  await frame.evaluate(() => (window as Window & { endStubVideo?: () => void }).endStubVideo?.());
}
