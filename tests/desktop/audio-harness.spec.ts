import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { finishDesktop, removeExitedProfile, windowByUrl, withCleanup } from "./audio-harness.js";

test("management selection ignores an earlier audio window and waits for its URL", async () => {
  const audio = { url: () => "stream-jams-audio://player/" };
  let managementUrl = "about:blank";
  const management = { url: () => managementUrl };
  const desktop = { windows: () => [audio, management] };
  const selection = windowByUrl(desktop, "http://127.0.0.1:43210/manage");
  managementUrl = "http://127.0.0.1:43210/manage";
  expect(await selection).toBe(management);
});

test("cleanup preserves both the original failure and its own failure", async () => {
  const original = new Error("startup failed");
  const cleanup = new Error("profile busy");
  const result = await withCleanup(async () => { throw original; }, async () => { throw cleanup; }).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(AggregateError);
  expect((result as AggregateError).errors).toEqual([original, cleanup]);
});

test("cleanup failures fail an otherwise successful test", async () => {
  const cleanup = new Error("shutdown timed out");
  await expect(withCleanup(async () => undefined, async () => { throw cleanup; })).rejects.toBe(cleanup);
});

test("cleanup uses the captured child after Playwright clears its process reference", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-harness-exited-"));
  const child = spawn(process.execPath, ["-e", ""], { windowsHide: true, stdio: "ignore" });
  await once(child, "close");
  expect(child.exitCode).toBe(0);
  const desktop = {
    process() { throw new Error("Playwright process reference was cleared"); },
    async evaluate() { throw new Error("Application already closed"); }
  } as unknown as ElectronApplication;
  try {
    await expect(finishDesktop(desktop, root, [child.pid!], child)).resolves.toBeUndefined();
    await expect(access(root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup retains the profile if no child process was captured", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-harness-unknown-"));
  const desktop = {
    process() { throw new Error("Playwright process reference was cleared"); }
  } as unknown as ElectronApplication;
  try {
    await expect(finishDesktop(desktop, root, [], undefined)).rejects.toThrow("profile retained");
    await access(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a live owned process prevents profile deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-harness-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
  await once(child, "spawn");
  try {
    await expect(removeExitedProfile(root, [child.pid!])).rejects.toThrow("retained");
    await access(root);
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await removeExitedProfile(root, [child.pid!]);
    await expect(access(root)).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  }
});
