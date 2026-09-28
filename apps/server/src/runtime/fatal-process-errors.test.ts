import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { installFatalProcessErrorHandlers } from "./fatal-process-errors.js";

it.each(["uncaughtException", "unhandledRejection"] as const)("durably owns %s without throwing from the observer", (event) => {
  const processAdapter = new EventEmitter() as EventEmitter & { exitCode?: number };
  const emergencyWriter = { write: vi.fn() };
  const remove = installFatalProcessErrorHandlers({
    process: processAdapter,
    emergencyWriter,
    generateReferenceId: () => "fatal_ref",
    now: () => new Date("2026-09-27T20:00:00.000Z")
  });
  const failure = new Error(`${event} failure`);

  expect(() => processAdapter.emit(event, failure)).not.toThrow();
  expect(processAdapter.exitCode).toBe(1);
  expect(emergencyWriter.write).toHaveBeenCalledWith(expect.objectContaining({
    event: `process.${event}`,
    referenceId: "fatal_ref",
    originalException: failure
  }));

  remove();
  expect(processAdapter.listenerCount(event)).toBe(0);
});
