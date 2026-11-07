import { execFile } from "node:child_process";

/*
 * Whole-GPU use from nvidia-smi, about 100 ms per read. The Windows "GPU Engine" counters
 * gave per-process figures, but one read took 13 to 15 s and 12 s of CPU, so they timed out
 * in every run and added load of their own.
 * shortcut: NVIDIA only, first GPU, whole PC not per process; read those counters once if a run needs the split.
 */

export type GpuUsage = Readonly<Record<string, number>>;

const fields = { gpu: "utilization.gpu", encoder: "utilization.encoder", decoder: "utilization.decoder", memoryMb: "memory.used" } as const;

/** The first GPU's line; a field the driver reports as N/A is left out. */
export function parseNvidiaSmi(stdout: string): GpuUsage | null {
  const values = (stdout.trim().split(/\r?\n/u)[0] ?? "").split(",").map(value => value.trim());
  const usage = Object.fromEntries(Object.keys(fields).flatMap((name, index) => {
    const value = values[index];
    // Number("") is 0, so an empty field must not read as an idle GPU.
    return value === undefined || value === "" || !Number.isFinite(Number(value)) ? [] : [[name, Number(value)] as const];
  }));
  return Object.keys(usage).length === 0 ? null : usage;
}

/** One sample, or null when nvidia-smi is missing or fails. */
export function sampleGpu(): Promise<GpuUsage | null> {
  return new Promise(resolve => {
    execFile("nvidia-smi", [`--query-gpu=${Object.values(fields).join(",")}`, "--format=csv,noheader,nounits"], { windowsHide: true, timeout: 2_000 }, (error, stdout) => {
      resolve(error === null ? parseNvidiaSmi(stdout) : null);
    });
  });
}
