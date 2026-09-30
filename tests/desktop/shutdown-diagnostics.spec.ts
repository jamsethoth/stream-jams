import type { ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { windowByUrl, withCleanup } from "./audio-harness.js";
import { observeGuardReady } from "./guard-ready.js";
import { withShutdownEvidence } from "./shutdown-evidence.js";

test("opt-in shutdown evidence separates Cancel from cleanup and native exit", async () => {
  const testInfo = test.info();
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
    const text = await readFile(file, "utf8").catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; });
    return text.split("\n").slice(0, -1).map(line => JSON.parse(line) as { phase: string; attempt: number });
  };
  await withShutdownEvidence(async () => {
    desktop = await _electron.launch({ executablePath: resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe"), cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    if (child.pid !== undefined) pids.add(child.pid);
    await desktop.evaluate(({ dialog }) => {
      const observed = globalThis as typeof globalThis & { shutdownDialogs?: Array<{ message: string; respond: ((response: number) => void) | null }> };
      observed.shutdownDialogs = [];
      const original = dialog.showMessageBox.bind(dialog);
      dialog.showMessageBox = ((...args: Parameters<typeof dialog.showMessageBox>) => {
        const options = args.at(-1) as Electron.MessageBoxOptions;
        if (!options.message?.includes("Management cannot confirm whether your changes are saved")) return original(...args);
        return new Promise<Electron.MessageBoxReturnValue>(resolve => observed.shutdownDialogs!.push({ message: options.message!, respond: response => resolve({ response, checkboxChecked: false }) }));
      }) as typeof dialog.showMessageBox;
    });
    expect(await desktop.evaluate(({ crashReporter }) => crashReporter.getUploadToServer())).toBe(false);
    const page = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await page.waitForLoadState("load");
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Close window to tray" })).toBeVisible();
    await desktop.evaluate(observeGuardReady, `http://127.0.0.1:${port}`);
    await withCleanup(async () => {
      await page.getByRole("checkbox", { name: "Close window to tray" }).uncheck();
      await expect.poll(() => desktop!.evaluate(() => (globalThis as typeof globalThis & { shutdownGuard?: { ready: boolean } }).shutdownGuard?.ready)).toBe(true);
    }, async () => {
      await desktop!.evaluate(() => (globalThis as typeof globalThis & { shutdownGuard?: { dispose(): void } }).shutdownGuard?.dispose());
    });
    const identities = await desktop.evaluate(({ app, BrowserWindow }) => ({ pids: app.getAppMetrics().map(entry => entry.pid), persistent: BrowserWindow.getAllWindows().map(window => window.webContents.session.isPersistent()) }));
    identities.pids.forEach(pid => pids.add(pid));
    expect(identities.persistent.every(Boolean)).toBe(true);
    await desktop.evaluate(({ app }) => app.quit());
    const decision = page.getByRole("dialog", { name: "Leave with unsaved changes?" });
    await decision.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await desktop.evaluate(() => (globalThis as typeof globalThis & { shutdownDialogs?: unknown[] }).shutdownDialogs)).toEqual([]);
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
  }, async () => {
    // Preserve diagnostics. Only request ordinary Quit; a timeout is not permission to kill.
    if (desktop !== undefined && child?.exitCode === null) {
      const closed = desktop.waitForEvent("close", { timeout: 15_000 });
      void closed.catch(() => undefined);
      await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
      await desktop.evaluate(() => {
        const observed = globalThis as typeof globalThis & { shutdownDialogs?: Array<{ respond: ((response: number) => void) | null }> };
        for (const dialog of observed.shutdownDialogs ?? []) { dialog.respond?.(1); dialog.respond = null; }
      }).catch(() => undefined);
      const page = desktop.windows().find(page => page.url().startsWith(`http://127.0.0.1:${port}/manage`));
      if (page !== undefined) await page.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click({ timeout: 2000 }).catch(() => undefined);
      await closed;
    }
  }, async () => {
    console.info("Shutdown phase evidence retained:", root, "captured PIDs:", [...pids]);
    const bounded = (await readFile(file, "utf8").catch(() => "")).slice(0, 64 * 1024);
    const phases = bounded.slice(0, bounded.lastIndexOf("\n") + 1);
    const phaseArtifact = testInfo.outputPath("shutdown-phases.jsonl");
    const fixtureArtifact = testInfo.outputPath("shutdown-fixture.json");
    await writeFile(phaseArtifact, phases);
    await writeFile(fixtureArtifact, JSON.stringify({ root, pids: [...pids], exitCode: child?.exitCode }));
    await testInfo.attach("shutdown-phases", { path: phaseArtifact, contentType: "application/x-ndjson" });
    await testInfo.attach("shutdown-fixture", { path: fixtureArtifact, contentType: "application/json" });
  });
});

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}
