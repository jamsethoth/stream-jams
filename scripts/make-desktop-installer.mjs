import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const desktop = join(root, "apps/desktop");
export const packagedDirectory = join(desktop, "out/Stream Jams-win32-x64");
export const installerDirectory = join(desktop, "out/installer");
export const setupExecutable = "StreamJamsSetup.exe";

/** Squirrel.Windows options for the unsigned per-user installer. */
export function installerOptions({ packageId, appDirectory, version, description, setupIcon }) {
  if (!/^[A-Za-z0-9]+$/.test(packageId)) throw new Error("Squirrel package id must be alphanumeric");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Desktop version must be MAJOR.MINOR.PATCH, received ${version}`);
  return {
    appDirectory,
    outputDirectory: installerDirectory,
    name: packageId,
    title: "Stream Jams",
    exe: "Stream Jams.exe",
    setupExe: setupExecutable,
    setupIcon,
    version,
    description,
    authors: "Stream Jams",
    // An MSI and delta packages belong to the deferred release/update scope.
    noMsi: true,
    noDelta: true
  };
}

async function requireFile(path) {
  const details = await stat(path).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`Missing ${relative(root, path)}`, { cause: error });
    throw error;
  });
  if (!details.isFile()) throw new Error(`Not a file: ${relative(root, path)}`);
}

export async function makeInstaller() {
  // Squirrel's tooling is Windows-native; the non-Windows Mono/Wine path is unsupported here.
  if (process.platform !== "win32") throw new Error("The desktop installer can only be built on Windows");
  await requireFile(join(packagedDirectory, "Stream Jams.exe"));
  await requireFile(join(packagedDirectory, "resources/app.asar"));
  const manifest = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
  const { squirrelPackageId } = await import(pathToFileURL(join(desktop, "dist/squirrel-events.js")).href);
  const require = createRequire(join(desktop, "package.json"));
  const { createWindowsInstaller } = require("electron-winstaller");

  if (relative(desktop, installerDirectory) !== join("out", "installer")) throw new Error("Unexpected installer output directory");
  await rm(installerDirectory, { recursive: true, force: true });
  // electron-winstaller adds Squirrel.exe to its input, so build from a copy
  // and leave the packaged folder byte-for-byte as tested and published.
  const appDirectory = await mkdtemp(join(tmpdir(), "stream-jams-installer-"));
  try {
    await cp(packagedDirectory, appDirectory, { recursive: true });
    await createWindowsInstaller(installerOptions({
      packageId: squirrelPackageId,
      appDirectory,
      version: manifest.version,
      description: manifest.description,
      setupIcon: join(desktop, ".stage/assets/tray.ico")
    }));
  } finally {
    // Only the directory returned by mkdtemp above is removed.
    await rm(appDirectory, { recursive: true, force: true });
  }
  await requireFile(join(installerDirectory, setupExecutable));
  process.stdout.write(`Built unsigned installer ${relative(root, join(installerDirectory, setupExecutable))} for version ${manifest.version}.\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    await makeInstaller();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
