import { describe, expect, it, vi } from "vitest";
import { createMusicOutputSyncQueue } from "./music-output-sync-queue.js";

describe("production Music output sync queue", () => {
  it("upgrades pending ordinary work when an explicit test refresh arrives", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const included: boolean[] = [];
    const queue = createMusicOutputSyncQueue(async includeTest => {
      included.push(includeTest);
      if (included.length === 1) await blocked;
    });
    const active = queue(false);
    const pending = queue(false);
    expect(queue(true)).toBe(pending);
    release(); await active; await pending;
    expect(included).toEqual([false, true]);
  });
  it("keeps one pending refresh, preserves test inclusion and drains after a failure", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const delivered: boolean[] = [];
    let first = true;
    const queue = createMusicOutputSyncQueue(async includeTest => {
      delivered.push(includeTest);
      if (first) { first = false; await blocked; throw new Error("recipient failed"); }
    });
    const active = queue(true);
    const rejected = expect(active).rejects.toThrow("recipient failed");
    const pending = queue();
    for (let i = 0; i < 20; i++) expect(queue()).toBe(pending);
    expect(delivered).toEqual([true]);
    release(); await rejected; await pending;
    expect(delivered).toEqual([true, true]);
    await queue(false);
    expect(delivered).toEqual([true, true, false]);
  });

  it("uses latest state when the pending production callback starts", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const observations: number[] = [];
    let revision = 1;
    const sync = vi.fn(async () => { observations.push(revision); if (observations.length === 1) await blocked; });
    const queue = createMusicOutputSyncQueue(sync);
    const active = queue(); const pending = queue(); revision = 20;
    release(); await active; await pending;
    expect(observations).toEqual([1, 20]);
  });
});
