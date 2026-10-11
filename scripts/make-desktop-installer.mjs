import { readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const desktop = join(root, "apps/desktop");
export const packagedDirectory = join(desktop, "out/Stream Jams-win32-x64");
export const installerDirectory = join(desktop, "out/installer");
export const setupExecutable = "StreamJamsSetup.exe";
/** electron-builder configuration for the unsigned NSIS setup wizard. */
export function installerConfig({ appId, version, icon }) {
  if (!/^[a-z0-9]+(\.[a-z0-9]+)+$/.test(appId)) throw new Error(`App id must be reverse-DNS, received ${appId}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Desktop version must be MAJOR.MINOR.PATCH, received ${version}`);
  return {
    // Also the AppUserModelID of the installed shortcuts; the app sets the same value.
    appId,
    productName: "Stream Jams",
    executableName: "Stream Jams",
    directories: { output: installerDirectory },
    npmRebuild: false,
    win: {
      target: [{ target: "nsis", arch: ["x64"] }],
      // The packaged executable already carries its icon and version resources,
      // and signing is deferred, so the packaged files are installed unchanged.
      signAndEditExecutable: false
    },
    nsis: {
      // Assisted wizard: install-mode page (current user by default, or all
      // users with elevation), folder choice and a finish page that can start the app.
      oneClick: false,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      runAfterFinish: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "Stream Jams",
      uninstallDisplayName: "Stream Jams",
      installerIcon: icon,
      uninstallerIcon: icon,
      // User configuration, data and credentials outlive the installed app.
      deleteAppDataOnUninstall: false,
      // Update metadata belongs to the deferred update scope.
      differentialPackage: false,
      artifactName: setupExecutable
    },
    publish: null
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
  // The installer is tested only on Windows; cross-building needs Wine for the uninstaller.
  if (process.platform !== "win32") throw new Error("The desktop installer can only be built on Windows");
  await requireFile(join(packagedDirectory, "Stream Jams.exe"));
  await requireFile(join(packagedDirectory, "resources/app.asar"));
  const manifest = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
  const icon = join(desktop, ".stage/assets/tray.ico");
  await requireFile(icon);
  const { appUserModelId } = await import(pathToFileURL(join(desktop, "dist/app-identity.js")).href);
  const require = createRequire(join(desktop, "package.json"));
  const { Arch, Platform, build } = require("electron-builder");

  if (relative(desktop, installerDirectory) !== join("out", "installer")) throw new Error("Unexpected installer output directory");
  await rm(installerDirectory, { recursive: true, force: true });
  // electron-builder wraps the packaged folder as is; it does not repackage or modify it.
  await build({
    projectDir: desktop,
    prepackaged: packagedDirectory,
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
    publish: "never",
    config: installerConfig({ appId: appUserModelId, version: manifest.version, icon })
  });
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
