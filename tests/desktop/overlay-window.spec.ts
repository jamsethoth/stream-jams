import { access, cp, mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { _electron, expect, test } from "@playwright/test";
import { finishDesktop, withCleanup } from "./audio-harness.js";
import { cleanupFailedOverlayLaunch } from "./overlay-harness.js";

test("packaged native overlay policy and neutral 1080p/1440p media probe", async () => {
  const testInfo = test.info();
  const media = [
    { width: 1920, height: 1080, path: resolve("tests/fixtures/media/neutral-1080.webm") },
    { width: 2560, height: 1440, path: resolve("tests/fixtures/media/neutral-1440.webm") }
  ];
  await Promise.all(media.map(clip => access(clip.path)));

  const require = createRequire(resolve("apps/desktop/package.json"));
  const electronPath = require("electron") as string;
  const packaged = testInfo.outputPath("packaged-probe");
  await cp(dirname(electronPath), packaged, { recursive: true });
  const appRoot = join(packaged, "resources", "app");
  await mkdir(join(appRoot, "overlay"), { recursive: true });
  for (const file of ["overlay-window.js", "overlay-window-policy.js"]) {
    await cp(resolve("apps/desktop/dist/overlay", file), join(appRoot, "overlay", file));
  }
  await writeFile(join(appRoot, "package.json"), JSON.stringify({ name: "stream-jams-overlay-probe", version: "1.0.0", type: "module", main: "main.mjs" }));
  await writeFile(join(appRoot, "main.mjs"), `
    import { app, BrowserWindow, screen } from 'electron';
    import { OverlayWindow } from './overlay/overlay-window.js';
    app.disableHardwareAcceleration();
    app.setPath('userData', process.env.STREAM_JAMS_PROBE_PROFILE);
    app.on('window-all-closed', () => {});
    void app.whenReady().then(async () => {
    const management = new BrowserWindow({show:false, title:'Owned overlay probe management'});
    await management.loadURL('data:text/html,<body style="background:magenta">Owned probe</body>');
    const selectedId = String(screen.getAllDisplays()[0].id);
    const overlay = OverlayWindow.create({enabled:true,selectedId});
    Object.assign(globalThis,{probe:{management,overlay,selectedId}});
    app.on('before-quit',()=>{overlay.destroy();management.destroy();});
    });
  `);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-overlay-probe-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_PROBE_PROFILE = root;
  const executablePath = join(packaged, "Overlay Probe.exe");
  await rename(join(packaged, "electron.exe"), executablePath);
  let desktop: Awaited<ReturnType<typeof _electron.launch>>;
  try {
    desktop = await _electron.launch({ executablePath, env, chromiumSandbox: true, timeout: 30_000 });
  } catch (error) {
    try { await cleanupFailedOverlayLaunch(executablePath); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Overlay probe launch and cleanup failed.", { cause: cleanupError }); }
    throw error;
  }
  const child = desktop.process();
  const pids: number[] = [];
  await withCleanup(async () => {
    await expect.poll(() => desktop.evaluate(() => Boolean((globalThis as ProbeGlobal).probe))).toBe(true);
    pids.push(...await desktop.evaluate(({ app }) => app.getAppMetrics().map((entry: { pid: number }) => entry.pid)));
    const state = await desktop.evaluate(({ app, screen }) => {
      const { overlay, selectedId } = (globalThis as ProbeGlobal).probe!;
      return { packaged: app.isPackaged, visible: overlay.window.isVisible(), focusable: overlay.window.isFocusable(), topmost: overlay.window.isAlwaysOnTop(), selectedId, displays: screen.getAllDisplays().map((display: { id: number; bounds: unknown; scaleFactor: number }) => ({ id: String(display.id), bounds: display.bounds, scaleFactor: display.scaleFactor })) };
    });
    expect(state).toMatchObject({ packaged: true, visible: false, focusable: false, topmost: true });
    const handle = await desktop.evaluate(() => (globalThis as ProbeGlobal).probe!.overlay.window.getNativeWindowHandle().readBigUInt64LE().toString());
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
      Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class OverlayProbeNative { [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr window, int index); }';
      $overlayProbeStyle = [OverlayProbeNative]::GetWindowLongPtr([IntPtr]::new([long]${handle}), -20).ToInt64();
      ConvertTo-Json -Compress @{ toolWindow = (($overlayProbeStyle -band 0x80) -ne 0); appWindow = (($overlayProbeStyle -band 0x40000) -ne 0); noActivate = (($overlayProbeStyle -band 0x8000000) -ne 0); transparent = (($overlayProbeStyle -band 0x20) -ne 0) }
    `], { windowsHide: true, timeout: 10_000 });
    const styles = JSON.parse(stdout) as unknown;
    await testInfo.attach("native-window-styles", { body: stdout, contentType: "application/json" });
    // Electron 44.1.1 uses ITaskbarList::DeleteTab for skipTaskbar, not WS_EX_TOOLWINDOW.
    // https://github.com/electron/electron/blob/v44.1.1/shell/browser/native_window_views.cc#L1165
    // Taskbar absence therefore remains a separate physical acceptance check.
    expect(styles).toMatchObject({ appWindow: false, noActivate: true, transparent: true });
    await testInfo.attach("display-observation", { body: JSON.stringify(state, null, 2), contentType: "application/json" });
    const measurements = [];
    for (const clip of media) {
      const html = `<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}video{width:100vw;height:100vh;object-fit:contain}</style><video muted autoplay src="${pathToFileURL(clip.path).href}"></video>`;
      const htmlPath = testInfo.outputPath(`probe-${clip.height}.html`);
      await writeFile(htmlPath, html);
      await desktop.evaluate(async (_, url) => { await (globalThis as ProbeGlobal).probe!.overlay.load(url); }, pathToFileURL(htmlPath).href);
      const overlayPage = desktop.windows().find(page => page.url() === pathToFileURL(htmlPath).href)!;
      await expect(overlayPage.locator("video")).toHaveJSProperty("muted", true);
      await expect.poll(() => overlayPage.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1);
      const decoded = await overlayPage.locator("video").evaluate((video: HTMLVideoElement) => {
        const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext("2d")!; context.drawImage(video, 0, 0);
        const alpha = context.getImageData(canvas.width - 1, canvas.height - 1, 1, 1).data[3];
        const quality = video.getVideoPlaybackQuality();
        return { width: video.videoWidth, height: video.videoHeight, cornerAlpha: alpha, totalVideoFrames: quality.totalVideoFrames, droppedVideoFrames: quality.droppedVideoFrames };
      });
      expect(decoded).toMatchObject({ width: clip.width, height: clip.height });
      expect(decoded.cornerAlpha, "Neutral recorded fixture must decode a transparent corner; failure indicates recorder/decoded-asset alpha loss, not native compositor failure.").toBe(0);
      await desktop.evaluate(() => (globalThis as ProbeGlobal).probe!.management.hide());
      expect(await desktop.evaluate(() => (globalThis as ProbeGlobal).probe!.overlay.window.isVisible())).toBe(true);
      await expect.poll(() => overlayPage.locator("video").evaluate((element: HTMLVideoElement) => element.ended)).toBe(true);
      const completed = await overlayPage.locator("video").evaluate((video: HTMLVideoElement) => {
        const quality = video.getVideoPlaybackQuality();
        return { currentTime: video.currentTime, totalVideoFrames: quality.totalVideoFrames, droppedVideoFrames: quality.droppedVideoFrames };
      });
      measurements.push({ ...decoded, completed });
    }
    await testInfo.attach("decoded-media-observation", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
    console.info("Decoded neutral probe:", measurements);
    // These measurements deliberately do not certify physical transparency, input or smoothness.
  }, async () => {
    const started = Date.now();
    await finishDesktop(desktop, root, pids, child);
    const elapsedMs = Date.now() - started;
    console.info(`Confirmed owned overlay Quit and native process exit: ${elapsedMs}ms`);
    await testInfo.attach("native-quit", { body: JSON.stringify({ elapsedMs, exitCode: child.exitCode, signalCode: child.signalCode }), contentType: "application/json" });
  });
});

interface ProbeWindow {
  isVisible(): boolean; isFocusable(): boolean; isAlwaysOnTop(): boolean; hide(): void;
  getNativeWindowHandle(): Buffer;
}
type ProbeGlobal = typeof globalThis & { probe?: { selectedId: string; management: ProbeWindow; overlay: { window: ProbeWindow; load(url: string): Promise<void> } } };
