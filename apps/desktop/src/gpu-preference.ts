import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { DesktopDiagnosticInput } from "./desktop-diagnostics.js";

/**
 * Electron decides hardware acceleration before `app.ready`, long before the owned service
 * can report the saved desktop settings. The main process therefore mirrors the service-owned
 * `gpuAcceleration` setting into this small userData file and reads it on the next launch.
 */
export const gpuPreferenceFileName = "gpu-preference.json";

const gpuPreferenceFileSchema = z.object({ version: z.literal(1), gpuAcceleration: z.boolean() }).strict();

export interface GpuPreferenceFileSystem {
  readonly readFile: (path: string) => string;
  readonly writeFile: (path: string, contents: string) => void;
  readonly rename: (from: string, to: string) => void;
  readonly remove: (path: string) => void;
  readonly ensureDirectory: (path: string) => void;
}

const nodeFileSystem: GpuPreferenceFileSystem = {
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, contents) => { writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 }); },
  rename: (from, to) => { renameSync(from, to); },
  remove: (path) => { rmSync(path, { force: true }); },
  ensureDirectory: (path) => { mkdirSync(path, { recursive: true }); }
};

/** Returns the persisted preference, or null when the file is missing, unreadable, or malformed. */
export function readPersistedGpuPreference(userDataPath: string, fs: GpuPreferenceFileSystem = nodeFileSystem): boolean | null {
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFile(join(userDataPath, gpuPreferenceFileName))); }
  // error-provenance: allow expected -- a missing or unreadable preference falls back to the GPU-on default
  catch { return null; }
  const result = gpuPreferenceFileSchema.safeParse(parsed);
  return result.success ? result.data.gpuAcceleration : null;
}

/** GPU acceleration is on unless a valid preference file turns it off. */
export function readGpuAccelerationPreference(userDataPath: string, fs: GpuPreferenceFileSystem = nodeFileSystem): boolean {
  return readPersistedGpuPreference(userDataPath, fs) ?? true;
}

/** Replaces the preference file atomically (temporary file, then rename). Throws on failure. */
export function writeGpuAccelerationPreference(userDataPath: string, gpuAcceleration: boolean, fs: GpuPreferenceFileSystem = nodeFileSystem): void {
  const target = join(userDataPath, gpuPreferenceFileName);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.ensureDirectory(userDataPath);
  try {
    fs.writeFile(temporary, `${JSON.stringify({ version: 1, gpuAcceleration })}\n`);
    fs.rename(temporary, target);
  } catch (error) {
    try { fs.remove(temporary); }
    // error-provenance: allow expected -- temporary cleanup is best effort; the original write error is rethrown
    catch { /* keep the original failure */ }
    throw error;
  }
}

/** Keeps the launch-time preference file in step with the service-owned setting. */
export class GpuPreferenceSync {
  #persisted: boolean | null;
  #failed: boolean | null = null;

  constructor(
    private readonly userDataPath: string,
    private readonly diagnose: (input: DesktopDiagnosticInput) => void,
    private readonly fs: GpuPreferenceFileSystem = nodeFileSystem
  ) {
    this.#persisted = readPersistedGpuPreference(userDataPath, fs);
  }

  /** Best effort: writes only when the setting differs from the file, and reports a failed value once. */
  sync(gpuAcceleration: boolean): void {
    if (gpuAcceleration === this.#persisted || gpuAcceleration === this.#failed) return;
    try {
      writeGpuAccelerationPreference(this.userDataPath, gpuAcceleration, this.fs);
      this.#persisted = gpuAcceleration;
      this.#failed = null;
    } catch (error) {
      this.#failed = gpuAcceleration;
      this.diagnose({ component: "gpu-preference", source: "desktop.gpu-preference.write-failed", message: "The GPU acceleration setting could not be saved for the next launch.", exception: error });
    }
  }
}
