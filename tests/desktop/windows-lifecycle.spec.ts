import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { windowByUrl } from "./audio-harness.js";

const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");

test("a duplicate launch reopens the existing instance without starting another service", async () => {
  const fixture = await desktopFixture("duplicate");
  let desktop: ElectronApplication | undefined;
  let mainPid: number | undefined;
  try {
    desktop = await launch(fixture);
    mainPid = await desktop.evaluate(() => process.pid);
    await windowByUrl(desktop, `http://127.0.0.1:${fixture.port}/manage`);
    await expectHealth(fixture.port, true);
    // ManagementWindow.load() shows the window after loadURL resolves. Hiding
    // before that initial show races startup and can immediately be undone.
    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.isVisible())).toBe(true);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.hide());
    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.isVisible())).toBe(false);

    await promisify(execFile)(executablePath, [], {
      cwd: fixture.root,
      env: fixture.env,
      timeout: 15_000,
      windowsHide: true
    });

    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.isVisible())).toBe(true);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:")))).toHaveLength(1);
    await expectHealth(fixture.port, true);
    await quit(desktop, fixture.port);
    desktop = undefined;
  } finally {
    await cleanup(desktop, mainPid, fixture.root);
  }
});

test("an occupied port is reported without changing the port or terminating its owner", async () => {
  const listener = createServer();
  await listen(listener);
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected an occupied TCP port");
  const fixture = await desktopFixture("port-conflict", address.port);
  let desktop: ElectronApplication | undefined;
  let mainPid: number | undefined;
  try {
    desktop = await launch(fixture);
    mainPid = await desktop.evaluate(() => process.pid);
    await holdNativeFailureDialog(desktop);
    await expect.poll(() => nativeDialogMessages(desktop!)).toEqual(expect.arrayContaining([
      expect.stringContaining(String(fixture.port))
    ]));
    expect(listener.listening).toBe(true);
    expect(JSON.parse(await readFile(fixture.configPath, "utf8")).server.port).toBe(fixture.port);

    const closed = desktop.waitForEvent("close");
    void closed.catch(() => undefined); // Retain rejection for await without an early unhandled rejection.
    await replyToNativeDialog(desktop, String(fixture.port), 1);
    await closed;
    desktop = undefined;
    expect(listener.listening).toBe(true);
  } finally {
    await closeServer(listener);
    await cleanup(desktop, mainPid, fixture.root);
  }
});

test("an unavailable renderer requires native confirmation before service shutdown", async () => {
  const fixture = await desktopFixture("renderer-unavailable");
  let desktop: ElectronApplication | undefined;
  let mainPid: number | undefined;
  const lifecycleEvents: string[] = [];
  try {
    desktop = await launch(fixture);
    mainPid = await desktop.evaluate(() => process.pid);
    desktop.on("console", (message) => {
      if (message.text().startsWith("Renderer-failure quit:")) lifecycleEvents.push(message.text());
    });
    await desktop.evaluate(({ app }) => {
      const started = Date.now();
      const log = (event: string) => console.info(`Renderer-failure quit: ${event} at ${Date.now() - started}ms`);
      app.on("before-quit", () => log("before-quit"));
      app.on("will-quit", () => log("will-quit"));
      app.on("quit", () => log("quit"));
    });
    const management = await windowByUrl(desktop, `http://127.0.0.1:${fixture.port}/manage`);
    // A matching URL can precede load completion. Crashing during startup also
    // rejects ManagementWindow.load(), opening a competing failure dialog.
    await management.waitForLoadState("load", { timeout: 25_000 });
    await expectHealth(fixture.port, true);
    await holdNativeFailureDialog(desktop);
    await desktop.evaluate(({ BrowserWindow, app }) => {
      BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.webContents.forcefullyCrashRenderer();
      app.quit();
    });
    await expect.poll(() => nativeDialogMessages(desktop!)).toEqual(expect.arrayContaining([
      expect.stringContaining("Management cannot confirm whether your changes are saved")
    ]));
    await expectHealth(fixture.port, true);

    const closed = desktop.waitForEvent("close");
    void closed.catch(() => undefined);
    await replyToNativeDialog(desktop, "Management cannot confirm whether your changes are saved", 1);
    await expectHealth(fixture.port, false);
    await desktop.close();
    await closed;
    desktop = undefined;
  } catch (error) {
    const healthStatus = await fetch(`http://127.0.0.1:${fixture.port}/health`, { signal: AbortSignal.timeout(1_000) })
      .then((response) => response.status, () => 0);
    const dialogs = desktop === undefined ? [] : await nativeDialogMessages(desktop).catch(() => []);
    console.info("Renderer-failure shutdown observation:", { mainPid, healthStatus, lifecycleEvents, dialogs });
    throw error;
  } finally {
    await cleanup(desktop, mainPid, fixture.root);
  }
});

test("Windows session-end notification stops the owned service without ending the test session", async () => {
  const fixture = await desktopFixture("session-end");
  let desktop: ElectronApplication | undefined;
  let mainPid: number | undefined;
  try {
    desktop = await launch(fixture);
    mainPid = await desktop.evaluate(() => process.pid);
    await windowByUrl(desktop, `http://127.0.0.1:${fixture.port}/manage`);
    await expectHealth(fixture.port, true);
    await desktop.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.emit("query-session-end", {});
    });
    await expectHealth(fixture.port, false);

    const closed = desktop.waitForEvent("close");
    void closed.catch(() => undefined);
    await desktop.evaluate(({ app }) => app.quit());
    await desktop.close();
    await closed;
    desktop = undefined;
  } finally {
    await cleanup(desktop, mainPid, fixture.root);
  }
});

test("native dialog replies target the requested pending dialog rather than the latest one", async () => {
  const fixture = await desktopFixture("dialog-replies");
  let desktop: ElectronApplication | undefined;
  let mainPid: number | undefined;
  try {
    desktop = await launch(fixture);
    mainPid = await desktop.evaluate(() => process.pid);
    const management = await windowByUrl(desktop, `http://127.0.0.1:${fixture.port}/manage`);
    await management.waitForLoadState("load");
    await holdNativeFailureDialog(desktop);
    await desktop.evaluate(({ dialog }) => {
      const observed = globalThis as typeof globalThis & { dialogReplies?: { message: string; response: number }[] };
      observed.dialogReplies = [];
      for (const message of ["quit confirmation", "startup failure"]) {
        void dialog.showMessageBox({ message }).then(({ response }) => observed.dialogReplies!.push({ message, response }));
      }
    });

    await expect(replyToNativeDialog(desktop, "a", 1)).rejects.toThrow("pending dialog");
    await expect(replyToNativeDialog(desktop, " ", 1)).rejects.toThrow("pending dialog");
    await replyToNativeDialog(desktop, "quit confirmation", 1);
    expect(await desktop.evaluate(() => (globalThis as typeof globalThis & { dialogReplies?: unknown[] }).dialogReplies))
      .toEqual([{ message: "quit confirmation", response: 1 }]);
    await expect(replyToNativeDialog(desktop, "quit confirmation", 1)).rejects.toThrow("pending dialog");
    await expect(replyToNativeDialog(desktop, "unknown dialog", 1)).rejects.toThrow("pending dialog");
    await replyToNativeDialog(desktop, "startup failure", 0);
    expect(await desktop.evaluate(() => (globalThis as typeof globalThis & { dialogReplies?: unknown[] }).dialogReplies))
      .toEqual([{ message: "quit confirmation", response: 1 }, { message: "startup failure", response: 0 }]);
    await quit(desktop, fixture.port);
    desktop = undefined;
  } finally {
    await cleanup(desktop, mainPid, fixture.root);
  }
});

interface DesktopFixture {
  readonly configPath: string;
  readonly env: Record<string, string>;
  readonly port: number;
  readonly root: string;
}

async function desktopFixture(name: string, requestedPort?: number): Promise<DesktopFixture> {
  const root = await mkdtemp(join(tmpdir(), `stream-jams-${name}-`));
  const port = requestedPort ?? await unusedPort();
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }
  }));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    STREAM_JAMS_CONFIG_PATH: configPath,
    STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron")
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return { configPath, env, port, root };
}

function launch(fixture: DesktopFixture): Promise<ElectronApplication> {
  return _electron.launch({
    executablePath,
    cwd: fixture.root,
    env: fixture.env,
    chromiumSandbox: true,
    timeout: 30_000
  });
}

interface HeldNativeDialog {
  readonly message: string;
  respond: ((response: number) => void) | null;
}

interface NativeDialogTestState { desktopTestDialogs?: HeldNativeDialog[] }

async function holdNativeFailureDialog(desktop: ElectronApplication): Promise<void> {
  await desktop.evaluate(({ dialog }) => {
    const observed = globalThis as typeof globalThis & NativeDialogTestState;
    observed.desktopTestDialogs = [];
    dialog.showMessageBox = async (...args: unknown[]) => {
      const options = args.at(-1) as { detail?: string; message?: string };
      return new Promise((resolveDialog) => {
        observed.desktopTestDialogs!.push({
          message: [options.message, options.detail].filter(Boolean).join(" "),
          respond: (response) => resolveDialog({ response, checkboxChecked: false })
        });
      });
    };
  });
}

function nativeDialogMessages(desktop: ElectronApplication): Promise<string[]> {
  return desktop.evaluate(() => (
    globalThis as typeof globalThis & NativeDialogTestState
  ).desktopTestDialogs?.map(({ message }) => message) ?? []);
}

async function replyToNativeDialog(desktop: ElectronApplication, message: string, response: number): Promise<void> {
  await desktop.evaluate((_electron, { message, response }) => {
    const observed = globalThis as typeof globalThis & NativeDialogTestState;
    const matches = observed.desktopTestDialogs?.filter((dialog) => dialog.respond !== null && dialog.message.includes(message)) ?? [];
    const dialog = matches[0];
    if (message.trim() === "" || matches.length !== 1 || dialog?.respond == null) throw new Error(`Expected one pending dialog matching: ${message}`);
    const respond = dialog.respond;
    dialog.respond = null;
    respond(response);
  }, { message, response });
}

async function quit(desktop: ElectronApplication, port: number): Promise<void> {
  const closed = desktop.waitForEvent("close");
  void closed.catch(() => undefined);
  await desktop.evaluate(({ app }) => app.quit());
  await expectHealth(port, false);
  await desktop.close();
  await closed;
}

async function expectHealth(port: number, available: boolean): Promise<void> {
  await expect.poll(
    () => fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) }).then(() => true, () => false),
    { timeout: 25_000 }
  ).toBe(available);
}

async function cleanup(desktop: ElectronApplication | undefined, mainPid: number | undefined, root: string): Promise<void> {
  if (desktop !== undefined) {
    const closed = desktop.waitForEvent("close", { timeout: 10_000 });
    void desktop.close().catch(() => undefined);
    try { await closed; }
    catch {
      if (mainPid !== undefined) {
        await promisify(execFile)("taskkill.exe", ["/PID", String(mainPid), "/T", "/F"], {
          windowsHide: true,
          timeout: 5_000
        }).catch(() => undefined);
      }
    }
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP port");
  await closeServer(server);
  return address.port;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolveListen();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
