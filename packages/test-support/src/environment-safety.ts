import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Guards automated test runs against the maintainer's production Stream Jams on the same PC.
 * Mirrors the runtime's containment rules (apps/server/src/config/runtime-profile.ts) because
 * test-support cannot depend on the server package.
 */
export interface ProductionLocations {
  /** `~/.stream-jams`: config, database, assets, backups and logs. */
  readonly root: string;
  /** `%APPDATA%\Stream Jams`: the installed app's Electron profile. */
  readonly electronProfile: string;
  readonly port: number;
  readonly credentialPrefix: string;
}

export function productionLocations(homeDirectory = homedir(), appData = process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming")): ProductionLocations {
  return { root: path.join(homeDirectory, ".stream-jams"), electronProfile: path.join(appData, "Stream Jams"), port: 39187, credentialPrefix: "stream-jams" };
}

export class UnsafeTestEnvironmentError extends Error {
  constructor(message: string) {
    super(`${message} Tests must never touch the production Stream Jams install.`);
    this.name = "UnsafeTestEnvironmentError";
  }
}

export function canonicalPath(target: string, platform: NodeJS.Platform = process.platform): string {
  let existing = path.resolve(target);
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  let resolved: string;
  try { resolved = realpathSync.native(existing); }
  // error-provenance: allow expected -- an unreadable ancestor is compared by its resolved spelling instead
  catch { resolved = existing; }
  const joined = path.join(resolved, ...rest);
  return platform === "win32" ? joined.toLowerCase() : joined;
}

export function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(canonicalPath(parent), canonicalPath(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Throws before any test runs when the environment points a test at production state. */
export function assertSafeTestEnvironment(environment: NodeJS.ProcessEnv = process.env, production: ProductionLocations = productionLocations()): void {
  if (environment.STREAM_JAMS_PROFILE !== undefined && environment.STREAM_JAMS_PROFILE !== "test") {
    throw new UnsafeTestEnvironmentError(`STREAM_JAMS_PROFILE is "${environment.STREAM_JAMS_PROFILE}"; test runs use the test profile.`);
  }
  for (const name of ["STREAM_JAMS_CONFIG_PATH", "STREAM_JAMS_HOME", "STREAM_JAMS_SHUTDOWN_LOG"] as const) {
    const value = environment[name];
    if (value !== undefined && value.trim() !== "" && isInsideOrEqual(value, production.root)) {
      throw new UnsafeTestEnvironmentError(`${name} points inside ${production.root}.`);
    }
  }
  const userData = environment.STREAM_JAMS_DESKTOP_USER_DATA_PATH;
  if (userData !== undefined && userData.trim() !== "" && isInsideOrEqual(userData, production.electronProfile)) {
    throw new UnsafeTestEnvironmentError(`STREAM_JAMS_DESKTOP_USER_DATA_PATH points inside ${production.electronProfile}.`);
  }
  const prefix = environment.STREAM_JAMS_KEYRING_PREFIX;
  if (prefix !== undefined && !testCredentialPrefixPattern.test(prefix)) {
    throw new UnsafeTestEnvironmentError(`STREAM_JAMS_KEYRING_PREFIX "${prefix}" is not a stream-jams-test-<runId> prefix.`);
  }
}

export const testCredentialPrefixPattern = /^stream-jams-test-[A-Za-z0-9_-]{1,64}$/u;

export function createTestRunId(): string {
  return randomBytes(6).toString("hex");
}

/**
 * The two physical outputs an approved hardware audio run may use. Refuses any label that
 * matches the stream-device deny list (`STREAM_JAMS_AUDIO_DENY_OUTPUTS`, `|`-separated,
 * case-insensitive substrings), and refuses to run without a deny list.
 */
export function approvedHardwareAudioOutputs(environment: NodeJS.ProcessEnv = process.env): [string, string] {
  const split = (value: string | undefined) => value?.split("|").map(label => label.trim()).filter(Boolean) ?? [];
  const labels = split(environment.STREAM_JAMS_AUDIO_TEST_OUTPUTS);
  if (labels.length !== 2) throw new Error("Set STREAM_JAMS_AUDIO_TEST_OUTPUTS to two exact labels separated by |.");
  const denied = split(environment.STREAM_JAMS_AUDIO_DENY_OUTPUTS).map(label => label.toLowerCase());
  if (denied.length === 0) throw new Error("Set STREAM_JAMS_AUDIO_DENY_OUTPUTS to the stream audio devices hardware tests must never use, separated by |.");
  for (const label of labels) {
    const match = denied.find(entry => label.toLowerCase().includes(entry));
    if (match !== undefined) throw new Error(`Hardware audio output "${label}" matches the stream-device deny list entry "${match}".`);
  }
  return [labels[0]!, labels[1]!];
}
