import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { timerRunStateSchema } from "../../packages/core/dist/index.js";

function message(child: ChildProcess): Promise<{ type: string; state: unknown; cues: string[] }> {
  return new Promise((resolveMessage, reject) => {
    const deadline = setTimeout(() => finish(new Error("Timer child did not respond")), 10000);
    const onMessage = (value: unknown) => { cleanup(); resolveMessage(value as { type: string; state: unknown; cues: string[] }); };
    const onExit = () => finish(new Error("Timer child exited before responding"));
    const finish = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => { clearTimeout(deadline); child.off("message", onMessage); child.off("exit", onExit); child.off("error", finish); };
    child.once("message", onMessage); child.once("exit", onExit); child.once("error", finish);
  });
}

test("recovers the last real SQLite checkpoint after a forced process crash", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-timer-crash-"));
  let child: ChildProcess | undefined;
  const launch = (mode: string) => fork(resolve("tests/fixtures/persistent-timer-crash.mjs"), [root, mode], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  try {
    child = launch("start");
    const checkpoint = await message(child);
    expect(checkpoint.type).toBe("checkpoint");
    expect(checkpoint.cues).toEqual(["start"]);
    const saved = timerRunStateSchema.parse(checkpoint.state);
    expect(saved.status).toBe("paused");
    if (saved.status !== "paused") throw new Error("Expected a paused checkpoint");
    expect(saved.remainingMs).toBeLessThan(60000);
    expect(saved.remainingMs).toBeGreaterThan(0);
    const exited = once(child, "exit");
    expect(child.kill("SIGKILL")).toBe(true);
    await exited;
    const database = new DatabaseSync(join(root, "crash.sqlite"), { readOnly: true });
    let lastCheckpoint;
    try {
      const row = database.prepare("SELECT state_json FROM timer_run_recovery WHERE timer_id = ?").get("crash");
      lastCheckpoint = timerRunStateSchema.parse(JSON.parse(String(row?.state_json)));
    } finally { database.close(); }
    // If the OS delayed delivery of the checkpoint notification, a newer save
    // may have landed before the kill. Recovery must equal the actual disk row.
    expect(lastCheckpoint.status).toBe("paused");
    if (lastCheckpoint.status !== "paused") throw new Error("Expected retained disk checkpoint");
    expect(lastCheckpoint.remainingMs).toBeLessThanOrEqual(saved.remainingMs);
    child = launch("recover");
    const restored = await message(child);
    expect(restored.type).toBe("restored");
    expect(restored.state).toEqual(lastCheckpoint);
    expect(restored.cues).toEqual([]);
    // Poll across a complete checkpoint interval; downtime never ticks a paused run.
    await expect.poll(async () => {
      const response = message(child!); child!.send("state");
      const current = await response;
      expect(current.state).toEqual(lastCheckpoint); expect(current.cues).toEqual([]);
      return Date.now();
    }, { intervals: [100, 300, 500], timeout: 5000 }).toBeGreaterThan(Date.now() + 1200);
    const closed = once(child, "exit"); child.send("close"); await closed;
    child = undefined;
  } finally {
    if (child !== undefined && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
});
