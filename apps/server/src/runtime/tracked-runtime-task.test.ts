import type { LogContext, Logger } from "@stream-jams/core";
import { expect, it, vi } from "vitest";
import { trackRuntimeTask } from "./tracked-runtime-task.js";

const context: LogContext = {
  module: "runtime",
  source: "runtime.task.failed",
  correlationId: "ref_task",
  processingId: null
};

it("logs a rejected task with its original exception and always runs finalization", async () => {
  const failure = new Error("background failed");
  const logger = createLogger();
  const onFinally = vi.fn();

  await expect(trackRuntimeTask({
    work: async () => { throw failure; },
    logger,
    context,
    message: "Background work failed",
    onFinally
  })).rejects.toBe(failure);

  expect(logger.error).toHaveBeenCalledExactlyOnceWith("Background work failed", context, failure);
  expect(onFinally).toHaveBeenCalledOnce();
});

function createLogger(): Logger {
  return {
    debug: vi.fn(async () => {}),
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {})
  };
}
