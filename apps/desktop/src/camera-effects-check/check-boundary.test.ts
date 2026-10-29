import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commandSchema, defaultPipelineSettings, gpuBlockReason, isSoftwareRenderer, publisherEnvelopeSchema, reportSchema } from "./check-protocol.js";
import { pathAfterToken, staticFiles } from "./check-server.js";

const token = "Abc123_-Abc123_-Abc123_-Abc123_-";

describe("per-run token", () => {
  it("serves only paths under the exact token", () => {
    expect(pathAfterToken(`/${token}/receiver`, token)).toBe("/receiver");
    expect(pathAfterToken(`/${token}/app/mediapipe/face_landmarker.task`, token)).toBe("/app/mediapipe/face_landmarker.task");
    expect(pathAfterToken(`/${token.slice(0, -1)}x/receiver`, token)).toBeNull();
    expect(pathAfterToken(`/${token}x/receiver`, token)).toBeNull();
    expect(pathAfterToken("/receiver", token)).toBeNull();
    expect(pathAfterToken(`/${token}`, token)).toBeNull();
  });

  it("serves only built files of known types from the app directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "camera-check-static-"));
    try {
      await mkdir(join(directory, "mediapipe"));
      await writeFile(join(directory, "pipeline.js"), "");
      await writeFile(join(directory, "mediapipe", "face_landmarker.task"), "");
      await writeFile(join(directory, "notes.txt"), "");
      const files = await staticFiles(directory);
      expect([...files.keys()].sort()).toEqual(["/app/mediapipe/face_landmarker.task", "/app/pipeline.js"]);
      expect(files.get("/app/pipeline.js")?.type).toBe("text/javascript; charset=utf-8");
      expect(files.has("/app/../check-main.js")).toBe(false);
    } finally {
      // Only the directory returned by mkdtemp above is removed.
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("pinned MediaPipe models", () => {
  it("match the SHA-256 recorded beside their source URL", async () => {
    const assets = new URL("../../assets/camera-effects-check/", import.meta.url);
    const models = JSON.parse(await readFile(new URL("models.json", assets), "utf8")) as { file: string; url: string; sha256: string }[];
    expect(models.map(model => model.file).sort()).toEqual(["face_landmarker.task", "selfie_segmenter.tflite"]);
    for (const model of models) {
      expect(model.url).toMatch(/^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.+\/float16\/1\//u);
      expect(createHash("sha256").update(await readFile(new URL(model.file, assets))).digest("hex")).toBe(model.sha256);
    }
  });
});

describe("GPU gate", () => {
  it("blocks unless WebGL2 and GPU compositing are hardware accelerated", () => {
    expect(gpuBlockReason({ webgl: "enabled", gpu_compositing: "enabled", video_encode: "enabled" })).toBeNull();
    expect(gpuBlockReason({ webgl: "enabled_readback", gpu_compositing: "enabled" })).toBeNull();
    expect(gpuBlockReason({ webgl: "disabled_off", gpu_compositing: "disabled_software" })).toMatch(/webgl: disabled_off, gpu_compositing: disabled_software/u);
    expect(gpuBlockReason({})).toMatch(/does not run in software/u);
  });

  it("treats software WebGL renderers as no GPU", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
  });
});

describe("boundary schemas", () => {
  it("accepts commands the control page sends and rejects anything else", () => {
    expect(commandSchema.safeParse({ action: "configure", settings: defaultPipelineSettings }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "open", deviceId: "abc", width: 1920, height: 1080, frameRate: 30 }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "layout", layout: { x: 1280, y: 720, width: 640, height: 360 } }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "configure", settings: { ...defaultPipelineSettings, keyColor: "red" } }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "open", deviceId: "", width: 1920, height: 1080, frameRate: 30 }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "layout", layout: { x: 0, y: 0, width: 1, height: 1 } }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "eval", code: "1" }).success).toBe(false);
  });

  it("carries only local mirror signals, tagged with a well-formed receiver id", () => {
    const hello = { type: "hello", connection: 1, media: "video", maxWidth: 1920, maxHeight: 1620 };
    expect(publisherEnvelopeSchema.safeParse({ receiverId: "obs-abc123", signal: hello }).success).toBe(true);
    expect(publisherEnvelopeSchema.safeParse({ receiverId: "../publisher", signal: hello }).success).toBe(false);
    const remote = { type: "ice", connection: 1, candidate: { candidate: "candidate:1 1 udp 1 203.0.113.9 5000 typ srflx" } };
    expect(publisherEnvelopeSchema.safeParse({ receiverId: "obs-abc123", signal: remote }).success).toBe(false);
  });

  it("validates reports, including the results the pipeline and receivers send", () => {
    const timing = { medianMs: 4.2, p95Ms: 7, maxMs: 9 };
    const pipeline = {
      cameraFps: 30, processedFps: 29.9, processedFrames: 300, skippedFrames: 1, cameraAlpha: false, frameMs: timing,
      tracking: { ...timing, facePercent: 98, blendshapes: 52, delegate: "GPU" }, segmentation: null,
      output: { width: 1920, height: 1620 }, webgl: { renderer: "ANGLE (NVIDIA)", software: false }, settings: defaultPipelineSettings
    };
    expect(reportSchema.safeParse({ kind: "pipeline-stats", data: pipeline }).success).toBe(true);
    expect(reportSchema.safeParse({ kind: "pipeline-stats", data: { ...pipeline, extra: 1 } }).success).toBe(false);
    expect(reportSchema.safeParse({ kind: "manual", data: { noDrift: true, notes: "fine" } }).success).toBe(true);
    expect(reportSchema.safeParse({ kind: "manual", data: { "__proto__x": true } }).success).toBe(false);
    expect(reportSchema.safeParse({ kind: "error", data: { role: "pipeline", message: "x".repeat(501) } }).success).toBe(false);
  });
});
