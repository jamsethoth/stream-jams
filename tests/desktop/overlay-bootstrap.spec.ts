import { cp, mkdir, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { finishDesktop, withCleanup } from "./audio-harness.js";
import { cleanupFailedOverlayLaunch } from "./overlay-harness.js";

test("minimal copied packaged Electron Playwright bootstrap", async ({ playwright }, testInfo) => {
  expect(playwright._electron).toBe(_electron);
  const require = createRequire(resolve("apps/desktop/package.json"));
  const packaged = testInfo.outputPath("packaged-bootstrap");
  await cp(dirname(require("electron") as string), packaged, { recursive: true });
  const appRoot = join(packaged, "resources", "app");
  const profile = testInfo.outputPath("profile");
  await mkdir(appRoot, { recursive: true });
  await mkdir(join(appRoot, "overlay"));
  for (const file of ["overlay-window.js", "overlay-window-policy.js"]) await cp(resolve("apps/desktop/dist/overlay", file), join(appRoot, "overlay", file));
  await mkdir(profile, { recursive: true });
  await writeFile(join(appRoot, "package.json"), JSON.stringify({ name: "overlay-bootstrap", version: "1.0.0", type: "module", main: "main.mjs" }));
  await writeFile(join(appRoot, "main.mjs"), `
    import {app,BrowserWindow,screen} from 'electron';
    import {OverlayWindow} from './overlay/overlay-window.js';
    import {appendFileSync} from 'node:fs';
    const log=(value)=>{appendFileSync(process.env.STREAM_JAMS_PROBE_LOG,Date.now()+':'+value+'\\n');console.log('probe:'+value);};
    app.disableHardwareAcceleration();
    app.setPath('userData',process.env.STREAM_JAMS_PROBE_PROFILE);
    log('entry');
    app.whenReady().then(async()=>{
      log('ready');
      const window=new BrowserWindow({show:false});
      await window.loadURL('data:text/html,neutral');
      log('loaded');
      OverlayWindow.create({enabled:true,selectedId:String(screen.getAllDisplays()[0].id)});
      log('blank-overlay-created');
    });
    app.on('quit',()=>log('quit'));
  `);
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_PROBE_PROFILE = profile;
  env.STREAM_JAMS_PROBE_LOG = testInfo.outputPath("bootstrap.log");
  const executablePath = join(packaged, "Overlay Probe.exe");
  await rename(join(packaged, "electron.exe"), executablePath);
  const started = Date.now();
  let desktop: Awaited<ReturnType<typeof _electron.launch>>;
  try {
    desktop = await _electron.launch({ executablePath, env, chromiumSandbox: true, timeout: 30_000 });
  } catch (error) {
    try { await cleanupFailedOverlayLaunch(executablePath); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Overlay bootstrap launch and cleanup failed.", { cause: cleanupError }); }
    throw error;
  }
  console.info(`probe:playwright-launch-resolved:${Date.now() - started}ms`);
  const child = desktop.process();
  const pids: number[] = [];
  await withCleanup(async () => {
    pids.push(...await desktop.evaluate(({ app }) => app.getAppMetrics().map((metric: { pid: number }) => metric.pid)));
    const state = await desktop.evaluate(({ app, BrowserWindow }) => ({ ready: app.isReady(), packaged: app.isPackaged, urls: BrowserWindow.getAllWindows().map((window: { webContents: { getURL(): string } }) => window.webContents.getURL()) }));
    console.info("probe:state", state);
    expect(state).toMatchObject({ ready: true, packaged: true });
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window: { webContents: { getURL(): string } }) => window.webContents.getURL()))).toContain("data:text/html,neutral");
  }, () => finishDesktop(desktop, profile, pids, child));
});
