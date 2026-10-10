import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Frame, type Page } from "@playwright/test";
import type { DesktopVideoCommand, DesktopVideoEvent, DesktopVideoTransport } from "../../packages/core/src/videos/mirror.js";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";
import { SqliteTwitchAccountRepository } from "../../apps/server/src/modules/twitch/sqlite-twitch-account-repository.js";
import { createTwitchTokenSecretRef } from "../../apps/server/src/modules/twitch/twitch-oauth-service.js";

// Videos queue acceptance against a real local runtime. Providers are stubbed: every
// non-loopback request is answered locally, so no test reaches YouTube, Twitch or a file host.
test.use({ trace: "off", screenshot: "off", video: "off" });

type Fixture = Awaited<ReturnType<typeof createProviderSecurityRuntimeFixture>>;
type QueueItem = { readonly id: string; readonly status: string; readonly holdReason: string | null; readonly title: string | null; readonly submittedVia: string; readonly autoplay: boolean;
  readonly providerTitle: string | null; readonly channelName: string | null; readonly durationMs: number | null; readonly link: string };
type Queue = { readonly revision: number; readonly queuePaused: boolean; readonly runRemaining: number; readonly items: readonly QueueItem[];
  readonly recent: readonly (QueueItem & { readonly finishedAt: string; readonly link: string })[];
  readonly current: { readonly itemId: string; readonly phase: string; readonly positionMs: number } | null; readonly mirror: { readonly available: boolean } };

const directHost = "videos.example.com";
// VP9 so it decodes in the bundled Chromium, which has no H.264.
const tinyVideo = readFile(resolve("tests/fixtures/media/neutral-trackless.webm"));

// A stand-in for the YouTube iframe player that speaks the enablejsapi postMessage protocol:
// it answers playVideo/pauseVideo/seekTo with infoDelivery messages and shows the last command.
// Videos whose id starts with "e2eLong" also report a 5:00 length, as a real player does once loaded.
const youTubeStub = `<!doctype html><title>YouTube stub</title>
<p id="video"></p><p id="state">waiting</p><p id="seek">no seek</p>
<script>
  let time = 0;
  const id = location.pathname.split("/").at(-1);
  const length = id.startsWith("e2eLong") ? { duration: 300 } : {};
  document.getElementById("video").textContent = "video " + id;
  const post = info => parent.postMessage(JSON.stringify({ event: "infoDelivery", info }), "*");
  const show = (id, text) => { document.getElementById(id).textContent = text; };
  addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.event !== "command") return;
    if (message.func === "playVideo") { show("state", "state playing"); post({ playerState: 1, currentTime: time, ...length }); }
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

test("management submit queues a safe link without a length and rejects unsafe, unknown and disallowed links with a visible reason", async ({ context, page }) => {
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

  // A safe YouTube link without a length queues normally; its length is shown as unknown, not as a hold.
  await link.fill("https://www.youtube.com/watch?v=e2eSubmitA1&t=5");
  await form.getByRole("textbox", { name: "Title (optional)" }).fill("Management pick");
  await add.click();
  await expect(queue.getByRole("status").filter({ hasText: "Video added to the queue." })).toBeVisible();
  await expect(link).toHaveValue("");
  await expect(queue.getByRole("heading", { name: "Waiting (1)" })).toBeVisible();
  const waiting = queue.getByRole("article", { name: "Management pick" });
  await expect(waiting).toContainText("Queued");
  await expect(waiting).toContainText("Length unknown");
  await expect(waiting).toContainText("YouTube · via management");
  await expect(waiting).not.toContainText("Over the length limit");
  await expect(queue.getByRole("button", { name: "Play anyway: Management pick" })).toHaveCount(0);
  await expect(queue.getByRole("button", { name: "Play next" })).toBeEnabled();
  await expect(queue.getByRole("button", { name: "Play all now" })).toBeEnabled();

  const state = await readQueue();
  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({ status: "queued", holdReason: null, title: "Management pick", submittedVia: "management" });
  // Rejections are logged by reason and field only, never with the submitted link.
  const logs = await fixture.readLogs();
  for (const [value] of rejectedLinks) expect(logs).not.toContain(value);
  expect(logs).not.toContain("secret@");
  expect(outbound()).toEqual([]);
});

test("queued requests show the provider's title and channel, and a Twitch length over the limit holds the clip", async ({ context, page }) => {
  test.setTimeout(60_000);
  const outbound = await stubProviders(context);
  // The server's own lookups go to this stand-in for YouTube oEmbed and Twitch Helix, never the network.
  const lookups: { readonly url: string; readonly authorization: string | null; readonly clientId: string | null }[] = [];
  const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const videoMetadataFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    lookups.push({ url: url.href, authorization: headers.get("authorization"), clientId: headers.get("client-id") });
    if (url.origin + url.pathname === "https://www.youtube.com/oembed" && url.searchParams.get("url") === "https://www.youtube.com/watch?v=e2eMetaYT01") {
      return answer({ title: "Stubbed YouTube title", author_name: "Stub Channel", type: "video" });
    }
    if (url.origin + url.pathname === "https://api.twitch.tv/helix/clips" && url.searchParams.get("id") === "E2eLongClip") {
      return answer({ data: [{ id: "E2eLongClip", title: "Stubbed long clip", broadcaster_name: "Clip Streamer", duration: 95.5 }] });
    }
    if (url.origin + url.pathname === "https://api.twitch.tv/helix/videos" && url.searchParams.get("id") === "987654321") {
      return answer({ data: [{ id: "987654321", title: "Stubbed VOD", user_name: "Vod Streamer", duration: "45s" }] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  await fixture.close();
  fixture = await createProviderSecurityRuntimeFixture({ videoMetadataFetch });
  await fixture.start();
  // A connected Twitch account, as the Twitch connection flow would leave it.
  await new SqliteTwitchAccountRepository(fixture.runtime.composition.database.connection).saveAccount({
    accountId: "e2e-broadcaster", login: "e2e_streamer", displayName: "E2E Streamer", scopes: [], connectedAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z"
  });
  await fixture.secretStore.setSecret(createTwitchTokenSecretRef("e2e-broadcaster", "access_token"), "e2e-user-token-value");
  const saved = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled: true, config: {
    maxLengthSeconds: 60, gapSeconds: 0, allowedDirectHosts: [], obsAudio: true, audioDeviceIds: [], audioDeviceDelaysMs: {}, streamerBotAutoplay: true, rewardMappings: []
  } });
  expect(saved.status).toBe(200);

  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const queue = page.getByRole("region", { name: "Video queue" });
  const form = queue.getByRole("form", { name: "Add video" });
  const add = async (link: string, title = "") => {
    await form.getByRole("textbox", { name: "Video link" }).fill(link);
    await form.getByRole("textbox", { name: "Title (optional)" }).fill(title);
    await form.getByRole("button", { name: "Add video" }).click();
    await expect(form.getByRole("textbox", { name: "Video link" })).toHaveValue("");
  };
  await add("https://www.youtube.com/watch?v=e2eMetaYT01");
  // A submitted title wins over the provider's; Twitch reports this clip at 1:35, over the 60 s limit.
  await add("https://clips.twitch.tv/E2eLongClip", "My clip pick");
  await add("https://www.twitch.tv/videos/987654321");

  const youtube = queue.getByRole("article", { name: "Stubbed YouTube title" });
  await expect(youtube).toContainText("Stub Channel · Length unknown");
  await expect(youtube.getByText("Queued", { exact: true })).toBeVisible();
  const clip = queue.getByRole("article", { name: "My clip pick" });
  await expect(clip).toContainText("Clip Streamer · 1:35");
  await expect(clip).toContainText("Over the length limit");
  await expect(clip.getByText("Held", { exact: true })).toBeVisible();
  await expect(queue.getByRole("button", { name: "Play anyway: My clip pick" })).toBeVisible();
  const vod = queue.getByRole("article", { name: "Stubbed VOD" });
  await expect(vod).toContainText("Vod Streamer · 0:45");
  await expect(vod.getByText("Queued", { exact: true })).toBeVisible();
  await expect(queue.getByText("undefined")).toHaveCount(0);

  const items = (await readQueue()).items;
  expect(items.map(item => [item.title, item.providerTitle, item.channelName, item.durationMs, item.status, item.holdReason])).toEqual([
    [null, "Stubbed YouTube title", "Stub Channel", null, "queued", null],
    ["My clip pick", "Stubbed long clip", "Clip Streamer", 95_500, "held", "over-limit"],
    [null, "Stubbed VOD", "Vod Streamer", 45_000, "queued", null]
  ]);
  // Play next skips the held clip.
  await queue.getByRole("button", { name: "Play next" }).click();
  await expect(queue.getByRole("article", { name: "Now playing" })).toContainText("Stubbed YouTube title");
  await expect(queue.getByRole("article", { name: "Now playing" })).toContainText("Stub Channel");

  // The Operator shows the same details.
  await page.goto(`${fixture.runtime.url}/operator`);
  const operatorQueue = page.getByRole("region", { name: "Video queue" });
  await expect(operatorQueue.getByRole("article", { name: "Stubbed VOD" })).toContainText("Vod Streamer · 0:45");
  await expect(operatorQueue.getByRole("article", { name: "My clip pick" })).toContainText("Clip Streamer · 1:35");

  // One lookup per request, only to YouTube oEmbed and Twitch Helix; the Twitch token goes only to Twitch.
  expect(lookups.map(lookup => new URL(lookup.url).origin + new URL(lookup.url).pathname)).toEqual([
    "https://www.youtube.com/oembed", "https://api.twitch.tv/helix/clips", "https://api.twitch.tv/helix/videos"
  ]);
  expect(lookups[0]?.authorization).toBeNull();
  expect(lookups.slice(1).map(lookup => lookup.authorization)).toEqual(["Bearer e2e-user-token-value", "Bearer e2e-user-token-value"]);
  expect(lookups.slice(1).every(lookup => (lookup.clientId ?? "") !== "")).toBe(true);
  const logs = await fixture.readLogs();
  expect(logs).not.toContain("e2e-user-token-value");
  expect(logs).not.toContain("Stubbed long clip");
  // The browser never contacted a provider for details.
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
  await expect(held).toContainText("10:00");
  await expect(held).toContainText("Requested by Patient Viewer · YouTube · via automation");
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

test("an unknown-length request queues and plays with Play next in the browser source", async ({ context, page }) => {
  test.setTimeout(60_000);
  const outbound = await stubProviders(context);
  const overlay = await openBrowserSource(context);
  await expect(overlay.getByTestId("overlay-root")).toBeVisible();

  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const queue = page.getByRole("region", { name: "Video queue" });
  const form = queue.getByRole("form", { name: "Add video" });
  await form.getByRole("textbox", { name: "Video link" }).fill("https://youtu.be/e2eUnknwnA1");
  await form.getByRole("textbox", { name: "Title (optional)" }).fill("Unknown length pick");
  await form.getByRole("button", { name: "Add video" }).click();
  await expect(queue.getByRole("article", { name: "Unknown length pick" })).toContainText("Length unknown");

  await queue.getByRole("button", { name: "Play next" }).click();
  const stub = overlay.frameLocator("iframe[title='Video player']");
  await expect(stub.getByText("video e2eUnknwnA1")).toBeVisible();
  const nowPlaying = queue.getByRole("article", { name: "Now playing" });
  await expect(nowPlaying).toContainText("Unknown length pick");
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect(nowPlaying.getByLabel("Playback position")).toContainText("/ length unknown");
  await expect(queue.getByRole("heading", { name: "Waiting (0)" })).toBeVisible();

  await endStubVideo(overlay);
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await expect(overlay.getByTestId("video-overlay")).toHaveCount(0);
  expect((await readQueue()).items).toEqual([]);
  expect(outbound()).toEqual([]);
});

test("the Operator replays a video that played to the end from Recent back into the queue", async ({ context, page }) => {
  test.setTimeout(60_000);
  const outbound = await stubProviders(context);
  const overlay = await openBrowserSource(context);
  await expect(overlay.getByTestId("overlay-root")).toBeVisible();

  await page.goto(`${fixture.runtime.url}/operator`);
  const queue = page.getByRole("region", { name: "Video queue" });
  const recent = queue.getByRole("region", { name: "Recent videos" });
  await expect(recent.getByText("No videos have finished yet.")).toBeVisible();
  const form = queue.getByRole("form", { name: "Add video" });
  await form.getByRole("textbox", { name: "Video link" }).fill("https://youtu.be/e2eReplayA1");
  await form.getByRole("textbox", { name: "Title (optional)" }).fill("Replay pick");
  await form.getByRole("button", { name: "Add video" }).click();
  await queue.getByRole("button", { name: "Play next" }).click();
  await expect(overlay.frameLocator("iframe[title='Video player']").getByText("video e2eReplayA1")).toBeVisible();
  await expect(queue.getByRole("article", { name: "Now playing" })).toContainText("Replay pick");

  await endStubVideo(overlay);
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await expect(recent.getByRole("heading", { name: "Recent (1)" })).toBeVisible();
  const card = recent.getByRole("article", { name: "Replay pick" });
  await expect(card).toContainText("YouTube · www.youtube.com · via Operator");
  await expect(card.getByText("Played", { exact: true })).toBeVisible();
  await expect(queue.getByRole("heading", { name: "Waiting (0)" })).toBeVisible();
  const played = (await readQueue()).recent[0]!;
  expect(played).toMatchObject({ title: "Replay pick", status: "played", link: "https://www.youtube.com/watch?v=e2eReplayA1" });

  // Replay queues a new request like Alerts' Replay: it waits for Play next and never starts on its own.
  const replay = card.getByRole("button", { name: "Replay Replay pick in Videos" });
  await replay.focus();
  await page.keyboard.press("Enter");
  await expect(queue.getByRole("status").filter({ hasText: "Replay pick added to the live video queue." })).toBeVisible();
  await expect(queue.getByRole("heading", { name: "Waiting (1)" })).toBeVisible();
  await expect(queue.getByRole("list").first().getByRole("article", { name: "Replay pick" })).toContainText("Queued");
  await expect(replay).toBeFocused();
  const state = await readQueue();
  expect(state.current).toBeNull();
  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({ title: "Replay pick", status: "queued", submittedVia: "operator", autoplay: false });
  expect(state.items[0]!.id).not.toBe(played.id);
  expect(state.recent.map(item => item.id)).toEqual([played.id]);

  // The usual queue rules apply: with the module off, Replay is refused with a visible reason and nothing is queued.
  expect((await fixture.request("/overlay-modules/videos/enabled", "PATCH", { enabled: false })).status).toBe(200);
  await replay.click();
  await expect(page.getByRole("alert").filter({ hasText: "The Videos module is turned off." })).toBeVisible();
  expect((await readQueue()).items).toHaveLength(1);
  expect(outbound()).toEqual([]);
});

test("an unknown-length item the player reports over the limit is stopped, held as over the limit, and the run moves on", async ({ page }) => {
  test.setTimeout(60_000);
  // The desktop primary player is the output that reports a learned duration; stand in for it in-process.
  const player = new StubDesktopVideoPlayer();
  await fixture.close();
  fixture = await createProviderSecurityRuntimeFixture({ desktopVideoTransport: player });
  await fixture.start();
  const saved = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled: true, config: {
    maxLengthSeconds: 60, gapSeconds: 0, allowedDirectHosts: [], obsAudio: true, audioDeviceIds: [], audioDeviceDelaysMs: {}, streamerBotAutoplay: true, rewardMappings: []
  } });
  expect(saved.status).toBe(200);

  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const queue = page.getByRole("region", { name: "Video queue" });
  const form = queue.getByRole("form", { name: "Add video" });
  for (const [link, title] of [["https://youtu.be/e2eTooLong1", "Turns out long"], ["https://youtu.be/e2eNextUp01", "Next up"]] as const) {
    await form.getByRole("textbox", { name: "Video link" }).fill(link);
    await form.getByRole("textbox", { name: "Title (optional)" }).fill(title);
    await form.getByRole("button", { name: "Add video" }).click();
    await expect(queue.getByRole("article", { name: title })).toContainText("Queued");
  }
  const [long, next] = (await readQueue()).items;
  if (long === undefined || next === undefined) throw new Error("Both requests should be queued");

  await queue.getByRole("button", { name: "Play all now" }).click();
  await expect.poll(() => player.lastLoad()).toBe(long.id);
  const nowPlaying = queue.getByRole("article", { name: "Now playing" });
  await expect(nowPlaying).toContainText("Turns out long");

  // The player learns the real length (5:00), over the 60 s limit: the queue ends it without marking it played.
  player.report({ type: "report", purpose: "live", itemId: long.id, state: "started", positionMs: 0, durationMs: 300_000, controls: { pause: true, seek: true } });
  await expect.poll(() => player.lastLoad()).toBe(next.id);
  await expect(nowPlaying).toContainText("Next up");
  const held = queue.getByRole("article", { name: "Turns out long" });
  await expect(held).toContainText("Held");
  await expect(held).toContainText("Over the length limit");
  await expect(held).toContainText("5:00");
  await expect(held).toContainText("YouTube · via management");
  await expect(queue.getByRole("button", { name: "Play anyway: Turns out long" })).toBeEnabled();
  const state = await readQueue();
  expect(state.current).toMatchObject({ itemId: next.id });
  expect(state.items.find(item => item.id === long.id)).toMatchObject({ status: "held", holdReason: "over-limit" });

  // Play anyway still releases it, and it is never cut again.
  player.report({ type: "report", purpose: "live", itemId: next.id, state: "ended" });
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await queue.getByRole("button", { name: "Play anyway: Turns out long" }).click();
  await expect.poll(() => player.lastLoad()).toBe(long.id);
  player.report({ type: "report", purpose: "live", itemId: long.id, state: "started", positionMs: 0, durationMs: 300_000, controls: { pause: true, seek: true } });
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect(nowPlaying).toContainText("Turns out long");
  expect((await readQueue()).current).toMatchObject({ itemId: long.id, phase: "playing" });
});

test("without the desktop app, an unknown-length item the browser source reports over the limit is held and the run moves on", async ({ context, page }) => {
  test.setTimeout(60_000);
  const outbound = await stubProviders(context);
  const saved = await fixture.request("/overlay-modules/videos/config", "PUT", { enabled: true, config: {
    maxLengthSeconds: 60, gapSeconds: 0, allowedDirectHosts: [], obsAudio: true, audioDeviceIds: [], audioDeviceDelaysMs: {}, streamerBotAutoplay: true, rewardMappings: []
  } });
  expect(saved.status).toBe(200);
  const overlay = await openBrowserSource(context);
  await expect(overlay.getByTestId("overlay-root")).toBeVisible();

  await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
  const queue = page.getByRole("region", { name: "Video queue" });
  await expect(page.getByRole("note")).toContainText("Mirroring unavailable: desktop app not running");
  const form = queue.getByRole("form", { name: "Add video" });
  for (const [link, title] of [["https://youtu.be/e2eLongBrws", "Long in browser"], ["https://youtu.be/e2eNextBrws", "Next in browser"]] as const) {
    await form.getByRole("textbox", { name: "Video link" }).fill(link);
    await form.getByRole("textbox", { name: "Title (optional)" }).fill(title);
    await form.getByRole("button", { name: "Add video" }).click();
    await expect(queue.getByRole("article", { name: title })).toContainText("Length unknown");
  }
  const [long, next] = (await readQueue()).items;
  if (long === undefined || next === undefined) throw new Error("Both requests should be queued");

  // The browser source's player reports a 5:00 length, over the 60 s limit: the queue cuts it and plays the next item.
  await queue.getByRole("button", { name: "Play all now" }).click();
  const stub = overlay.frameLocator("iframe[title='Video player']");
  await expect(stub.getByText("video e2eNextBrws")).toBeVisible();
  const nowPlaying = queue.getByRole("article", { name: "Now playing" });
  await expect(nowPlaying).toContainText("Next in browser");
  const held = queue.getByRole("article", { name: "Long in browser" });
  await expect(held).toContainText("Held");
  await expect(held).toContainText("Over the length limit");
  await expect(held).toContainText("5:00");
  await expect(held).toContainText("YouTube · via management");
  await expect(queue.getByRole("button", { name: "Play anyway: Long in browser" })).toBeEnabled();
  expect((await readQueue()).items.find(item => item.id === long.id)).toMatchObject({ status: "held", holdReason: "over-limit" });

  // Play anyway releases it, and the same report never cuts it again.
  await endStubVideo(overlay);
  await expect(queue.getByText("Nothing is playing.")).toBeVisible();
  await queue.getByRole("button", { name: "Play anyway: Long in browser" }).click();
  await expect(stub.getByText("video e2eLongBrws")).toBeVisible();
  await expect(stub.getByText("state playing")).toBeVisible();
  await expect(nowPlaying).toContainText("Long in browser");
  await expect(nowPlaying.getByText("Playing", { exact: true })).toBeVisible();
  await expect(nowPlaying.getByLabel("Playback position")).toContainText("/ 5:00");
  expect((await readQueue()).current).toMatchObject({ itemId: long.id, phase: "playing" });
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

/** An in-process stand-in for the desktop primary player: records commands and reports what a real player would. */
class StubDesktopVideoPlayer implements DesktopVideoTransport {
  readonly available = true;
  readonly sent: DesktopVideoCommand[] = [];
  readonly #listeners = new Set<(event: DesktopVideoEvent) => void>();
  send(command: DesktopVideoCommand): void { this.sent.push(command); }
  subscribe(listener: (event: DesktopVideoEvent) => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  report(event: DesktopVideoEvent): void { for (const listener of this.#listeners) listener(event); }
  lastLoad(): string | null {
    const loads = this.sent.flatMap(command => command.type === "load" ? [command.itemId] : []);
    return loads.at(-1) ?? null;
  }
}
