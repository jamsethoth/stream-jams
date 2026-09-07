import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";

test("bundled utility worker starts, acknowledges persisted mute, and exits after stop", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-utility-test-"));
  const require = createRequire(resolve("apps/desktop/package.json"));
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected a temporary TCP port");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port: address.port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  const desktop = await _electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("tests/desktop/fixtures/utility-host.mjs"), resolve("apps/desktop/out/Stream Jams-win32-x64/resources/app.asar/dist/service-worker.js")],
    cwd: root, env, chromiumSandbox: true, timeout: 30_000
  });
  const mainPid = await desktop.evaluate(() => process.pid);
  let cleanupFailure: unknown;
  try {
    const observation = await desktop.evaluate(async () => {
      const state = globalThis as typeof globalThis & {
        workerObservation: { messages: Array<{ type: string; url?: string }>; stderr: string; exited: boolean };
      };
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && !state.workerObservation.exited && !state.workerObservation.messages.some((item) => item.type === "ready" || item.type === "failed")) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return state.workerObservation;
    });
    expect(observation.messages, JSON.stringify(observation)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ready" })]));
    expect(observation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "audio-request", command: { type: "set-muted", muted: false } })
    ]));
    await desktop.evaluate((_electron, requestId) => {
      const state = globalThis as typeof globalThis & { ownedWorker: { postMessage(message: unknown): void } };
      state.ownedWorker.postMessage({ type: "set-muted", generation: 1, requestId, muted: true });
    }, randomUUID());
    await expect.poll(() => desktop.evaluate(() => (globalThis as typeof globalThis & { workerObservation: { messages: unknown[] } }).workerObservation.messages)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "playback-state-changed", muted: true })]));
    await desktop.evaluate((_electron, requestId) => {
      const state = globalThis as typeof globalThis & { ownedWorker: { postMessage(message: unknown): void } };
      state.ownedWorker.postMessage({ type: "stop", generation: 1, requestId });
    }, randomUUID());
    await expect.poll(() => desktop.evaluate(() => (globalThis as typeof globalThis & { workerObservation: { exited: boolean } }).workerObservation.exited), { timeout: 10_000 }).toBe(true);
  } catch (error) {
    console.error("Utility worker check failed:", error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await desktop.evaluate(() => {
      (globalThis as typeof globalThis & { ownedWorker?: { kill(): boolean } }).ownedWorker?.kill();
    }).catch(() => undefined);
    // Close also detaches the Node inspector; otherwise Windows keeps the
    // Electron process (and its current directory) alive after app.exit/quit.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([desktop.close().then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 5_000); })]);
    clearTimeout(timer);
    if (!closed) {
      cleanupFailure = new Error("The Electron test host did not exit after its worker stopped.");
      await promisify(execFile)("taskkill.exe", ["/PID", String(mainPid), "/T", "/F"], { windowsHide: true, timeout: 5_000 }).catch(() => undefined);
    }
    try { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    catch (error) { cleanupFailure ??= error; console.warn(`Utility test cleanup failed: ${root}`); }
  }
  if (cleanupFailure !== undefined) throw cleanupFailure;
});
