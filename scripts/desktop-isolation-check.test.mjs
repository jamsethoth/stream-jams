import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

/**
 * Desktop specs that launch Electron or the packaged app must build their environment with
 * isolatedDesktopEnvironment (tests/desktop/desktop-environment.ts), which puts the launch in
 * the test profile with its own home, Electron profile and credential prefix.
 */
export function isolationViolations(source) {
  const launches = /_electron\.launch\(|spawn\([^)]*Stream Jams\.exe/u.test(source);
  const violations = [];
  if (launches && !source.includes("isolatedDesktopEnvironment(")) violations.push("launches Stream Jams or Electron without isolatedDesktopEnvironment");
  if (/STREAM_JAMS_DESKTOP_USER_DATA_PATH\s*[:=]/u.test(source)) violations.push("sets STREAM_JAMS_DESKTOP_USER_DATA_PATH itself");
  return violations;
}

test("the detector flags a spec that launches the app directly", () => {
  assert.deepEqual(isolationViolations('const env = { ...process.env }; await _electron.launch({ executablePath, env });'), ["launches Stream Jams or Electron without isolatedDesktopEnvironment"]);
  assert.deepEqual(isolationViolations('env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron"); _electron.launch({ env: isolatedDesktopEnvironment(root) });'), ["sets STREAM_JAMS_DESKTOP_USER_DATA_PATH itself"]);
  assert.deepEqual(isolationViolations('const env = isolatedDesktopEnvironment(root); await _electron.launch({ executablePath, env });'), []);
});

test("every desktop spec launches through the isolated environment", () => {
  const directory = fileURLToPath(new URL("../tests/desktop/", import.meta.url));
  const failures = readdirSync(directory).filter(name => name.endsWith(".spec.ts"))
    .flatMap(name => isolationViolations(readFileSync(join(directory, name), "utf8")).map(problem => `${name}: ${problem}`));
  assert.deepEqual(failures, []);
});
