import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gpuPreferenceFileName,
  GpuPreferenceSync,
  readGpuAccelerationPreference,
  readPersistedGpuPreference,
  writeGpuAccelerationPreference,
  type GpuPreferenceFileSystem
} from "./gpu-preference.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-gpu-preference-"));
  roots.push(root);
  return root;
}

describe("GPU preference file", () => {
  it("defaults to GPU acceleration when the file is missing", async () => {
    const root = await fixture();
    expect(readPersistedGpuPreference(root)).toBeNull();
    expect(readGpuAccelerationPreference(root)).toBe(true);
  });

  it.each([
    ["not JSON", "{"],
    ["wrong version", JSON.stringify({ version: 2, gpuAcceleration: false })],
    ["non-boolean value", JSON.stringify({ version: 1, gpuAcceleration: "false" })],
    ["missing value", JSON.stringify({ version: 1 })],
    ["unknown field", JSON.stringify({ version: 1, gpuAcceleration: false, extra: true })],
    ["non-object", JSON.stringify([false])]
  ])("ignores a malformed file (%s) and keeps GPU acceleration on", async (_label, contents) => {
    const root = await fixture();
    await writeFile(join(root, gpuPreferenceFileName), contents);
    expect(readPersistedGpuPreference(root)).toBeNull();
    expect(readGpuAccelerationPreference(root)).toBe(true);
  });

  it("treats an unreadable file as the default", async () => {
    const root = await fixture();
    const fs = failingFileSystem({ readFile: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } });
    expect(readGpuAccelerationPreference(root, fs)).toBe(true);
  });

  it("round-trips both values and leaves no temporary file", async () => {
    const root = await fixture();
    writeGpuAccelerationPreference(root, false);
    expect(readGpuAccelerationPreference(root)).toBe(false);
    expect(JSON.parse(await readFile(join(root, gpuPreferenceFileName), "utf8"))).toEqual({ version: 1, gpuAcceleration: false });
    writeGpuAccelerationPreference(root, true);
    expect(readPersistedGpuPreference(root)).toBe(true);
    expect(await readdir(root)).toEqual([gpuPreferenceFileName]);
  });

  it("creates a missing userData directory before writing", async () => {
    const root = join(await fixture(), "nested", "profile");
    writeGpuAccelerationPreference(root, false);
    expect(readGpuAccelerationPreference(root)).toBe(false);
  });

  it("keeps the previous file and removes the temporary file when the rename fails", async () => {
    const root = await fixture();
    writeGpuAccelerationPreference(root, false);
    const removed: string[] = [];
    const fs = failingFileSystem({ rename: () => { throw new Error("locked"); }, remove: (path) => { removed.push(path); } });
    expect(() => writeGpuAccelerationPreference(root, true, fs)).toThrow("locked");
    expect(removed).toHaveLength(1);
    expect(readGpuAccelerationPreference(root)).toBe(false);
  });
});

describe("GpuPreferenceSync", () => {
  it("writes only when the service setting differs from the file", async () => {
    const root = await fixture();
    const writes: boolean[] = [];
    const fs = recordingFileSystem(writes);
    const diagnose = vi.fn();
    const sync = new GpuPreferenceSync(root, diagnose, fs);
    sync.sync(false);
    sync.sync(false);
    sync.sync(true);
    sync.sync(true);
    expect(writes).toEqual([false, true]);
    expect(readGpuAccelerationPreference(root)).toBe(true);
    expect(diagnose).not.toHaveBeenCalled();
  });

  it("does not rewrite a matching existing file", async () => {
    const root = await fixture();
    writeGpuAccelerationPreference(root, false);
    const writes: boolean[] = [];
    new GpuPreferenceSync(root, vi.fn(), recordingFileSystem(writes)).sync(false);
    expect(writes).toEqual([]);
  });

  it("replaces a malformed file even when the setting matches the default", async () => {
    const root = await fixture();
    await writeFile(join(root, gpuPreferenceFileName), "{");
    new GpuPreferenceSync(root, vi.fn()).sync(true);
    expect(readPersistedGpuPreference(root)).toBe(true);
  });

  it("records one diagnostic per failed value and retries after the value changes", async () => {
    const root = await fixture();
    let failing = true;
    const fs = failingFileSystem({ rename: (from, to) => { if (failing) throw new Error("disk full"); realFileSystem.rename(from, to); } });
    const diagnose = vi.fn();
    const sync = new GpuPreferenceSync(root, diagnose, fs);
    sync.sync(false);
    sync.sync(false);
    expect(diagnose).toHaveBeenCalledTimes(1);
    expect(diagnose).toHaveBeenCalledWith(expect.objectContaining({ component: "gpu-preference", source: "desktop.gpu-preference.write-failed" }));
    expect(readPersistedGpuPreference(root)).toBeNull();
    failing = false;
    sync.sync(true);
    sync.sync(false);
    expect(readGpuAccelerationPreference(root)).toBe(false);
    expect(diagnose).toHaveBeenCalledTimes(1);
  });
});

const realFileSystem: GpuPreferenceFileSystem = {
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, contents) => { writeFileSync(path, contents); },
  rename: (from, to) => { renameSync(from, to); },
  remove: (path) => { rmSync(path, { force: true }); },
  ensureDirectory: (path) => { mkdirSync(path, { recursive: true }); }
};

function failingFileSystem(overrides: Partial<GpuPreferenceFileSystem>): GpuPreferenceFileSystem {
  return { ...realFileSystem, ...overrides };
}

function recordingFileSystem(writes: boolean[]): GpuPreferenceFileSystem {
  return failingFileSystem({
    writeFile: (path, contents) => {
      writes.push((JSON.parse(contents) as { gpuAcceleration: boolean }).gpuAcceleration);
      realFileSystem.writeFile(path, contents);
    }
  });
}
