import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { _electron } from "@playwright/test";
import { selectOutputIds, silenceWav } from "./desktop-shutdown-fixture-data.mjs";
import { observeNativeExit } from "./desktop-shutdown-exit.mjs";

// Fixed, bounded experiment. Do not add automatic kill/cleanup or profile reuse.
assert.equal(process.platform, "win32");
const require = createRequire(resolve("apps/desktop/package.json"));
const version = JSON.parse(await readFile(resolve("apps/desktop/package.json"), "utf8")).devDependencies.electron;
const executablePath = require("electron");
const workerPath = resolve("apps/desktop/out/Stream Jams-win32-x64/resources/app.asar/dist/service-worker.js");
const labels = (process.env.STREAM_JAMS_AUDIO_TEST_OUTPUTS ?? "System (Elgato Virtual Audio)|SFX (Elgato Virtual Audio)").split("|").map(label => label.trim());
const base = resolve("dist/diagnostics");
await mkdir(base, { recursive: true });
const root = await mkdtemp(join(base, "bl044-staged-"));
const report = { started: new Date().toISOString(), version, dwellMs: 70_000, exitDeadlineMs: 15_000, status: "running", samples: [] };
const save = () => writeFile(join(root, "results.json"), JSON.stringify(report, null, 2));
console.info("Isolated staged evidence:", root);
await save();

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}
function bounded(operation, ms) {
  return Promise.race([operation, delay(ms, undefined, { ref: false }).then(() => { throw new Error("Observer operation timed out"); })]);
}
async function unusedPort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function listening(port) {
  return globalThis.fetch(`http://127.0.0.1:${port}/health`, { signal: globalThis.AbortSignal.timeout(1000) }).then(() => true, error => {
    // A timeout/HTTP error is not proof the socket is gone; only refusal counts.
    if (error.cause?.code === "ECONNREFUSED") return false;
    throw error;
  });
}
async function dips(profile) {
  const files = {};
  for (const prefix of ["", "Partitions/stream-jams-audio/"]) for (const name of ["DIPS", "DIPS-wal", "DIPS-shm"]) {
    const file = prefix + name;
    files[file] = await stat(join(profile, file)).then(value => ({ bytes: value.size, modified: value.mtime.toISOString() }), error => { if (error.code === "ENOENT") return null; throw error; });
  }
  return files;
}

for (const stage of ["windows", "audio", "service", "service", "audio", "windows"]) {
  const sampleRoot = join(root, `${report.samples.length + 1}-${stage}`);
  await mkdir(sampleRoot);
  const profile = join(sampleRoot, "electron");
  const config = join(sampleRoot, "config.json");
  const port = await unusedPort();
  await writeFile(config, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(sampleRoot, "data"), assetDirectory: join(sampleRoot, "assets") } }));
  const sample = { stage, started: new Date().toISOString(), port, status: "starting", pids: [], events: [] };
  report.samples.push(sample);
  await save();
  let desktop;
  let child;
  let nativeExit;
  let quitRequested = false;
  try {
    const env = { ...process.env, STREAM_JAMS_CONFIG_PATH: config, STREAM_JAMS_DESKTOP_USER_DATA_PATH: profile, STREAM_JAMS_DIAG_STAGE: stage, STREAM_JAMS_DIAG_WORKER: workerPath };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.STREAM_JAMS_SHUTDOWN_LOG;
    desktop = await _electron.launch({ executablePath, args: [resolve("tests/desktop/fixtures/shutdown-probe.mjs")], cwd: sampleRoot, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    nativeExit = observeNativeExit(child);
    void nativeExit.catch(() => undefined); // Preserve rejection for the bounded await below.
    sample.pids.push(child.pid);
    desktop.on("console", message => {
      if (message.text().startsWith("shutdown-probe:")) sample.events.push(JSON.parse(message.text().slice("shutdown-probe:".length)));
    });
    const readyDeadline = Date.now() + 25_000;
    while (true) {
      const state = await bounded(desktop.evaluate(() => globalThis.shutdownProbe), 3000);
      if (state?.error) throw new Error(state.error);
      if (state?.ready) break;
      assert(Date.now() < readyDeadline, "Fixture did not become ready");
      await delay(100);
    }
    sample.runtime = await desktop.evaluate(({ app, BrowserWindow }) => ({
      versions: process.versions,
      unsafeSandboxSwitch: app.commandLine.hasSwitch("no-sandbox") || app.commandLine.hasSwitch("disable-gpu-sandbox"),
      hardwareAcceleration: app.isHardwareAccelerationEnabled(),
      windows: BrowserWindow.getAllWindows().map(window => ({
        persistent: window.webContents.session.isPersistent(), visible: window.isVisible(),
        sandbox: window.webContents.getLastWebPreferences().sandbox,
        contextIsolation: window.webContents.getLastWebPreferences().contextIsolation,
        nodeIntegration: window.webContents.getLastWebPreferences().nodeIntegration
      }))
    }));
    assert.equal(sample.runtime.versions.electron, version);
    assert.equal(sample.runtime.unsafeSandboxSwitch, false);
    assert.equal(sample.runtime.hardwareAcceleration, false);
    assert.equal(sample.runtime.windows.length, 2);
    assert(sample.runtime.windows.every(window => window.persistent && !window.visible && window.sandbox && window.contextIsolation && !window.nodeIntegration));
    sample.pids = [...new Set([...sample.pids, ...await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))])];
    if (stage === "service") assert.equal(await listening(port), true);
    if (stage !== "windows") {
      const page = desktop.windows().find(page => page.url() === "stream-jams-audio://player/");
      assert(page, "Audio fixture not found");
      const outputs = await page.evaluate(() => globalThis.shutdownAudioProbe.outputs());
      sample.availableLabels = outputs.map(output => output.label);
      const ids = selectOutputIds(outputs, labels);
      sample.selectedLabels = labels;
      sample.playback = [];
      const source = `data:audio/wav;base64,${silenceWav().toString("base64")}`;
      for (const targets of [[ids[0]], [ids[1]], ids]) {
        const playback = await page.evaluate(request => globalThis.shutdownAudioProbe.play(request), { source, ids: targets });
        assert(playback.every((result, index) => result.volume === 0 && result.ended && result.sinkId === targets[index]));
        sample.playback.push({ outputs: targets.map(id => labels[ids.indexOf(id)]), ended: true, volume: 0 });
      }
    }
    sample.status = "dwelling";
    await save();
    console.info(`${report.samples.length}/6 ${stage}: ready; silent, hidden 70-second dwell`);
    await delay(70_000);
    const beforeQuit = await desktop.evaluate(({ app }) => ({ state: globalThis.shutdownProbe, metrics: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, creationTime: metric.creationTime })) }));
    assert.equal(beforeQuit.state.error, null);
    if (stage === "service") {
      assert.equal(beforeQuit.state.workerExitCode, null, "Service exited before the intended Quit");
      assert.equal(await listening(port), true, "Service listener stopped before the intended Quit");
    }
    sample.events = beforeQuit.state.events;
    sample.metrics = beforeQuit.metrics;
    sample.pids = [...new Set([...sample.pids, ...beforeQuit.metrics.map(metric => metric.pid), ...(beforeQuit.state.servicePid ? [beforeQuit.state.servicePid] : [])])];
    await save();
    const start = performance.now();
    const deadline = Date.now() + report.exitDeadlineMs;
    quitRequested = true;
    await bounded(desktop.evaluate(() => { void globalThis.quitShutdownProbe(); }), Math.max(1, deadline - Date.now()));
    sample.exitCode = await bounded(nativeExit, Math.max(1, deadline - Date.now()));
    while (sample.pids.some(alive) && Date.now() < deadline) await delay(50);
    sample.nativeExitMs = Math.round(performance.now() - start);
    sample.remainingPids = sample.pids.filter(alive);
    sample.listenerPresent = await listening(port);
    assert(sample.nativeExitMs <= report.exitDeadlineMs, "Native observation exceeded the 15-second deadline");
    assert.deepEqual(sample.remainingPids, [], "Captured native processes exceeded the 15-second deadline");
    assert.equal(sample.exitCode, 0);
    assert.equal(sample.listenerPresent, false);
    sample.dips = await dips(profile);
    sample.status = "passed";
    console.info(`${report.samples.length}/6 ${stage}: native exit ${sample.nativeExitMs} ms, captured processes/listener absent`);
  } catch (error) {
    sample.status = "failed";
    sample.error = error.message;
    // Read-only diagnostic observations; ordinary Quit only if not requested yet.
    if (desktop && child?.exitCode === null) {
      const observation = await bounded(desktop.evaluate(({ app }) => ({ state: globalThis.shutdownProbe, pids: app.getAppMetrics().map(metric => metric.pid) })), 1000).catch(() => null);
      sample.failureState = observation?.state ?? null;
      sample.pids = [...new Set([...sample.pids, ...(observation?.pids ?? [])])];
      if (!quitRequested) {
        const deadline = Date.now() + report.exitDeadlineMs;
        await bounded(desktop.evaluate(() => { void globalThis.quitShutdownProbe(); }), report.exitDeadlineMs).catch(() => {});
        while (sample.pids.some(alive) && Date.now() < deadline) await delay(100);
      }
    }
    sample.remainingPids = sample.pids.filter(alive);
    report.status = "failed; batch stopped; no forced cleanup";
    console.error(`${stage} failed: ${error.message}; remaining captured PIDs: ${sample.remainingPids.join(", ")}`);
    await save();
    process.exitCode = 1;
    break;
  }
  await save();
}
if (report.samples.length === 6 && report.samples.every(sample => sample.status === "passed")) report.status = "completed; intermittent defect not reproduced, not proven fixed";
report.finished = new Date().toISOString();
await save();
console.info(report.status, join(root, "results.json"));
