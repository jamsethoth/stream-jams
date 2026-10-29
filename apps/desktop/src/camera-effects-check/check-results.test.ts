import { describe, expect, it } from "vitest";
import { createResults, recordMetrics, recordReport, runKey } from "./check-results.js";
import { summarizeGpuEngines } from "./gpu-usage.js";

const gpu = { featureStatus: { webgl2: "enabled" }, blocked: null, info: {} };
const receiver = (id: string) => ({
  receiver: id, userAgent: "obs" as const, state: "playing", pair: null, fps: 30, presentedFps: 30, width: 1920, height: 1620, packed: true,
  framesDropped: 0, decoder: null, powerEfficientDecoder: null, outputDelay: { medianMs: 80, maxMs: 120, samples: 10 },
  glassDelay: { medianMs: null, maxMs: null, samples: 0 }, reconnects: 0
});

describe("check results", () => {
  it("groups measurements per camera, format, packing and scenario", () => {
    const results = createResults({ platform: "win32" }, gpu);
    const camera = { label: "NVIDIA Broadcast", width: 1920, height: 1080 };
    const idle = runKey(camera, true, results.scenario);
    expect(idle).toBe("NVIDIA Broadcast 1920x1080 packed idle");
    recordReport(results, idle, { kind: "receiver-stats", data: receiver("obs-aaaaaa") });
    results.scenario = { name: "game", game: "Some game" };
    const game = runKey(camera, true, results.scenario);
    recordReport(results, game, { kind: "receiver-stats", data: { ...receiver("obs-aaaaaa"), fps: 24 } });
    expect(results.runs[idle]!.receivers["obs-aaaaaa"]!.fps).toBe(30);
    expect(results.runs[game]!.receivers["obs-aaaaaa"]!.fps).toBe(24);
    expect(runKey(null, false, results.scenario)).toBe("no camera plain game");
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
    recordMetrics(results, "run", { cpuPercent: 10, memoryMb: 500, gpu: { app: { "3D": 20 }, system: { "3D": 60 } } });
    recordMetrics(results, "run", { cpuPercent: 30, memoryMb: 400, gpu: { app: { "3D": 40, VideoEncode: 10 }, system: { "3D": 90 } } });
    expect(results.runs.run!.metrics).toEqual({
      samples: 2, averageCpuPercent: 20, peakCpuPercent: 30, peakMemoryMb: 500,
      gpu: { samples: 2, average: { "3D": 30, VideoEncode: 5 }, peak: { "3D": 40, VideoEncode: 10 }, systemPeak: { "3D": 90 } }
    });
  });
});

describe("GPU engine counters", () => {
  it("sums engine use per type for the app and for the whole PC", () => {
    const lines = [
      "pid_100_luid_0x00000000_0x0000d1c2_phys_0_eng_0_engtype_3D=12.5",
      "pid_100_luid_0x00000000_0x0000d1c2_phys_0_eng_5_engtype_VideoEncode=7",
      "pid_200_luid_0x00000000_0x0000d1c2_phys_0_eng_0_engtype_3D=30",
      "pid_300_luid_0x00000000_0x0000d1c2_phys_0_eng_0_engtype_3D=80",
      "garbage", ""
    ];
    expect(summarizeGpuEngines(lines, new Set([100, 200]))).toEqual({ app: { "3D": 42.5, VideoEncode: 7 }, system: { "3D": 100, VideoEncode: 7 } });
  });
});
