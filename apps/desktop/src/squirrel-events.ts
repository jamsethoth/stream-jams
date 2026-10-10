import { spawn } from "node:child_process";
import { win32 } from "node:path";

// Squirrel.Windows is the per-user installer. Its package id becomes the
// %LocalAppData% folder and the shortcut AppUserModelID prefix; Squirrel
// rejects hyphens and spaces in it.
export const squirrelPackageId = "StreamJams";
const shortcutLocations = "Desktop,StartMenu";

export type SquirrelEvent = "install" | "updated" | "uninstall" | "obsolete";

export interface UpdateCommand {
  file: string;
  args: string[];
}

interface ExitObservable {
  once(event: "error" | "close", listener: () => void): unknown;
}

type SpawnDetached = (file: string, args: string[], options: { detached: true; stdio: "ignore"; windowsHide: true }) => ExitObservable;

/** Squirrel passes its lifecycle hook as the first application argument. */
export function squirrelEvent(argv: readonly string[]): SquirrelEvent | null {
  switch (argv[1]) {
    case "--squirrel-install": return "install";
    case "--squirrel-updated": return "updated";
    case "--squirrel-uninstall": return "uninstall";
    case "--squirrel-obsolete": return "obsolete";
    default: return null;
  }
}

function updateExecutable(execPath: string): string {
  // Installed layout: %LocalAppData%\StreamJams\app-<version>\Stream Jams.exe
  return win32.resolve(win32.dirname(execPath), "..", "Update.exe");
}

export function squirrelUpdateCommand(event: SquirrelEvent, execPath: string): UpdateCommand | null {
  const executable = win32.basename(execPath);
  switch (event) {
    case "install":
    case "updated":
      return { file: updateExecutable(execPath), args: ["--createShortcut", executable, "--shortcut-locations", shortcutLocations] };
    case "uninstall":
      return { file: updateExecutable(execPath), args: ["--removeShortcut", executable, "--shortcut-locations", shortcutLocations] };
    case "obsolete":
      return null;
  }
}

/** Matches the AppUserModelID Squirrel writes into its shortcuts, so tray notifications group with them. */
export function squirrelAppUserModelId(execPath: string, exists: (path: string) => boolean): string | null {
  if (!exists(updateExecutable(execPath))) return null;
  return `com.squirrel.${squirrelPackageId}.${win32.basename(execPath, ".exe").replaceAll(" ", "")}`;
}

/**
 * Runs the shortcut work for one Squirrel hook. Squirrel waits for the hook
 * process to exit, so this never starts the local service and always settles.
 */
export async function runSquirrelEvent(event: SquirrelEvent, execPath: string, spawnProcess: SpawnDetached = spawn, timeoutMs = 10_000): Promise<void> {
  const command = squirrelUpdateCommand(event, execPath);
  if (command === null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const settle = (): void => { clearTimeout(timer); resolve(); };
    try {
      const child = spawnProcess(command.file, command.args, { detached: true, stdio: "ignore", windowsHide: true });
      child.once("error", settle);
      child.once("close", settle);
    }
    // error-provenance: allow expected -- a hook must always exit so Squirrel can finish; shortcuts are best effort
    catch {
      settle();
    }
  });
}
