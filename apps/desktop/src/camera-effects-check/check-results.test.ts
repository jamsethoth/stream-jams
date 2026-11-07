import { describe, expect, it } from "vitest";
import { receiverCounterNames } from "./check-protocol.js";
import { createResults, recordMetrics, recordReport, runKey } from "./check-results.js";
import { parseNvidiaSmi } from "./gpu-usage.js";

const gpu = { featureStatus: { webgl2: "enabled" }, blocked: null, info: {} };
const receiver = (id: string) => ({
  receiver: id, userAgent: "obs" as const, state: "playing", pair: null, fps: 30, presentedFps: 30, width: 1920, height: 1620, packed: true,
  framesDropped: 0, decoder: null, powerEfficientDecoder: null, outputDelay: { medianMs: 80, maxMs: 120, samples: 10 },
  glassDelay: { medianMs: null, maxMs: null, samples: 0 }, reconnects: 0, presentedFrames: 0, presentedGaps: 0,
  counters: Object.fromEntries(receiverCounterNames.map(name => [name, 0])) as Record<(typeof receiverCounterNames)[number], number>
});

describe("check results", () => {
  it("groups measurements per camera, format, packing and scenario", () => {
    const results = createResults({ platform: "win32" }, gpu);
    const camera = { label: "NVIDIA Broadcast", width: 1920, height: 1080 };
    const idle = runKey(camera, true, results.scenario);
    expect(idle).toBe("NVIDIA Broadcast 1920x1080 packed idle");
    recordReport(results, idle, { kind: "receiver-stats", data: receiver("obs-aaaaaa") });
    results.scenario = { name: "game", game: "Some game", step: "" };
    const game = runKey(camera, true, results.scenario);
    recordReport(results, game, { kind: "receiver-stats", data: { ...receiver("obs-aaaaaa"), fps: 24 } });
    expect(results.runs[idle]!.receivers["obs-aaaaaa"]!.fps).toBe(30);
    expect(results.runs[game]!.receivers["obs-aaaaaa"]!.fps).toBe(24);
    expect(runKey(null, false, results.scenario)).toBe("no camera plain game");
    results.scenario = { ...results.scenario, step: "one receiver" };
    expect(runKey(camera, true, results.scenario)).toBe("NVIDIA Broadcast 1920x1080 packed game one receiver");
  });

  it("keeps a bounded time series per run while the run holds the latest reading", () => {
    const results = createResults({}, gpu);
    for (let fps = 0; fps < 450; fps += 1) recordReport(results, "run", { kind: "receiver-stats", data: { ...receiver("obs-aaaaaa"), fps } });
    expect(results.runs.run!.receivers["obs-aaaaaa"]!.fps).toBe(449);
    expect(results.series.run).toHaveLength(400);
    expect((results.series.run![0]!.data as { fps: number }).fps).toBe(50);
    expect(results.series.run![0]!.kind).toBe("receiver-stats");
    recordMetrics(results, "run", { cpuPercent: 1, memoryMb: 1, gpu: null });
    expect(results.series.run!.at(-1)!.kind).toBe("metrics");
    recordReport(results, "run", { kind: "manual", data: { noDrift: true } });
    expect(results.series.run).toHaveLength(400);
  });

  it("keeps lists and runs bounded and merges manual answers", () => {
    const results = createResults({}, gpu);
    for (let index = 0; index < 50; index += 1) recordReport(results, "run", { kind: "error", data: { role: "x", message: String(index) } });
    expect(results.errors).toHaveLength(40);
    for (let index = 0; index < 40; index += 1) recordReport(results, `run ${index}`, { kind: "publisher-stats", data: [] });
    expect(Object.keys(results.runs)).toHaveLength(32);
    recordReport(results, "run", { kind: "manual", data: { noDrift: true } });
    recordReport(results, "run", { kind: "manual", data: { notes: "ok" } });
    expect(results.manual).toEqual({ noDrift: true, notes: "ok" });
  });

  it("averages CPU and GPU per run and keeps peaks", () => {
    const results = createResults({}, gpu);
    recordMetrics(results, "run", { cpuPercent: 10, memoryMb: 500, gpu: { gpu: 20 } });
    recordMetrics(results, "run", { cpuPercent: 30, memoryMb: 400, gpu: { gpu: 40, encoder: 10 } });
    expect(results.runs.run!.metrics).toEqual({
      samples: 2, averageCpuPercent: 20, peakCpuPercent: 30, peakMemoryMb: 500,
      gpu: { samples: 2, average: { gpu: 30, encoder: 5 }, peak: { gpu: 40, encoder: 10 } }
    });
  });
});

describe("nvidia-smi output", () => {
  it("reads the first GPU's line and leaves out fields the driver does not report", () => {
    expect(parseNvidiaSmi("38, 3, 6, 5288\r\n12, 0, 0, 100\r\n")).toEqual({ gpu: 38, encoder: 3, decoder: 6, memoryMb: 5288 });
    expect(parseNvidiaSmi("38, [N/A], 6, 5288\n")).toEqual({ gpu: 38, decoder: 6, memoryMb: 5288 });
  });

  it("gives nothing for output it cannot read", () => {
    expect(parseNvidiaSmi("")).toBeNull();
    expect(parseNvidiaSmi("NVIDIA-SMI has failed\n")).toBeNull();
  });
});
