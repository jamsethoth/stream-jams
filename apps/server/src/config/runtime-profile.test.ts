import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertProfileConfigSafe, assertProfileLocationSafe, createProfileDefaultConfig, devPort, productionPort, readProfileMarker,
  resolveRuntimeProfile, RuntimeProfileError, writeProfileMarker, type RuntimeProfile
} from "./runtime-profile.js";

let root: string;
let userHome: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "stream-jams-profile-"));
  userHome = join(root, "user");
  mkdirSync(join(userHome, ".stream-jams", "data"), { recursive: true });
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const dev = (overrides: NodeJS.ProcessEnv = {}): RuntimeProfile =>
  resolveRuntimeProfile(userHome, { STREAM_JAMS_PROFILE: "dev", STREAM_JAMS_HOME: join(root, "dev"), ...overrides });
const configFor = (profile: RuntimeProfile, patch: { data?: string; port?: number } = {}) => {
  const config = createProfileDefaultConfig(profile, userHome);
  return { ...config, server: { ...config.server, port: patch.port ?? config.server.port }, storage: { ...config.storage, dataDirectory: patch.data ?? config.storage.dataDirectory } };
};

describe("resolveRuntimeProfile", () => {
  it("defaults to production with today's paths, port and credential prefix", () => {
    const profile = resolveRuntimeProfile(userHome, {});
    expect(profile).toMatchObject({ name: "production", home: join(userHome, ".stream-jams"), configFilePath: join(userHome, ".stream-jams", "config.json"),
      backupDirectory: join(userHome, ".stream-jams", "backups"), emergencyLogPath: join(userHome, ".stream-jams", "logs", "emergency.jsonl"),
      credentialPrefix: "stream-jams", defaultPort: productionPort });
  });

  it("keeps the production config override", () => {
    expect(resolveRuntimeProfile(userHome, { STREAM_JAMS_CONFIG_PATH: join(root, "c.json") }).configFilePath).toBe(join(root, "c.json"));
  });

  it("rejects an unknown profile", () => {
    expect(() => resolveRuntimeProfile(userHome, { STREAM_JAMS_PROFILE: "staging" })).toThrow(/production, dev or test/u);
  });

  it("requires an absolute home for dev and test", () => {
    expect(() => resolveRuntimeProfile(userHome, { STREAM_JAMS_PROFILE: "dev" })).toThrow(/STREAM_JAMS_HOME/u);
    expect(() => resolveRuntimeProfile(userHome, { STREAM_JAMS_PROFILE: "dev", STREAM_JAMS_HOME: "relative/dev" })).toThrow(/absolute/u);
  });

  it("derives every dev path from its home", () => {
    const home = join(root, "dev");
    expect(dev()).toMatchObject({ name: "dev", home, configFilePath: join(home, "config.json"), backupDirectory: join(home, "backups"),
      emergencyLogPath: join(home, "logs", "emergency.jsonl"), credentialPrefix: "stream-jams-dev", defaultPort: devPort });
  });

  it("reads protected Twitch accounts for dev and test only", () => {
    expect([...dev({ STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS: " 123, 456 ,," }).protectedTwitchAccountIds]).toEqual(["123", "456"]);
    expect(resolveRuntimeProfile(userHome, { STREAM_JAMS_PROTECTED_TWITCH_ACCOUNT_IDS: "123" }).protectedTwitchAccountIds.size).toBe(0);
  });

  it("requires a run-scoped credential prefix for test", () => {
    const base = { STREAM_JAMS_PROFILE: "test", STREAM_JAMS_HOME: join(root, "t") };
    expect(() => resolveRuntimeProfile(userHome, base)).toThrow(/STREAM_JAMS_KEYRING_PREFIX/u);
    expect(() => resolveRuntimeProfile(userHome, { ...base, STREAM_JAMS_KEYRING_PREFIX: "stream-jams" })).toThrow(/STREAM_JAMS_KEYRING_PREFIX/u);
    expect(resolveRuntimeProfile(userHome, { ...base, STREAM_JAMS_KEYRING_PREFIX: "stream-jams-test-run1" }).credentialPrefix).toBe("stream-jams-test-run1");
  });
});

describe("createProfileDefaultConfig", () => {
  it("seeds dev configs with dev paths, the dev port and muted playback", () => {
    const config = createProfileDefaultConfig(dev(), userHome);
    expect(config.server.port).toBe(devPort);
    expect(config.storage).toEqual({ dataDirectory: join(root, "dev", "data"), assetDirectory: join(root, "dev", "assets") });
    expect(config.playback.muted).toBe(true);
  });

  it("leaves production defaults unchanged", () => {
    expect(createProfileDefaultConfig(resolveRuntimeProfile(userHome, {}), userHome).playback.muted).toBe(false);
  });
});

describe("refusals", () => {
  it("refuses a dev home or config file inside the production folder", () => {
    expect(() => assertProfileLocationSafe(dev({ STREAM_JAMS_HOME: join(userHome, ".stream-jams", "dev") }))).toThrow(RuntimeProfileError);
    expect(() => assertProfileLocationSafe(dev({ STREAM_JAMS_CONFIG_PATH: join(userHome, ".stream-jams", "config.json") }))).toThrow(/config file/u);
    expect(() => assertProfileLocationSafe(dev())).not.toThrow();
  });

  it("refuses production data and the production port", () => {
    const profile = dev();
    expect(() => assertProfileConfigSafe(profile, configFor(profile, { data: join(userHome, ".stream-jams", "data") }))).toThrow(/data directory/u);
    expect(() => assertProfileConfigSafe(profile, configFor(profile, { port: productionPort }))).toThrow(/39187/u);
    expect(() => assertProfileConfigSafe(profile, configFor(profile))).not.toThrow();
  });

  it.runIf(process.platform === "win32")("refuses production data spelled with different letter case", () => {
    const profile = dev();
    expect(() => assertProfileConfigSafe(profile, configFor(profile, { data: join(userHome, ".STREAM-JAMS", "DATA") }))).toThrow(/data directory/u);
  });

  it("refuses production data reached through a junction or link", () => {
    const alias = join(root, "alias");
    symlinkSync(join(userHome, ".stream-jams"), alias, "junction");
    const profile = dev();
    expect(() => assertProfileConfigSafe(profile, configFor(profile, { data: join(alias, "data") }))).toThrow(/data directory/u);
  });

  it("does nothing extra for production paths in production", () => {
    const production = resolveRuntimeProfile(userHome, {});
    expect(() => assertProfileConfigSafe(production, createProfileDefaultConfig(production, userHome))).not.toThrow();
  });
});

describe("profile markers", () => {
  it("claims an unmarked directory once and keeps the first claim", () => {
    const data = join(root, "dev", "data");
    writeProfileMarker(data, dev(), new Date("2026-11-03T00:00:00Z"));
    writeProfileMarker(data, resolveRuntimeProfile(userHome, {}), new Date());
    expect(readProfileMarker(data)).toBe("dev");
    expect(JSON.parse(readFileSync(join(data, "profile.json"), "utf8"))).toEqual({ profile: "dev", createdAt: "2026-11-03T00:00:00.000Z" });
  });

  it("stops production from opening dev data, and dev from opening production data", () => {
    const devProfile = dev();
    const production = resolveRuntimeProfile(userHome, {});
    const devData = join(root, "dev", "data");
    writeProfileMarker(devData, devProfile, new Date());
    expect(() => assertProfileConfigSafe(production, configFor(production, { data: devData }))).toThrow(/marked as dev/u);

    const relocated = join(root, "moved-production-data");
    writeProfileMarker(relocated, production, new Date());
    expect(() => assertProfileConfigSafe(devProfile, configFor(devProfile, { data: relocated }))).toThrow(/marked as production/u);
  });

  it("rejects a damaged marker instead of ignoring it", () => {
    const data = join(root, "damaged");
    mkdirSync(data);
    writeFileSync(join(data, "profile.json"), JSON.stringify({ profile: "staging" }));
    expect(() => readProfileMarker(data)).toThrow(/not valid/u);
  });
});
