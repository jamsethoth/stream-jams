import { cp, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test, type Page } from "@playwright/test";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

interface MainState {
  moduleMuteHost: { setModuleMutes(state: { alerts: boolean; "screen-effects": boolean }): Promise<void>; retry(): Promise<void> };
  queueMuteSound(moduleId: string, playbackId: string): void;
  muteResults: { playbackId: string; result?: { failedRouteIds: string[] }; error?: string }[];
}
const audioUrl = "stream-jams-audio://player/";
async function mediaState(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll("audio")].map(media => ({ muted: media.muted, volume: media.volume, time: media.currentTime, paused: media.paused })));
}

test("production Electron audio scopes current and future mute, preserves timer cues, and reconciles renderer recreation", async () => {
  await cp(resolve("apps/desktop/src/audio/player.html"), resolve("apps/desktop/dist/audio/player.html"));
  const root = await mkdtemp(join(tmpdir(), "stream-jams-module-mute-"));
  const require = createRequire(resolve("apps/desktop/package.json"));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  const desktop = await _electron.launch({ executablePath: require("electron") as string,
    args: [resolve("tests/desktop/fixtures/module-mute-host.mjs"), resolve("apps/desktop/dist")], cwd: root, env,
    chromiumSandbox: true, timeout: 30000 });
  const child = desktop.process();
  const pids: number[] = [];
  await withCleanup(async () => {
    await expect.poll(() => desktop.evaluate(() => {
      const state = globalThis as typeof globalThis & { muteReady?: boolean; muteFixtureError?: string };
      if (state.muteFixtureError) throw new Error(state.muteFixtureError);
      return state.muteReady;
    })).toBe(true);
    let player = await windowByUrl(desktop, audioUrl);
    async function mute(alerts: boolean, effects: boolean) {
      await desktop.evaluate(async (_electron, state) => (globalThis as typeof globalThis & MainState).moduleMuteHost.setModuleMutes(state), { alerts, "screen-effects": effects });
    }
    async function queue(prefix: string, modules = ["alerts", "screen-effects", "timers"]) {
      await desktop.evaluate((_electron, { prefix, modules }) => {
        for (const moduleId of modules) (globalThis as typeof globalThis & MainState).queueMuteSound(moduleId, `${prefix}-${moduleId}`);
      }, { prefix, modules });
    }
    await queue("current");
    await expect.poll(async () => (await mediaState(player)).filter(media => media.time > 0 && !media.paused).length).toBe(3);
    await mute(true, false);
    expect((await mediaState(player)).map(media => media.muted)).toEqual([true, false, false]);
    await mute(true, true);
    expect((await mediaState(player)).map(media => media.muted)).toEqual([true, true, false]);
    await queue("future", ["screen-effects"]);
    await expect.poll(async () => (await mediaState(player)).length).toBe(4);
    expect((await mediaState(player)).map(media => media.muted)).toEqual([true, true, false, true]);
    await mute(false, true);
    const before = await mediaState(player);
    expect(before.map(media => media.muted)).toEqual([false, true, false, true]);
    expect(before.every(media => media.volume === 0 && !media.paused)).toBe(true);
    expect(await player.evaluate(() => (globalThis as typeof globalThis & { muteNativeStarts: { muted: boolean }[] }).muteNativeStarts.map(start => start.muted)))
      .toEqual([false, false, false, true]);
    await expect.poll(async () => (await mediaState(player)).every((media, index) => media.time > before[index]!.time)).toBe(true);
    await expect(player.locator("audio")).toHaveCount(0, { timeout: 7000 });
    const finished = await desktop.evaluate(() => (globalThis as typeof globalThis & MainState).muteResults);
    expect(finished).toHaveLength(4);
    expect(finished.every(item => item.result?.failedRouteIds.length === 0 && item.error === undefined)).toBe(true);

    await mute(true, false);
    await queue("interrupted");
    await expect.poll(async () => (await mediaState(player)).filter(media => media.time > 0).length).toBe(3);
    const oldPid = await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL() === "stream-jams-audio://player/")!;
      const pid = window.webContents.getOSProcessId(); window.webContents.forcefullyCrashRenderer(); return pid;
    });
    pids.push(oldPid);
    await desktop.evaluate(async () => (globalThis as typeof globalThis & MainState).moduleMuteHost.retry());
    player = await windowByUrl(desktop, audioUrl);
    expect(await player.locator("audio").count()).toBe(0);
    const newPid = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL() === "stream-jams-audio://player/")!.webContents.getOSProcessId());
    expect(newPid).not.toBe(oldPid);
    await queue("recovered");
    await expect.poll(async () => (await mediaState(player)).filter(media => media.time > 0).length).toBe(3);
    expect((await mediaState(player)).map(media => media.muted)).toEqual([true, false, false]);
    expect(await player.evaluate(() => (globalThis as typeof globalThis & { muteNativeStarts: { muted: boolean }[] }).muteNativeStarts.map(start => start.muted)))
      .toEqual([true, false, false]);
    await expect(player.locator("audio")).toHaveCount(0, { timeout: 7000 });
    const recovered = await desktop.evaluate(() => (globalThis as typeof globalThis & MainState).muteResults.filter(item => item.playbackId.startsWith("recovered-")));
    expect(recovered).toHaveLength(3);
    expect(recovered.every(item => item.result?.failedRouteIds.length === 0)).toBe(true);
    console.info("Real Electron audio/preload/IPC/host acceptance passed. Native media played at volume zero; output enumeration/binding was simulated. Physical sound was not tested.");
  }, () => finishDesktop(desktop, root, pids, child));
});
