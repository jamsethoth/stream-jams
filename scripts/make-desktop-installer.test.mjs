import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { installerDirectory, installerOptions, makeInstaller, setupExecutable } from "./make-desktop-installer.mjs";

const root = resolve(import.meta.dirname, "..");
const input = { packageId: "StreamJams", appDirectory: "C:\\temp\\stream-jams-installer-x", version: "0.1.0", description: "Stream Jams Windows desktop runtime", setupIcon: "C:\\icon.ico" };

test("builds an unsigned per-user Squirrel installer without MSI or delta packages", () => {
  const options = installerOptions(input);
  assert.equal(options.name, "StreamJams");
  assert.equal(options.exe, "Stream Jams.exe");
  assert.equal(options.title, "Stream Jams");
  assert.equal(options.setupExe, setupExecutable);
  assert.equal(options.outputDirectory, installerDirectory);
  assert.equal(options.noMsi, true);
  assert.equal(options.noDelta, true);
  for (const key of ["certificateFile", "certificatePassword", "signWithParams", "windowsSign", "remoteReleases", "remoteToken"]) assert.equal(key in options, false, key);
});

test("rejects package ids Squirrel cannot use and non-release versions", () => {
  assert.throws(() => installerOptions({ ...input, packageId: "stream-jams" }), /alphanumeric/);
  assert.throws(() => installerOptions({ ...input, packageId: "Stream Jams" }), /alphanumeric/);
  assert.throws(() => installerOptions({ ...input, version: "0.1" }), /MAJOR\.MINOR\.PATCH/);
  assert.throws(() => installerOptions({ ...input, version: "0.1.0-beta.1" }), /MAJOR\.MINOR\.PATCH/);
});

test("the desktop package carries a release version for the installer", async () => {
  const manifest = JSON.parse(await readFile(join(root, "apps/desktop/package.json"), "utf8"));
  assert.doesNotThrow(() => installerOptions({ ...input, version: manifest.version }));
  assert.notEqual(manifest.version, "0.0.0");
});

test("refuses to build outside Windows", { skip: process.platform === "win32" }, async () => {
  await assert.rejects(makeInstaller(), /only be built on Windows/);
});
