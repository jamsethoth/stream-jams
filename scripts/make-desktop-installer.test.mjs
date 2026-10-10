import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { installerConfig, installerDirectory, makeInstaller, setupExecutable } from "./make-desktop-installer.mjs";

const root = resolve(import.meta.dirname, "..");
const input = { appId: "io.github.jamsethoth.streamjams", version: "0.1.0", icon: "C:\\icon.ico" };

test("builds an unsigned per-user NSIS setup wizard with a folder choice", () => {
  const config = installerConfig(input);
  assert.equal(config.appId, input.appId);
  assert.equal(config.productName, "Stream Jams");
  assert.equal(config.executableName, "Stream Jams");
  assert.equal(config.directories.output, installerDirectory);
  assert.deepEqual(config.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(config.win.signAndEditExecutable, false);
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.selectPerMachineByDefault, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(config.nsis.runAfterFinish, true);
  assert.equal(config.nsis.createDesktopShortcut, true);
  assert.equal(config.nsis.createStartMenuShortcut, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.differentialPackage, false);
  assert.equal(config.nsis.artifactName, setupExecutable);
  assert.equal(config.publish, null);
  for (const key of ["certificateFile", "certificatePassword", "signtoolOptions", "azureSignOptions", "sign"]) assert.equal(key in config.win, false, key);
});

test("rejects app ids that are not reverse-DNS and non-release versions", () => {
  assert.throws(() => installerConfig({ ...input, appId: "Stream Jams" }), /reverse-DNS/);
  assert.throws(() => installerConfig({ ...input, appId: "streamjams" }), /reverse-DNS/);
  assert.throws(() => installerConfig({ ...input, version: "0.1" }), /MAJOR\.MINOR\.PATCH/);
  assert.throws(() => installerConfig({ ...input, version: "0.1.0-beta.1" }), /MAJOR\.MINOR\.PATCH/);
});

test("the desktop package and app identity are valid installer inputs", async () => {
  const manifest = JSON.parse(await readFile(join(root, "apps/desktop/package.json"), "utf8"));
  const identity = await readFile(join(root, "apps/desktop/src/app-identity.ts"), "utf8");
  const appId = /appUserModelId = "([^"]+)"/.exec(identity)?.[1];
  assert.equal(appId, input.appId);
  assert.doesNotThrow(() => installerConfig({ ...input, appId, version: manifest.version }));
});

test("refuses to build outside Windows", { skip: process.platform === "win32" }, async () => {
  await assert.rejects(makeInstaller(), /only be built on Windows/);
});
