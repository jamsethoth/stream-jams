import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { installCliShutdown } from "./cli-shutdown.js";

it("waits for startup and shares shutdown across SIGINT and SIGTERM", async () => {
  const signals = new EventEmitter();
  const close = vi.fn(async () => {});
  let ready!: (runtime: { close(): Promise<void> }) => void;
  const pending = new Promise<{ close(): Promise<void> }>((resolve) => { ready = resolve; });
  const failure = vi.fn();
  const shutdown = installCliShutdown(signals, pending, failure);
  signals.emit("SIGINT");
  signals.emit("SIGTERM");
  expect(shutdown.isStopping()).toBe(true);
  expect(close).not.toHaveBeenCalled();
  ready({ close });
  await shutdown.stop();
  expect(close).toHaveBeenCalledOnce();
  expect(failure).not.toHaveBeenCalled();
});

it("reports cleanup failure once without an unhandled signal callback rejection", async () => {
  const signals = new EventEmitter();
  const close = vi.fn(async () => { throw new Error("Cleanup failed"); });
  const failure = vi.fn();
  const shutdown = installCliShutdown(signals, Promise.resolve({ close }), failure);
  signals.emit("SIGTERM");
  await shutdown.stop();
  signals.emit("SIGINT");
  expect(close).toHaveBeenCalledOnce();
  expect(failure).toHaveBeenCalledOnce();
});
