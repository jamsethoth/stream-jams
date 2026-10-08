import { cp, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

// The Videos desktop mirror path (OpenSpec add-video-request-queue 5.1-5.5, 5.8) with the
// production player host, hidden player window, capture, WebRTC publisher and device receiver.
// Only the network is replaced by a local fixture video. Nothing plays on a physical device.
test.use({ trace: "off", screenshot: "off", video: "off" });

interface VideoEvent { type: string; state?: string; itemId?: string; positionMs?: number; available?: boolean; controls?: { pause: boolean; seek: boolean } }
interface MainState {
  videoReady?: boolean;
  videoFixtureError?: string;
  videoEvents: VideoEvent[];
  videoDiagnostics: { source: string }[];
  desktopSignals: { type: string; sdp?: string }[];
  desktopReceiver: { send(signal: unknown): void; detach(): void };
  videoHost: { handle(command: unknown): void; serviceLost(): void };
}
const playerUrl = "http://127.0.0.1:39999/__stream-jams/video-player/live";
const devicesUrl = "stream-jams-audio://player/video-devices.html";
const clipUrl = "https://videos.example.test/neutral.webm";

async function command(desktop: ElectronApplication, value: unknown): Promise<void> {
  await desktop.evaluate((_electron, input) => (globalThis as unknown as MainState).videoHost.handle(input), value);
}
async function events(desktop: ElectronApplication): Promise<VideoEvent[]> {
  return desktop.evaluate(() => (globalThis as unknown as MainState).videoEvents);
}
async function stageState(player: Page) {
  return player.evaluate(() => {
    const video = document.querySelector("#stage video");
    return video instanceof HTMLVideoElement ? { children: document.getElementById("stage")!.children.length, paused: video.paused, time: video.currentTime } : { children: document.getElementById("stage")!.children.length, paused: null, time: null };
  });
}

test("desktop primary player captures one hidden page and mirrors it to the device receiver over loopback WebRTC", async () => {
  await cp(resolve("apps/desktop/src/audio/player.html"), resolve("apps/desktop/dist/audio/player.html"));
  const root = await mkdtemp(join(tmpdir(), "stream-jams-video-mirror-"));
  const require = createRequire(resolve("apps/desktop/package.json"));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  const desktop = await _electron.launch({ executablePath: require("electron") as string,
    args: [resolve("tests/desktop/fixtures/video-mirror-host.mjs"), resolve("apps/desktop/dist"), resolve("tests/fixtures/media/neutral-with-audio.webm")],
    // Chromium's sandbox cannot start as root on Linux (containerized CI); Windows and normal users keep it.
    cwd: root, env, chromiumSandbox: process.getuid?.() !== 0, timeout: 30_000 });
  const child = desktop.process();
  await withCleanup(async () => {
    await expect.poll(() => desktop.evaluate(() => {
      const state = globalThis as unknown as MainState;
      if (state.videoFixtureError !== undefined) throw new Error(state.videoFixtureError);
      return state.videoReady === true;
    })).toBe(true);

    // The first lease announces the player; outputs switch to the mirror on this event.
    await expect.poll(async () => (await events(desktop)).some(event => event.type === "status" && event.available === true), { timeout: 10_000 }).toBe(true);

    await command(desktop, { type: "load", purpose: "live", itemId: "item-1", source: { provider: "direct", url: clipUrl }, positionMs: 0, paused: false });
    const player = await windowByUrl(desktop, playerUrl);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
    await expect.poll(async () => (await events(desktop)).find(event => event.state === "started"), { timeout: 15_000 })
      .toMatchObject({ type: "report", itemId: "item-1", controls: { pause: true, seek: true } });
    await expect.poll(async () => Math.max(0, ...(await events(desktop)).filter(event => event.state === "progress").map(event => event.positionMs ?? 0)), { timeout: 10_000 }).toBeGreaterThan(1000);

    // Pause and play reach the page. This runs early: the fixture clip is 10 s long and an ended item ignores play.
    await command(desktop, { type: "pause", purpose: "live", itemId: "item-1" });
    await expect.poll(async () => (await stageState(player)).paused).toBe(true);
    await command(desktop, { type: "play", purpose: "live", itemId: "item-1", positionMs: 2000 });
    await expect.poll(async () => (await stageState(player)).paused).toBe(false);
    expect((await stageState(player)).time).toBeLessThan(9);

    // The page cannot leave or open windows.
    expect(await player.evaluate(() => window.open("https://example.com/") === null)).toBe(true);
    await player.evaluate(() => { location.href = "https://example.com/"; });
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
    expect(player.url()).toBe(playerUrl);
    expect(desktop.windows().some(page => URL.canParse(page.url()) && new URL(page.url()).hostname === "example.com")).toBe(false);

    // A desktop receiver gets an offer carrying the captured picture and sound.
    await desktop.evaluate(() => (globalThis as unknown as MainState).desktopReceiver.send({ type: "hello", connection: 1 }));
    await expect.poll(() => desktop.evaluate(() => (globalThis as unknown as MainState).desktopSignals.find(signal => signal.type === "offer")?.sdp ?? ""), { timeout: 10_000 })
      .toMatch(/m=audio[\s\S]*m=video|m=video[\s\S]*m=audio/u);

    // Device fan-out runs in its own hidden receiver, outside the captured page, with the per-device delay.
    await command(desktop, { type: "set-output", purpose: "live", muted: false, devices: [{ deviceId: "fixture-output", delayMs: 120 }] });
    const devices = await windowByUrl(desktop, devicesUrl);
    await expect.poll(() => devices.evaluate(() => {
      const video = document.querySelector("video");
      const stream = video?.srcObject;
      return stream instanceof MediaStream && video!.muted && video!.videoWidth > 0 && stream.getAudioTracks().some(track => track.readyState === "live");
    }), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => devices.evaluate(() => ({ ...document.documentElement.dataset }))).toMatchObject({ outputs: "1", muted: "false", delaysMs: "120" });
    // Mute and delay changes apply in place.
    await command(desktop, { type: "set-output", purpose: "live", muted: true, devices: [{ deviceId: "fixture-output", delayMs: 40 }] });
    await expect.poll(() => devices.evaluate(() => ({ ...document.documentElement.dataset }))).toMatchObject({ outputs: "1", muted: "true", delaysMs: "40" });
    // Only the player's own main frame may capture.
    expect(await devices.evaluate(() => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(() => "granted", (error: unknown) => error instanceof Error ? error.name : "refused"))).not.toBe("granted");

    // Stop removes the provider so every output falls silent.
    await command(desktop, { type: "stop", purpose: "live" });
    await expect.poll(async () => (await stageState(player)).children).toBe(0);

    // Losing the service destroys every player window and withdraws the mirror.
    await desktop.evaluate(() => (globalThis as unknown as MainState).videoHost.serviceLost());
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed() && /video-player|video-devices/u.test(window.webContents.getURL())).length)).toBe(0);
    expect((await events(desktop)).at(-1)).toEqual({ type: "status", available: false });
    expect(await desktop.evaluate(() => (globalThis as unknown as MainState).videoDiagnostics.map(entry => entry.source))).toEqual([]);
  }, async () => finishDesktop(desktop, root, [], child));
});
