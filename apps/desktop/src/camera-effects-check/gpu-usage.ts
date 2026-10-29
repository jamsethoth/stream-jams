import { execFile } from "node:child_process";

/*
 * GPU use per engine from the Windows "GPU Engine" performance counters, which Task Manager
 * also reads. Electron reports CPU per process but not GPU, so the check samples these.
 * Counter instance names look like `pid_1234_luid_0x0_0x1_phys_0_eng_0_engtype_3D`.
 */

export interface GpuUsage {
  /** Percent per engine type (3D, VideoEncode, VideoDecode...) over the app's processes, capped at 100. shortcut: sums every GPU's engines of a type, split by adapter if a PC with two GPUs reads oddly. */
  readonly app: Readonly<Record<string, number>>;
  /** The same over every process on the PC, so a running game shows up. */
  readonly system: Readonly<Record<string, number>>;
}

/** Parses `instance=value` lines into per-engine-type totals. */
export function summarizeGpuEngines(lines: readonly string[], appPids: ReadonlySet<number>): GpuUsage {
  const app: Record<string, number> = {};
  const system: Record<string, number> = {};
  for (const line of lines) {
    const match = /^pid_(\d+)_.*_engtype_([A-Za-z0-9]+)=([\d.]+)$/u.exec(line.trim());
    if (match === null) continue;
    const [, pid, engine, value] = match;
    const percent = Number(value);
    if (!Number.isFinite(percent)) continue;
    system[engine!] = (system[engine!] ?? 0) + percent;
    if (appPids.has(Number(pid))) app[engine!] = (app[engine!] ?? 0) + percent;
  }
  const round = (record: Record<string, number>) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, Math.round(Math.min(100, value) * 10) / 10]));
  return { app: round(app), system: round(system) };
}

const script = "(Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Where-Object CookedValue -gt 0 | ForEach-Object { $_.InstanceName + '=' + $_.CookedValue }";

/** One sample on Windows; null elsewhere or when the counters are unavailable (for example on a non-English Windows). */
export function sampleGpuEngines(appPids: ReadonlySet<number>): Promise<GpuUsage | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 8_000 }, (error, stdout) => {
      resolve(error === null ? summarizeGpuEngines(stdout.split(/\r?\n/u), appPids) : null);
    });
  });
}
