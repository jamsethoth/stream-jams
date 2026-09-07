import { expect, it } from "vitest";
import { onceAsync } from "./once-async.js";

it("runs cleanup once and shares its completion with concurrent and later callers", async () => {
  const effects: string[] = [];
  let release!: () => void;
  const close = onceAsync(async () => {
    effects.push("started");
    await new Promise<void>((resolve) => { release = resolve; });
    effects.push("finished");
  });
  const first = close();
  expect(close()).toBe(first);
  await Promise.resolve();
  expect(effects).toEqual(["started"]);
  release();
  await first;
  await close();
  expect(effects).toEqual(["started", "finished"]);
});

it("shares cleanup failure without rerunning destructive teardown", async () => {
  let attempts = 0;
  const close = onceAsync(async () => { attempts += 1; throw new Error("cleanup failed"); });
  await expect(close()).rejects.toThrow("cleanup failed");
  await expect(close()).rejects.toThrow("cleanup failed");
  expect(attempts).toBe(1);
});
