import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "@stream-jams/core";
import { createDefaultAppConfig } from "./default-config.js";

/**
 * Selects which Stream Jams environment this process is. `production` (the default when
 * STREAM_JAMS_PROFILE is unset) keeps the installed app's paths, port, credential names and
 * identity. `dev` and `test` take every path from STREAM_JAMS_HOME and refuse production
 * resources, so development and automated tests cannot touch the live install on the same PC.
 */
export type RuntimeProfileName = "production" | "dev" | "test";

export const productionPort = 39187;
export const devPort = 39287;
export const testPort = 39387;
export const productionCredentialPrefix = "stream-jams";
export const devCredentialPrefix = "stream-jams-dev";
export const profileMarkerFileName = "profile.json";
const testCredentialPrefixPattern = /^stream-jams-test-[A-Za-z0-9_-]{1,64}$/u;

export interface RuntimeProfile {
  readonly name: RuntimeProfileName;
  /** Root of this profile's Stream Jams state. Production: `~/.stream-jams`. */
  readonly home: string;
  /** The production root, which `dev` and `test` must never reach. */
  readonly productionRoot: string;
  readonly configFilePath: string;
  readonly backupDirectory: string;
  readonly emergencyLogPath: string;
  readonly credentialPrefix: string;
  readonly defaultPort: number;
  /** Twitch user IDs that dev and test refuse to connect (STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS). Empty in production. */
  readonly protectedTwitchAccountIds: ReadonlySet<string>;
}

export class RuntimeProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeProfileError";
  }
}

export function resolveRuntimeProfile(homeDirectory: string, environment: NodeJS.ProcessEnv = process.env): RuntimeProfile {
  const productionRoot = path.join(homeDirectory, ".stream-jams");
  const requested = environment.STREAM_JAMS_PROFILE?.trim() || "production";
  if (requested !== "production" && requested !== "dev" && requested !== "test") {
    throw new RuntimeProfileError(`STREAM_JAMS_PROFILE must be production, dev or test; received "${requested}".`);
  }
  const configOverride = environment.STREAM_JAMS_CONFIG_PATH?.trim() || undefined;
  if (requested === "production") {
    return profile("production", productionRoot, productionRoot, configOverride, productionCredentialPrefix, productionPort, new Set());
  }
  const protectedTwitch = new Set((environment.STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS ?? "").split(",").map(id => id.trim()).filter(id => id !== ""));
  const home = environment.STREAM_JAMS_HOME?.trim();
  if (home === undefined || home === "" || !path.isAbsolute(home)) {
    throw new RuntimeProfileError(`STREAM_JAMS_PROFILE=${requested} requires STREAM_JAMS_HOME to be an absolute path.`);
  }
  if (requested === "dev") return profile("dev", home, productionRoot, configOverride, devCredentialPrefix, devPort, protectedTwitch);
  const prefix = environment.STREAM_JAMS_KEYRING_PREFIX?.trim() ?? "";
  if (!testCredentialPrefixPattern.test(prefix)) {
    throw new RuntimeProfileError("STREAM_JAMS_PROFILE=test requires STREAM_JAMS_KEYRING_PREFIX of the form stream-jams-test-<runId>.");
  }
  return profile("test", home, productionRoot, configOverride, prefix, testPort, protectedTwitch);
}

function profile(name: RuntimeProfileName, home: string, productionRoot: string, configOverride: string | undefined, credentialPrefix: string,
  defaultPort: number, protectedTwitchAccountIds: ReadonlySet<string>): RuntimeProfile {
  return {
    name, home, productionRoot, credentialPrefix, defaultPort, protectedTwitchAccountIds,
    configFilePath: configOverride ?? path.join(home, "config.json"),
    backupDirectory: path.join(home, "backups"),
    emergencyLogPath: path.join(home, "logs", "emergency.jsonl")
  };
}

/** Defaults for a config file this profile creates. Dev and test start muted, with their own paths and port. */
export function createProfileDefaultConfig(runtimeProfile: RuntimeProfile, homeDirectory: string): AppConfig {
  const defaults = createDefaultAppConfig(homeDirectory);
  if (runtimeProfile.name === "production") return defaults;
  return {
    ...defaults,
    server: { ...defaults.server, port: runtimeProfile.defaultPort },
    storage: { dataDirectory: path.join(runtimeProfile.home, "data"), assetDirectory: path.join(runtimeProfile.home, "assets") },
    playback: { ...defaults.playback, muted: true }
  };
}

/**
 * Canonical form for containment checks: the nearest existing ancestor is resolved through
 * links and junctions, and Windows paths compare case-insensitively.
 */
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

/** Runs before the config file is read or created, so a bad path never receives a write. */
export function assertProfileLocationSafe(runtimeProfile: RuntimeProfile): void {
  if (runtimeProfile.name === "production") return;
  for (const [label, location] of [["STREAM_JAMS_HOME", runtimeProfile.home], ["config file", runtimeProfile.configFilePath]] as const) {
    if (isInsideOrEqual(location, runtimeProfile.productionRoot)) {
      throw new RuntimeProfileError(`The ${runtimeProfile.name} profile refuses its ${label} inside the production Stream Jams folder (${runtimeProfile.productionRoot}).`);
    }
  }
  if (runtimeProfile.credentialPrefix === productionCredentialPrefix) {
    throw new RuntimeProfileError(`The ${runtimeProfile.name} profile refuses the production credential prefix.`);
  }
}

/** Runs after the config is read and before SQLite, credentials or a listener open. */
export function assertProfileConfigSafe(runtimeProfile: RuntimeProfile, config: AppConfig): void {
  if (runtimeProfile.name !== "production") {
    const locations = [
      ["data directory", config.storage.dataDirectory],
      ["asset directory", config.storage.assetDirectory],
      ["backup directory", runtimeProfile.backupDirectory]
    ] as const;
    for (const [label, location] of locations) {
      if (isInsideOrEqual(location, runtimeProfile.productionRoot)) {
        throw new RuntimeProfileError(`The ${runtimeProfile.name} profile refuses a ${label} inside the production Stream Jams folder: ${location}.`);
      }
    }
    if (config.server.port === productionPort) {
      throw new RuntimeProfileError(`The ${runtimeProfile.name} profile refuses the production port ${productionPort}.`);
    }
  }
  const marker = readProfileMarker(config.storage.dataDirectory);
  if (marker !== null && (marker === "production") !== (runtimeProfile.name === "production")) {
    throw new RuntimeProfileError(`The ${runtimeProfile.name} profile refuses a data directory marked as ${marker}: ${config.storage.dataDirectory}.`);
  }
}

export function readProfileMarker(dataDirectory: string): RuntimeProfileName | null {
  let raw: string;
  try { raw = readFileSync(path.join(dataDirectory, profileMarkerFileName), "utf8"); }
  // error-provenance: allow expected -- a missing marker means the directory was never claimed
  catch { return null; }
  const parsed: unknown = JSON.parse(raw);
  const value = typeof parsed === "object" && parsed !== null && "profile" in parsed ? parsed.profile : undefined;
  if (value === "production" || value === "dev" || value === "test") return value;
  throw new RuntimeProfileError(`The Stream Jams profile marker in ${dataDirectory} is not valid.`);
}

/** Claims an unmarked data directory for this profile (atomic temporary file, then rename). */
export function writeProfileMarker(dataDirectory: string, runtimeProfile: RuntimeProfile, now: Date): void {
  if (readProfileMarker(dataDirectory) !== null) return;
  mkdirSync(dataDirectory, { recursive: true });
  const target = path.join(dataDirectory, profileMarkerFileName);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ profile: runtimeProfile.name, createdAt: now.toISOString() })}\n`, "utf8");
  renameSync(temporary, target);
}
