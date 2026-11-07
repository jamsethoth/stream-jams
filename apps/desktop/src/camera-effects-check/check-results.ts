import type { OpenResult, ProbeResult, Report } from "./check-protocol.js";
import type { GpuUsage } from "./gpu-usage.js";

/*
 * The results the maintainer copies back. Measurements are grouped per run (camera, format,
 * packed or plain, idle or with a game) so one session can compare them side by side.
 */

type Data<K extends Report["kind"]> = Extract<Report, { kind: K }>["data"];

export interface RunMetrics {
  samples: number;
  averageCpuPercent: number;
  peakCpuPercent: number;
  peakMemoryMb: number;
  gpu: { samples: number; average: Record<string, number>; peak: Record<string, number> } | null;
}

export interface Run {
  pipeline?: Data<"pipeline-stats">;
  publisher?: Data<"publisher-stats">;
  receivers: Record<string, Data<"receiver-stats">>;
  metrics?: RunMetrics;
}

/** One report over time; a run's latest reading alone cannot show its steady state or a trend. */
export type SeriesEntry = { readonly at: number; readonly kind: "pipeline-stats" | "publisher-stats" | "receiver-stats" | "metrics"; readonly data: unknown };

export interface CheckResults {
  readonly environment: Readonly<Record<string, unknown>>;
  gpu: { readonly featureStatus: Readonly<Record<string, string>>; blocked: string | null; renderer?: string; readonly info: unknown };
  scenario: { name: "idle" | "game"; game: string; step: string };
  cameras: Record<string, ProbeResult>;
  opened: OpenResult[];
  runs: Record<string, Run>;
  series: Record<string, SeriesEntry[]>;
  manual: Record<string, boolean | string>;
  errors: Data<"error">[];
}

const boundedList = 40;
const maximumRuns = 32;
const maximumSeriesEntries = 400;

export function createResults(environment: Readonly<Record<string, unknown>>, gpu: CheckResults["gpu"]): CheckResults {
  return { environment, gpu, scenario: { name: "idle", game: "", step: "" }, cameras: {}, opened: [], runs: {}, series: {}, manual: {}, errors: [] };
}

/** The run a measurement belongs to, from what the pipeline has open right now. */
export function runKey(camera: { readonly label: string; readonly width: number; readonly height: number } | null, packed: boolean, scenario: CheckResults["scenario"]): string {
  const name = camera === null ? "no camera" : `${camera.label.slice(0, 60)} ${camera.width}x${camera.height}`;
  return `${name} ${packed ? "packed" : "plain"} ${scenario.name}${scenario.step === "" ? "" : ` ${scenario.step}`}`;
}

function run(results: CheckResults, key: string): Run | null {
  const existing = results.runs[key];
  if (existing !== undefined) return existing;
  if (Object.keys(results.runs).length >= maximumRuns) return null;
  return (results.runs[key] = { receivers: {} });
}

function pushSeries(results: CheckResults, key: string, kind: SeriesEntry["kind"], data: unknown): void {
  const list = results.series[key] ??= [];
  list.push({ at: Date.now(), kind, data });
  if (list.length > maximumSeriesEntries) list.shift();
}

export function recordReport(results: CheckResults, key: string, report: Report): void {
  switch (report.kind) {
    case "error":
      if (results.errors.length < boundedList) results.errors.push(report.data);
      return;
    case "manual":
      Object.assign(results.manual, report.data);
      return;
    case "pipeline-stats": {
      const target = run(results, key);
      if (target === null) return;
      target.pipeline = report.data;
      pushSeries(results, key, report.kind, report.data);
      return;
    }
    case "publisher-stats": {
      const target = run(results, key);
      if (target === null) return;
      target.publisher = report.data;
      pushSeries(results, key, report.kind, report.data);
      return;
    }
    case "receiver-stats": {
      const target = run(results, key);
      if (target === null || !(report.data.receiver in target.receivers || Object.keys(target.receivers).length < 16)) return;
      target.receivers[report.data.receiver] = report.data;
      pushSeries(results, key, report.kind, report.data);
      return;
    }
  }
}

/** Folds one CPU, memory and GPU sample into the run's averages and peaks. */
export function recordMetrics(results: CheckResults, key: string, sample: { readonly cpuPercent: number; readonly memoryMb: number; readonly gpu: GpuUsage | null }): void {
  const target = run(results, key);
  if (target === null) return;
  pushSeries(results, key, "metrics", sample);
  const metrics = target.metrics ??= { samples: 0, averageCpuPercent: 0, peakCpuPercent: 0, peakMemoryMb: 0, gpu: null };
  metrics.samples += 1;
  metrics.averageCpuPercent = round(metrics.averageCpuPercent + (sample.cpuPercent - metrics.averageCpuPercent) / metrics.samples);
  metrics.peakCpuPercent = round(Math.max(metrics.peakCpuPercent, sample.cpuPercent));
  metrics.peakMemoryMb = Math.round(Math.max(metrics.peakMemoryMb, sample.memoryMb));
  if (sample.gpu === null) return;
  const gpu = metrics.gpu ??= { samples: 0, average: {}, peak: {} };
  gpu.samples += 1;
  for (const [engine, value] of Object.entries(sample.gpu)) {
    gpu.average[engine] = round((gpu.average[engine] ?? 0) + (value - (gpu.average[engine] ?? 0)) / gpu.samples);
    gpu.peak[engine] = Math.max(gpu.peak[engine] ?? 0, value);
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
