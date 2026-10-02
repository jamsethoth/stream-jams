import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { finishDesktop, withCleanup } from "./audio-harness.js";
import { cleanupFailedOverlayLaunch } from "./overlay-harness.js";

interface OwnedWindow { destroy(): void; show(): void; focus(): void; webContents: { executeJavaScript(code: string): Promise<unknown> } }
interface Probe { baseline: OwnedWindow; competitors: OwnedWindow[]; overlay: { load(url: string): Promise<void>; destroy(): void }; marker: string; handles: { baseline: string; overlay: string; competitors: string[] } }
type ProbeGlobal = typeof globalThis & { topmostProbe?: Probe };
interface Sample { elapsedMs: number; overlayAbove: boolean; foreground: string; overlayVisible: boolean; style: number }
interface Observation { samples: Sample[]; latencyMs: number; initialForeground: string }

test("@hardware owned Windows topmost recovery, composition and native input", async () => runNativeCompetition(false));
test("@hardware background native order only", async () => runNativeCompetition(true));

async function runNativeCompetition(backgroundOnly: boolean): Promise<void> {
  test.skip(process.platform !== "win32", "Requires an interactive Windows desktop");
  test.setTimeout(180_000);
  const info = test.info();
  const require = createRequire(resolve("apps/desktop/package.json"));
  const electronPath = require("electron") as string;
  const packaged = info.outputPath("topmost-probe");
  await cp(dirname(electronPath), packaged, { recursive: true });
  const appRoot = join(packaged, "resources", "app");
  await mkdir(join(appRoot, "overlay"), { recursive: true });
  for (const file of ["overlay-window.js", "overlay-window-policy.js"]) await cp(resolve("apps/desktop/dist/overlay", file), join(appRoot, "overlay", file));
  await cp(resolve("tests/desktop/fixtures/overlay-topmost-main.mjs"), join(appRoot, "main.mjs"));
  await writeFile(join(appRoot, "package.json"), JSON.stringify({ name: "owned-topmost-probe", version: "1.0.0", type: "module", main: "main.mjs" }));
  const executablePath = join(packaged, "Owned Topmost Probe.exe");
  await rename(join(packaged, "electron.exe"), executablePath);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-topmost-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_PROBE_PROFILE = root;
  const launchLog = info.outputPath("topmost-launch.log");
  env.STREAM_JAMS_PROBE_LAUNCH_LOG = launchLog;
  const attachLaunchLog = async () => {
    const body = await readFile(launchLog, "utf8").catch((error: unknown) => `Launch log unavailable: ${String(error)}`);
    await info.attach("topmost-launch", { body, contentType: "text/plain" });
  };
  let desktop: Awaited<ReturnType<typeof _electron.launch>>;
  try { desktop = await _electron.launch({ executablePath, env, chromiumSandbox: true, timeout: 60_000 }); }
  catch (error) {
    try {
      await cleanupFailedOverlayLaunch(executablePath);
      await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
      await attachLaunchLog();
    }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Owned topmost launch and cleanup failed", { cause: cleanupError }); }
    throw error;
  }
  const child = desktop.process();
  const evidence: unknown[] = [{ scope: backgroundOnly ? "background native order only; no pixels/focus/input acceptance" : "interactive native order, composed pixels, foreground and input" }];
  await withCleanup(async () => {
    for (const file of ["overlay-window", "overlay-window-policy"]) {
      const hashes = await Promise.all([resolve(`apps/desktop/src/overlay/${file}.ts`), resolve(`apps/desktop/dist/overlay/${file}.js`), join(appRoot, "overlay", `${file}.js`)].map(async path => ({ path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") })));
      evidence.push({ file, hashes });
      expect(hashes[1]!.sha256).toBe(hashes[2]!.sha256);
    }
    await expect.poll(() => desktop.evaluate(() => Boolean((globalThis as ProbeGlobal).topmostProbe))).toBe(true);
    const handles = await desktop.evaluate(() => (globalThis as ProbeGlobal).topmostProbe!.handles);
    const mainPid = await desktop.evaluate(() => process.pid);
    evidence.push({ mainPid, launcherPid: child.pid, handles });
    const native = async (overlay: string, competitor: string, action: string, extra: string[] = []) => {
      const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", resolve("tests/desktop/fixtures/overlay-topmost-native.ps1"), "-Overlay", overlay, "-Competitor", competitor, "-OwnerPid", String(mainPid), "-Action", action, ...extra], { windowsHide: true, timeout: 15_000 });
      const observation: unknown = JSON.parse(stdout);
      evidence.push({ action, overlay, competitor, observation });
      return observation;
    };
    const first = handles.competitors[0]!;
    const focusCompetitor = async (index: number) => desktop.evaluate((_, ownedIndex) => {
      const competitor = (globalThis as ProbeGlobal).topmostProbe!.competitors[ownedIndex]!;
      competitor.show();
      competitor.focus();
    }, index);
    const raiseAction = backgroundOnly ? "background-raise" : "raise";
    if (!backgroundOnly) await focusCompetitor(0);
    const baseline = await native(handles.baseline, first, raiseAction, ["-Baseline"]) as Observation;
    expect(baseline.samples.length).toBeGreaterThan(1);
    expect(baseline.samples.every(sample => !sample.overlayAbove && sample.foreground === (backgroundOnly ? baseline.initialForeground : first))).toBe(true);
    if (!backgroundOnly) {
      const baselineCapture = info.outputPath("baseline-compositor.png");
      const covered = await native(handles.baseline, first, "capture", ["-CapturePath", baselineCapture]) as { center: { r: number; g: number; b: number } };
      await info.attach("covered-baseline-compositor", { path: baselineCapture, contentType: "image/png" });
      expect(covered.center).toEqual({ r: 18, g: 52, b: 86 });
    }
    await desktop.evaluate(async () => { const probe = (globalThis as ProbeGlobal).topmostProbe!; probe.baseline.destroy(); await probe.overlay.load(probe.marker); });
    // No ensureTopmost call: all corrections below are the production fallback.
    let overtakenTrials = 0;
    for (const index of [0, 0, 1, 0, 1, 0]) {
      const competitor = handles.competitors[index]!;
      if (!backgroundOnly) await focusCompetitor(index);
      const result = await native(handles.overlay, competitor, raiseAction) as Observation;
      if (result.samples.some(sample => !sample.overlayAbove)) overtakenTrials++;
      expect(result.samples.every(sample => sample.foreground === (backgroundOnly ? result.initialForeground : competitor))).toBe(true);
      expect(result.samples.at(-1)).toMatchObject({ overlayAbove: true, overlayVisible: true });
      expect(result.latencyMs).toBeLessThanOrEqual(1000);
      const style = result.samples.at(-1)!.style;
      expect(style & 0x8000000).not.toBe(0); // WS_EX_NOACTIVATE
      expect(style & 0x20).not.toBe(0); // WS_EX_TRANSPARENT
      expect(style & 0x8).not.toBe(0); // WS_EX_TOPMOST
    }
    expect(overtakenTrials, "Candidate competition is inconclusive unless User32 observes actual occlusion before recovery").toBeGreaterThan(0);
    if (!backgroundOnly) {
      const capturePath = info.outputPath("candidate-compositor.png");
      const composed = await native(handles.overlay, first, "capture", ["-CapturePath", capturePath]) as { center: { r: number; g: number; b: number } };
      await info.attach("candidate-compositor", { path: capturePath, contentType: "image/png" });
      expect(composed.center).toEqual({ r: 255, g: 0, b: 255 });
      await native(handles.overlay, first, "input");
      await expect.poll(() => desktop.evaluate(async () => (globalThis as ProbeGlobal).topmostProbe!.competitors[0]!.webContents.executeJavaScript("window.events"))).toEqual(expect.arrayContaining([{ type: "mouse", button: 0 }, { type: "key", key: "F8" }]));
    }
    await desktop.evaluate(() => (globalThis as ProbeGlobal).topmostProbe!.overlay.destroy());
    expect(await native(handles.overlay, first, "gone")).toEqual({ exists: false });
    // A later observation also catches a queued recovery callback resurrecting a surface.
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(await native(handles.overlay, first, "gone")).toEqual({ exists: false });
  }, async () => {
    try {
      const evidencePath = info.outputPath("native-topmost-evidence.json");
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      await info.attach("native-topmost-evidence", { path: evidencePath, contentType: "application/json" });
      await attachLaunchLog();
    }
    finally { await finishDesktop(desktop, root, [], child); }
  });
}
