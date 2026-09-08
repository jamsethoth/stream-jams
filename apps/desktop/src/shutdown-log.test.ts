import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ShutdownLog } from "./shutdown-log.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-phase-log-"));
  roots.push(root);
  return { root, file: join(root, "phases.jsonl") };
}
async function contents(file: string): Promise<string> {
  return readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
}

describe("shutdown phase evidence", () => {
  it("does not create evidence when disabled or given a relative path", async () => {
    const { root, file } = await fixture();
    for (const path of [undefined, relative(process.cwd(), file)]) {
      const log = new ShutdownLog(path);
      log.record("quit-requested");
      log.close();
    }
    expect(await readdir(root)).toEqual([]);
  });

  it("records ordered attempts without accepting arbitrary phases or payloads", async () => {
    const { file } = await fixture();
    const log = new ShutdownLog(file);
    const record = log.record.bind(log) as (phase: unknown, extra?: unknown) => void;
    record("quit-requested", { token: "private-token", url: "https://private.invalid/" });
    record("decision-cancelled");
    record("private-token");
    record({ phase: "electron-quit", token: "private-token" });
    record("quit-requested");
    record("decision-accepted");
    log.close();
    await expect.poll(async () => (await contents(file)).trim().split("\n").length).toBe(4);
    const text = await contents(file);
    const rows = text.trim().split("\n").map(line => JSON.parse(line));
    expect(rows.map(row => [row.sequence, row.attempt, row.phase])).toEqual([
      [1, 1, "quit-requested"], [2, 1, "decision-cancelled"], [3, 2, "quit-requested"], [4, 2, "decision-accepted"]
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(["attempt", "elapsedMs", "launchId", "phase", "pid", "sequence", "utc", "version"]);
    expect(rows.every(row => row.version === 1 && row.pid === process.pid && row.launchId === rows[0].launchId)).toBe(true);
    expect(rows[0].launchId).toMatch(/^[\da-f-]{36}$/);
    expect(rows[0].elapsedMs).toBeGreaterThanOrEqual(0);
    expect(rows[3].elapsedMs).toBeGreaterThanOrEqual(rows[0].elapsedMs);
    expect(Number.isFinite(Date.parse(rows[0].utc))).toBe(true);
    expect(text).not.toMatch(/private-token|private\.invalid/);
  });

  it("preserves existing evidence and tolerates an unavailable destination", async () => {
    const { root, file } = await fixture();
    await writeFile(file, "existing evidence\n");
    for (const path of [file, root, join(root, "missing", "phases.jsonl")]) {
      const log = new ShutdownLog(path);
      expect(() => { log.record("quit-requested"); log.close(); }).not.toThrow();
    }
    // Let asynchronous open failures surface; an unhandled stream error fails Vitest.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(await readFile(file, "utf8")).toBe("existing evidence\n");
    expect(await readdir(root)).toEqual(["phases.jsonl"]);
  });

  it("bounds accepted and queued evidence during repeated requests", async () => {
    const { file } = await fixture();
    const log = new ShutdownLog(file);
    for (let i = 0; i < 2_000; i++) log.record("quit-requested");
    log.close();
    await expect.poll(async () => (await contents(file)).trim().split("\n").length).toBe(256);
    const text = await contents(file);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(64 * 1024);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("does not accept more writes after close and uses a new launch identity", async () => {
    const { root, file } = await fixture();
    const second = join(root, "second.jsonl");
    for (const path of [file, second]) {
      const log = new ShutdownLog(path);
      log.record("electron-quit");
      log.close();
      expect(() => { log.record("quit-requested"); log.close(); }).not.toThrow();
    }
    await expect.poll(async () => (await contents(second)).length).toBeGreaterThan(0);
    const firstRecord = JSON.parse((await contents(file)).trim());
    const secondRecord = JSON.parse((await contents(second)).trim());
    expect(firstRecord.phase).toBe("electron-quit");
    expect(secondRecord.launchId).not.toBe(firstRecord.launchId);
  });
});
