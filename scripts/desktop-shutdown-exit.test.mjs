import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import { test } from "node:test";
import { observeNativeExit } from "./desktop-shutdown-exit.mjs";

test("native exit observation waits for the actual child exit result", async () => {
  const child = spawn(process.execPath, ["-e", "process.exitCode = 7"], { stdio: "ignore", windowsHide: true });
  const closed = once(child, "close");
  try {
    assert.equal(child.exitCode, null);
    const result = observeNativeExit(child);
    assert.equal(await result, 7);
    assert.equal(child.exitCode, 7);
  } finally {
    await closed; // This short-lived owned Node child exits normally; never kill it.
  }
});

test("native exit observation also accepts a child that has already exited", async () => {
  const child = spawn(process.execPath, ["-e", "process.exitCode = 0"], { stdio: "ignore", windowsHide: true });
  await once(child, "close");
  assert.equal(await observeNativeExit(child), 0);
});
