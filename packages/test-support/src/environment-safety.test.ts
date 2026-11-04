import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approvedHardwareAudioOutputs, assertSafeTestEnvironment, productionLocations, UnsafeTestEnvironmentError } from "./environment-safety.js";
import { removeTestCredentials, testCredentialTargets } from "./test-credentials.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "stream-jams-safety-")); mkdirSync(join(root, "home", ".stream-jams"), { recursive: true }); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const production = () => productionLocations(join(root, "home"), join(root, "appdata"));

describe("assertSafeTestEnvironment", () => {
  it("accepts an empty or test-scoped environment", () => {
    expect(() => assertSafeTestEnvironment({}, production())).not.toThrow();
    expect(() => assertSafeTestEnvironment({ STREAM_JAMS_PROFILE: "test", STREAM_JAMS_HOME: join(root, "run"), STREAM_JAMS_KEYRING_PREFIX: "stream-jams-test-abc" }, production())).not.toThrow();
  });

  it.each([
    ["a production config path", { STREAM_JAMS_CONFIG_PATH: "home/.stream-jams/config.json" }],
    ["a production home", { STREAM_JAMS_HOME: "home/.stream-jams" }],
    ["the production Electron profile", { STREAM_JAMS_DESKTOP_USER_DATA_PATH: "appdata/Stream Jams" }],
    ["the dev profile", { STREAM_JAMS_PROFILE: "dev" }],
    ["the production credential prefix", { STREAM_JAMS_KEYRING_PREFIX: "stream-jams" }],
    ["the dev credential prefix", { STREAM_JAMS_KEYRING_PREFIX: "stream-jams-dev" }]
  ])("refuses %s", (_label, environment: Record<string, string>) => {
    const absolute = Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, key.endsWith("PATH") || key === "STREAM_JAMS_HOME" ? join(root, value) : value]));
    expect(() => assertSafeTestEnvironment(absolute, production())).toThrow(UnsafeTestEnvironmentError);
  });

  it("refuses production reached through a junction", () => {
    symlinkSync(join(root, "home", ".stream-jams"), join(root, "alias"), "junction");
    expect(() => assertSafeTestEnvironment({ STREAM_JAMS_CONFIG_PATH: join(root, "alias", "config.json") }, production())).toThrow(UnsafeTestEnvironmentError);
  });
});

describe("approvedHardwareAudioOutputs", () => {
  it("returns two approved labels", () => {
    expect(approvedHardwareAudioOutputs({ STREAM_JAMS_AUDIO_TEST_OUTPUTS: "Speakers | Headphones", STREAM_JAMS_AUDIO_DENY_OUTPUTS: "VoiceMeeter" })).toEqual(["Speakers", "Headphones"]);
  });

  it("refuses a denied stream device, case-insensitively", () => {
    expect(() => approvedHardwareAudioOutputs({ STREAM_JAMS_AUDIO_TEST_OUTPUTS: "Speakers|VoiceMeeter Input", STREAM_JAMS_AUDIO_DENY_OUTPUTS: "voicemeeter" })).toThrow(/deny list/u);
  });

  it("refuses to run without a deny list or two outputs", () => {
    expect(() => approvedHardwareAudioOutputs({ STREAM_JAMS_AUDIO_TEST_OUTPUTS: "A|B" })).toThrow(/STREAM_JAMS_AUDIO_DENY_OUTPUTS/u);
    expect(() => approvedHardwareAudioOutputs({ STREAM_JAMS_AUDIO_TEST_OUTPUTS: "A", STREAM_JAMS_AUDIO_DENY_OUTPUTS: "X" })).toThrow(/two exact labels/u);
  });
});

describe("test credential cleanup", () => {
  const listing = [
    "Currently stored credentials:",
    "    Target: LegacyGeneric:target=key_1.stream-jams-test-run1:overlay:route-key",
    "    Target: LegacyGeneric:target=key_2.stream-jams-test-run1-3:music:access-token-ab12",
    "    Target: LegacyGeneric:target=key_3.stream-jams:overlay:route-key",
    "    Target: LegacyGeneric:target=key_4.stream-jams-dev:overlay:route-key",
    "    Target: LegacyGeneric:target=key_5.stream-jams-test-run10:overlay:route-key",
    "    Target: LegacyGeneric:target=pear-desktop.stream-jams:music:client-id"
  ].join("\r\n");

  it("matches only the run's own prefix family", () => {
    expect(testCredentialTargets(listing, "stream-jams-test-run1")).toEqual(["key_1.stream-jams-test-run1:overlay:route-key", "key_2.stream-jams-test-run1-3:music:access-token-ab12"]);
  });

  it("refuses production and dev prefixes", async () => {
    expect(() => testCredentialTargets(listing, "stream-jams")).toThrow(/non-test prefix/u);
    await expect(removeTestCredentials("stream-jams-dev", async () => listing, "win32")).rejects.toThrow(/non-test prefix/u);
  });

  it("deletes only the matched targets", async () => {
    const calls: string[][] = [];
    const removed = await removeTestCredentials("stream-jams-test-run1", async (_file, args) => { calls.push([...args]); return args[0] === "/list" ? listing : ""; }, "win32");
    expect(removed).toBe(2);
    expect(calls.slice(1)).toEqual([["/delete:key_1.stream-jams-test-run1:overlay:route-key"], ["/delete:key_2.stream-jams-test-run1-3:music:access-token-ab12"]]);
  });
});
