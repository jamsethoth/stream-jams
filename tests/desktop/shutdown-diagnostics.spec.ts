import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { windowByUrl } from "./audio-harness.js";

test("opt-in shutdown evidence separates Cancel from cleanup and native exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-shutdown-phases-"));
  const file = join(root, "phases.jsonl");
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected an isolated port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const config = join(root, "config.json");
  await writeFile(config, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  env.STREAM_JAMS_CONFIG_PATH = config;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  env.STREAM_JAMS_SHUTDOWN_LOG = file;
  delete env.ELECTRON_RUN_AS_NODE;
  let desktop: ElectronApplication | undefined;
  let child: ChildProcess | undefined;
  const pids = new Set<number>();
  const rows = async (): Promise<{ phase: string; attempt: number }[]> => {
    const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
    return text.split("\n").slice(0, -1).map(line => JSON.parse(line) as { phase: string; attempt: number });
  };
  try {
    desktop = await _electron.launch({ executablePath: resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe"), cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    const page = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await page.waitForLoadState("load");
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("checkbox", { name: "Close window to tray" }).uncheck();
    const identities = await desktop.evaluate(({ app, BrowserWindow }) => ({ pids: app.getAppMetrics().map(entry => entry.pid), persistent: BrowserWindow.getAllWindows().map(window => window.webContents.session.isPersistent()) }));
    identities.pids.forEach(pid => pids.add(pid));
    expect(identities.persistent.every(Boolean)).toBe(true);
    await desktop.evaluate(({ app }) => app.quit());
    const decision = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
    await decision.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    await expect.poll(async () => (await rows()).some(row => row.phase === "decision-cancelled")).toBe(true);
    expect((await rows()).some(row => row.phase === "service-stop-requested")).toBe(false);
    const closed = desktop.waitForEvent("close", { timeout: 15_000 });
    void closed.catch(() => undefined);
    await desktop.evaluate(({ app }) => app.quit());
    const deadline = Date.now() + 15_000;
    await decision.getByRole("button", { name: "Discard", exact: true }).click();
    await closed;
    await expect.poll(() => [...pids].filter(isAlive), { timeout: Math.max(1, deadline - Date.now()) }).toEqual([]);
    expect(child.exitCode).toBe(0);
    desktop = undefined;
    const evidence = await rows();
    expect(evidence.find(row => row.phase === "decision-cancelled")?.attempt).toBe(1);
    const expected = ["quit-requested", "decision-accepted", "service-stop-requested", "service-stop-completed", "audio-close-requested", "audio-closed", "windows-destroy-requested", "windows-destroyed", "electron-quit-requested", "electron-will-quit", "electron-quit"];
    expect(evidence.filter(row => row.attempt === 2 && expected.includes(row.phase)).map(row => row.phase)).toEqual(expected);
    expect(await fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false)).toBe(false);
  } finally {
    // Preserve diagnostics. Only request ordinary Quit; a timeout is not permission to kill.
    if (desktop !== undefined && child?.exitCode === null) {
      const closed = desktop.waitForEvent("close", { timeout: 15_000 });
      void closed.catch(() => undefined);
      await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
      const page = desktop.windows().find(page => page.url().startsWith(`http://127.0.0.1:${port}/manage`));
      if (page !== undefined) await page.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click({ timeout: 2000 }).catch(() => undefined);
      await closed;
    }
    console.info("Shutdown phase evidence retained:", root, "captured PIDs:", [...pids]);
  }
});

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}
