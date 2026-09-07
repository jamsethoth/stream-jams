import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron, expect, test } from "@playwright/test";
import { windowByUrl } from "./audio-harness.js";

const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");

test("runnable Windows executable is produced", async () => {
  await access(executablePath);
});

test("packaged app serves its built UI, preserves close preference, and shuts down its listener", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-smoke-"));
  let desktop: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  let mainPid: number | undefined;
  let cleanupFailure: unknown;
  try {
  await test.step("Copy the self-contained package outside the checkout", async () => {
    // Native parallel copying keeps thousands of packaged dependency files out
    // of Node's serial per-file copy path. Robocopy codes 0-7 are success.
    try {
      await promisify(execFile)("robocopy.exe", [dirname(executablePath), join(root, "app"), "/E", "/MT:8", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { timeout: 120_000, windowsHide: true });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "number" || error.code >= 8) throw error;
    }
  });
  const isolatedExecutable = join(root, "app", "Stream Jams.exe");
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
    desktop = await test.step("Launch the actual executable with its isolated profile", () => _electron.launch({ executablePath: isolatedExecutable, cwd: root, env, chromiumSandbox: true, timeout: 30_000 }));
    mainPid = await desktop.evaluate(() => process.pid);
    console.info("Packaged Electron launch connected.");
    desktop.on("console", (message) => { if (message.text().startsWith("Desktop native error:")) console.error(message.text()); });
    // Observe native startup errors without leaving an unattended Retry dialog.
    await desktop.evaluate(({ dialog }) => {
      const observed = globalThis as typeof globalThis & { desktopTestErrors?: string[] };
      observed.desktopTestErrors = [];
      dialog.showErrorBox = (title: string, content: string) => {
        observed.desktopTestErrors!.push(`${title}: ${content}`);
        console.error(`Desktop native error: ${title}: ${content}`);
      };
      dialog.showMessageBox = async (...args: unknown[]) => {
        const options = args.at(-1) as { message?: string };
        observed.desktopTestErrors!.push(options.message ?? "Native error");
        // Quit only this isolated test app if native recovery is necessary.
        return { response: 1, checkboxChecked: false };
      };
    });
    const window = await test.step("Wait for the management window", async () => {
      try { return await windowByUrl(desktop!, `http://127.0.0.1:${port}/manage`); }
      catch (error) {
        const errors = await desktop!.evaluate(() => (globalThis as typeof globalThis & { desktopTestErrors?: string[] }).desktopTestErrors);
        if (errors?.length) throw new Error(`Native startup failed: ${errors.join("; ")}`, { cause: error });
        throw error;
      }
    });
    await expect(window).toHaveURL(`http://127.0.0.1:${port}/manage`);
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    expect(await desktop.evaluate(({ app }) => app.getAppPath())).not.toContain("6907");
    expect(await window.evaluate(() => typeof (globalThis as Record<string, unknown>).require)).toBe("undefined");
    // Native SQLite/keyring round trips run in native-binary.spec.ts. The
    // inspector evaluator does not provide Node's dynamic-import callback.
    expect(await window.evaluate(() => typeof (globalThis as typeof globalThis & { streamJamsDesktop?: { onQuitRequested: unknown } }).streamJamsDesktop?.onQuitRequested)).toBe("function");
    await window.getByRole("link", { name: "Settings", exact: true }).click();
    const closeToTray = window.getByRole("checkbox", { name: "Close window to tray" });
    await expect(closeToTray).toBeChecked();
    await closeToTray.uncheck();
    // Hiding preserves a dirty draft and keeps the service alive.
    await desktop.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))!.close(); });
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))!.isVisible())).toBe(false);
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    await desktop.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))!.show(); });
    await expect(closeToTray).not.toBeChecked();
    await desktop.evaluate(({ app }) => { app.quit(); });
    const dirtyQuit = window.getByRole("dialog", { name: "Leave with unsaved changes?" });
    await dirtyQuit.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    await expect(closeToTray).not.toBeChecked();
    const closed = desktop.waitForEvent("close");
    await desktop.evaluate(({ app }) => { app.quit(); });
    await dirtyQuit.getByRole("button", { name: "Save and leave", exact: true }).click();
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false), { timeout: 10_000 }).toBe(false);
    await desktop.close();
    await closed;
    desktop = undefined;
    expect(JSON.parse(await readFile(configPath, "utf8")).desktop).toEqual({ closeToTray: false });
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false)).toBe(false);

    desktop = await _electron.launch({ executablePath: isolatedExecutable, cwd: root, env, chromiumSandbox: true });
    mainPid = await desktop.evaluate(() => process.pid);
    const reopened = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await reopened.getByRole("link", { name: "Settings", exact: true }).click();
    const reopenedCloseToTray = reopened.getByRole("checkbox", { name: "Close window to tray" });
    await expect(reopenedCloseToTray).not.toBeChecked();
    await reopenedCloseToTray.check();
    const stopped = desktop.waitForEvent("close");
    await desktop.evaluate(({ app }) => { app.quit(); });
    await reopened.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click();
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false), { timeout: 10_000 }).toBe(false);
    await desktop.close();
    await stopped;
    desktop = undefined;
    expect(JSON.parse(await readFile(configPath, "utf8")).desktop).toEqual({ closeToTray: false });

    desktop = await _electron.launch({ executablePath: isolatedExecutable, cwd: root, env, chromiumSandbox: true });
    mainPid = await desktop.evaluate(() => process.pid);
    const failedSaveWindow = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await failedSaveWindow.getByRole("link", { name: "Settings", exact: true }).click();
    const failedSaveCloseToTray = failedSaveWindow.getByRole("checkbox", { name: "Close window to tray" });
    await expect(failedSaveCloseToTray).not.toBeChecked();
    await failedSaveCloseToTray.check();
    await failedSaveWindow.route("**/config/desktop", async (route) => {
      if (route.request().method() !== "PATCH") { await route.continue(); return; }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        json: { error: { code: "TEST_WRITE_FAILED", message: "Injected desktop settings save failure." } }
      });
    });
    const failedSaveClosed = desktop.waitForEvent("close");
    await desktop.evaluate(({ app }) => { app.quit(); });
    const failedSaveQuit = failedSaveWindow.getByRole("dialog", { name: "Leave with unsaved changes?" });
    await failedSaveQuit.getByRole("button", { name: "Save and leave", exact: true }).click();
    await expect(failedSaveQuit.getByRole("alert")).toContainText("Injected desktop settings save failure. (TEST_WRITE_FAILED)");
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    await expect(failedSaveCloseToTray).toBeChecked();
    expect(JSON.parse(await readFile(configPath, "utf8")).desktop).toEqual({ closeToTray: false });
    await failedSaveQuit.getByRole("button", { name: "Discard", exact: true }).click();
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false), { timeout: 10_000 }).toBe(false);
    await desktop.close();
    await failedSaveClosed;
    desktop = undefined;
  } finally {
    if (desktop !== undefined) {
      const ownedPid = mainPid;
      const closed = desktop.waitForEvent("close", { timeout: 10_000 });
      void desktop.close().catch(() => undefined);
      try { await closed; }
      catch {
        if (ownedPid !== undefined) {
          // Only the exact process tree returned by this test's launch is owned.
          await promisify(execFile)("taskkill.exe", ["/PID", String(ownedPid), "/T", "/F"], { windowsHide: true, timeout: 5_000 }).catch(() => undefined);
        }
      }
    }
    try { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
    catch (error) {
      cleanupFailure = error;
      console.warn(`Temporary desktop cleanup also failed: ${root}`);
    }
  }
  if (cleanupFailure !== undefined) throw cleanupFailure;
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
