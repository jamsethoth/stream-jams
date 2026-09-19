import type { ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { expect, type ElectronApplication } from "@playwright/test";

export async function windowByUrl<T extends { url(): string }>(desktop: { windows(): T[] }, url: string): Promise<T> {
  await expect.poll(() => desktop.windows().some((page) => page.url() === url), { timeout: 25_000 }).toBe(true);
  const page = desktop.windows().find((candidate) => candidate.url() === url);
  if (page === undefined) throw new Error(`Window disappeared: ${url}`);
  return page;
}

export async function withCleanup(action: () => Promise<void>, cleanup: () => Promise<void>): Promise<void> {
  const errors: unknown[] = [];
  try { await action(); } catch (error) { errors.push(error); }
  try { await cleanup(); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Test failed; cleanup also failed (original error first).");
}

function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error; // Access denied is not proof of exit.
  }
}

export async function removeExitedProfile(root: string, pids: readonly number[]): Promise<void> {
  if (pids.length === 0 || pids.some(isRunning)) throw new Error(`Test profile retained because process exit is unconfirmed: ${root}`);
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

export async function finishDesktop(desktop: ElectronApplication | undefined, root: string, knownPids: readonly number[], child: ChildProcess | undefined): Promise<void> {
  const pids = new Set(knownPids);
  if (desktop !== undefined) {
    if (child?.pid === undefined) throw new Error(`Desktop process was not captured; test profile retained: ${root}`);
    pids.add(child.pid);
    const metrics = await desktop.evaluate(({ app }) => app.getAppMetrics().map((entry: { pid: number }) => entry.pid)).catch(() => [] as number[]);
    for (const pid of metrics) pids.add(pid);
    if (child.exitCode === null && child.signalCode === null) {
      const closed = desktop.waitForEvent("close", { timeout: 15_000 }).then(() => null, (error: unknown) => error);
      await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
      const failure = await closed;
      if (failure !== null) throw new Error(`Shutdown failed; test profile retained: ${root}`, { cause: failure });
    }
  }
  await removeExitedProfile(root, [...pids]);
}
