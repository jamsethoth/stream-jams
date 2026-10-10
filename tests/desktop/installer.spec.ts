import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const installerPath = resolve(process.env.STREAM_JAMS_TEST_INSTALLER ?? "apps/desktop/out/installer/StreamJamsSetup.exe");
const uninstallKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StreamJams";

// Installing changes the signed-in Windows user's Start menu, desktop and
// Apps list, so it only runs where that is explicitly allowed (CI sets it).
test("unsigned installer installs per user, launches with the existing profile, and uninstalls without removing user data", async () => {
  test.skip(process.env.STREAM_JAMS_INSTALLER_TEST !== "1", "Set STREAM_JAMS_INSTALLER_TEST=1 to install into this Windows user profile.");
  const localAppData = requiredEnvironment("LOCALAPPDATA");
  const installRoot = join(localAppData, "StreamJams");
  const startMenu = join(requiredEnvironment("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs");
  const desktopFolder = join(requiredEnvironment("USERPROFILE"), "Desktop");
  expect(await exists(installRoot), `Uninstall the existing Stream Jams installation at ${installRoot} first`).toBe(false);
  await access(installerPath);

  const root = await mkdtemp(join(tmpdir(), "stream-jams-installer-"));
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  const dataDirectory = join(root, "data");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory, assetDirectory: join(root, "assets") } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  // Squirrel launches the installed app after setup; it inherits this isolated profile.
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  try {
    await test.step("Run Setup.exe without administrator rights", async () => {
      await run(installerPath, [], { env, timeout: 180_000, windowsHide: true });
    });

    await test.step("Install into the user's local app data with shortcuts and an Apps entry", async () => {
      const versions = (await readdir(installRoot)).filter((name) => name.startsWith("app-"));
      expect(versions).toHaveLength(1);
      await access(join(installRoot, "Update.exe"));
      await access(join(installRoot, versions[0]!, "Stream Jams.exe"));
      await access(join(installRoot, versions[0]!, "resources", "app.asar"));
      await expect.poll(() => shortcuts(startMenu), { timeout: 30_000 }).not.toHaveLength(0);
      await expect.poll(() => shortcuts(desktopFolder), { timeout: 30_000 }).not.toHaveLength(0);
      expect(await registryKeyExists(uninstallKey)).toBe(true);
    });

    await test.step("Launch the installed app on the configured profile after setup", async () => {
      await expect.poll(() => health(port), { timeout: 90_000, message: "The installed app did not serve /health on the configured port" }).toBe(200);
    });

    await test.step("Uninstall removes the app, shortcuts and Apps entry", async () => {
      await run(join(installRoot, "Update.exe"), ["--uninstall"], { env, timeout: 180_000, windowsHide: true });
      await expect.poll(() => health(port), { timeout: 30_000 }).toBe(0);
      await expect.poll(async () => (await readdir(installRoot).catch(() => [])).filter((name) => name.startsWith("app-")), { timeout: 30_000 }).toHaveLength(0);
      expect(await shortcuts(startMenu)).toHaveLength(0);
      expect(await shortcuts(desktopFolder)).toHaveLength(0);
      expect(await registryKeyExists(uninstallKey)).toBe(false);
    });

    await test.step("User configuration and data survive uninstall", async () => {
      expect((await stat(configPath)).isFile()).toBe(true);
      expect((await stat(dataDirectory)).isDirectory()).toBe(true);
    });
  } finally {
    if (await exists(join(installRoot, "Update.exe"))) {
      await run(join(installRoot, "Update.exe"), ["--uninstall"], { env, timeout: 180_000, windowsHide: true }).catch((error: unknown) => console.error("Installer cleanup failed", error));
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

async function registryKeyExists(key: string): Promise<boolean> {
  try { await run("reg.exe", ["query", key], { windowsHide: true }); return true; } catch { return false; }
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
