import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const installerPath = resolve(process.env.STREAM_JAMS_TEST_INSTALLER ?? "apps/desktop/out/installer/StreamJamsSetup.exe");
const uninstallRoot = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

// Installing changes the signed-in Windows user's Start menu, desktop and
// Apps list, so it only runs where that is explicitly allowed (CI sets it).
test("unsigned setup wizard installs per user into a chosen folder, launches with the existing profile, and uninstalls without removing user data", async () => {
  test.skip(process.env.STREAM_JAMS_INSTALLER_TEST !== "1", "Set STREAM_JAMS_INSTALLER_TEST=1 to install into this Windows user profile.");
  const startMenu = join(requiredEnvironment("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs");
  const desktopFolder = join(requiredEnvironment("USERPROFILE"), "Desktop");
  expect(await uninstallEntry(), "Uninstall the existing Stream Jams installation first").toBeNull();
  await access(installerPath);

  // mkdtemp paths have no spaces, as NSIS requires for an unquoted /D= value.
  const root = await mkdtemp(join(tmpdir(), "stream-jams-installer-"));
  const installDirectory = join(root, "app");
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  const dataDirectory = join(root, "data");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory, assetDirectory: join(root, "assets") } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  const executable = join(installDirectory, "Stream Jams.exe");
  const uninstaller = join(installDirectory, "Uninstall Stream Jams.exe");
  try {
    await test.step("Silent setup installs for the current user into the chosen folder without administrator rights", async () => {
      // The wizard's pages are skipped by /S; /currentuser and /D= answer its install-mode and folder pages.
      await run(installerPath, ["/S", "/currentuser", `/D=${installDirectory}`], { env, timeout: 180_000, windowsHide: true });
      await access(executable);
      await access(join(installDirectory, "resources", "app.asar"));
      await access(uninstaller);
      expect(await shortcuts(startMenu)).not.toHaveLength(0);
      expect(await shortcuts(desktopFolder)).not.toHaveLength(0);
      expect(await uninstallEntry()).toMatch(/UninstallString\s+REG_SZ\s+.*Uninstall Stream Jams\.exe/i);
    });

    await test.step("The installed app starts with the configured profile", async () => {
      const child = spawn(executable, [], { env, detached: false, stdio: "ignore", windowsHide: true });
      try {
        await expect.poll(() => health(port), { timeout: 90_000, message: "The installed app did not serve /health on the configured port" }).toBe(200);
      } finally {
        if (child.pid !== undefined) await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch((error: unknown) => console.error("Stopping the installed app failed", error));
      }
      await expect.poll(() => health(port), { timeout: 30_000 }).toBe(0);
    });

    await test.step("Uninstall removes the app folder, shortcuts and Apps entry", async () => {
      // The uninstaller copies itself to a temporary folder and returns at once.
      await run(uninstaller, ["/S", "/currentuser"], { env, timeout: 180_000, windowsHide: true });
      try {
        await expect.poll(() => exists(installDirectory), { timeout: 60_000 }).toBe(false);
      } catch (error) {
        console.error(`Uninstall left files behind:\n${(await readdir(installDirectory, { recursive: true }).catch(() => [])).slice(0, 40).join("\n")}`);
        throw error;
      }
      expect(await shortcuts(startMenu)).toHaveLength(0);
      expect(await shortcuts(desktopFolder)).toHaveLength(0);
      expect(await uninstallEntry()).toBeNull();
    });

    await test.step("User configuration and data survive uninstall", async () => {
      expect((await stat(configPath)).isFile()).toBe(true);
      expect((await stat(dataDirectory)).isDirectory()).toBe(true);
    });
  } finally {
    if (await exists(uninstaller)) {
      await run(uninstaller, ["/S", "/currentuser"], { env, timeout: 180_000, windowsHide: true }).catch((error: unknown) => console.error("Installer cleanup failed", error));
      await expect.poll(() => exists(installDirectory), { timeout: 60_000 }).toBe(false).catch((error: unknown) => console.error("Installer cleanup did not finish", error));
    }
    // Only the directory returned by mkdtemp above is removed.
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function shortcuts(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true }).catch(() => []);
  return entries.filter((entry) => /(^|[\\/])Stream Jams[^\\/]*\.lnk$/i.test(entry));
}

/** The current user's Apps-list entry for Stream Jams, or null when there is none. */
async function uninstallEntry(): Promise<string | null> {
  const query = await run("reg.exe", ["query", uninstallRoot, "/s", "/f", "Stream Jams", "/d", "/e"], { windowsHide: true }).catch(() => null);
  const key = query?.stdout.split(/\r?\n/).find((line) => line.startsWith("HKEY_"));
  if (key === undefined) return null;
  return (await run("reg.exe", ["query", key], { windowsHide: true })).stdout;
}

async function health(port: number): Promise<number> {
  try { return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2_000) })).status; } catch { return 0; }
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
