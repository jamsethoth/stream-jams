import { onceAsync } from "./once-async.js";

/** Register before startup settles so an early signal cannot orphan the listener. */
export function installCliShutdown(
  signals: { once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown },
  runtime: Promise<{ close(): Promise<void> }>,
  onFailure: () => void
): { stop(): Promise<void>; isStopping(): boolean } {
  let stopping = false;
  const close = onceAsync(async () => {
    try { await (await runtime).close(); } catch { onFailure(); }
  });
  const stop = () => { stopping = true; return close(); };
  signals.once("SIGINT", () => { void stop(); });
  signals.once("SIGTERM", () => { void stop(); });
  return { stop, isStopping: () => stopping };
}
