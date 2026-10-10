import { describe, expect, it } from "vitest";
import {
  desktopVideoCommandSchema, desktopVideoEventSchema, isLocalHostIceCandidate, overlayVideoDurationReportSchema, parseYouTubeMessage,
  videoMediaDurationMaximumMs, videoMirrorPublisherSignalSchema, videoMirrorReceiverIdSchema, videoMirrorReceiverSignalSchema, videoMirrorVideoEncoding
} from "./contract.js";
import { videosModuleConfigSchema, createDefaultVideosModuleConfig } from "./schemas.js";

const host = (address: string, type = "host") => `candidate:1 1 udp 2122260223 ${address} 54321 typ ${type} generation 0`;

describe("loopback-only ICE", () => {
  it("accepts host candidates on loopback, private, link-local and mDNS addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.4", "172.16.3.1", "192.168.1.20", "169.254.1.1", "::1", "fe80::1", "fd12::3",
      "2b1c4d0e-9a8b-4c3d-8e7f-6a5b4c3d2e1f.local"]) expect(isLocalHostIceCandidate(host(address)), address).toBe(true);
    expect(isLocalHostIceCandidate("")).toBe(true);
  });

  it("rejects public, reflexive and relay candidates and malformed input", () => {
    expect(isLocalHostIceCandidate(host("8.8.8.8"))).toBe(false);
    expect(isLocalHostIceCandidate(host("172.32.0.1"))).toBe(false);
    expect(isLocalHostIceCandidate(host("2001:db8::1"))).toBe(false);
    expect(isLocalHostIceCandidate(host("192.168.1.20", "srflx"))).toBe(false);
    expect(isLocalHostIceCandidate(host("192.168.1.20", "relay"))).toBe(false);
    expect(isLocalHostIceCandidate(host("192.168.1.20", "prflx"))).toBe(false);
    expect(isLocalHostIceCandidate(host("300.1.1.1"))).toBe(false);
    expect(isLocalHostIceCandidate("candidate:garbage")).toBe(false);
    expect(isLocalHostIceCandidate(host("127.0.0.1") + " x".repeat(600))).toBe(false);
  });
});

describe("mirror signals", () => {
  it("separates receiver and publisher messages and bounds their size", () => {
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "hello", connection: 1 }).success).toBe(true);
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "offer", connection: 1, sdp: "v=0" }).success).toBe(false);
    expect(videoMirrorPublisherSignalSchema.safeParse({ type: "offer", connection: 1, sdp: "v=0" }).success).toBe(true);
    expect(videoMirrorPublisherSignalSchema.safeParse({ type: "answer", connection: 1, sdp: "v=0" }).success).toBe(false);
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "answer", connection: 1, sdp: "x".repeat(40_000) }).success).toBe(false);
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "hello", connection: 0 }).success).toBe(false);
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "hello", connection: 1, extra: true }).success).toBe(false);
  });

  it("lets a hello declare the media it plays and the picture size it shows", () => {
    const hello = (fields: object) => videoMirrorReceiverSignalSchema.safeParse({ type: "hello", connection: 1, ...fields }).success;
    for (const media of ["audio", "video", "both"]) expect(hello({ media }), media).toBe(true);
    expect(hello({ media: "video", maxWidth: 1382, maxHeight: 778 })).toBe(true);
    expect(hello({ maxWidth: 1, maxHeight: 1 })).toBe(true);
    expect(hello({ maxWidth: 3840, maxHeight: 2160 })).toBe(true);
    expect(hello({ maxWidth: 640 })).toBe(true);
    expect(videoMirrorReceiverSignalSchema.parse({ type: "hello", connection: 1 })).toEqual({ type: "hello", connection: 1 });
    for (const fields of [
      { media: "none" }, { media: "AUDIO" }, { media: null }, { media: ["audio"] },
      { maxWidth: 0 }, { maxWidth: -1 }, { maxWidth: 3841 }, { maxHeight: 2161 }, { maxWidth: 1382.5 }, { maxHeight: Number.NaN },
      { maxWidth: Number.POSITIVE_INFINITY }, { maxWidth: "1382" }, { maxWidth: null }, { size: 1 }
    ]) expect(hello(fields), JSON.stringify(fields)).toBe(false);
    // Only a hello carries a request.
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "bye", connection: 1, media: "audio" }).success).toBe(false);
  });

  it("rejects non-local ICE in either direction", () => {
    const candidate = { candidate: host("8.8.4.4"), sdpMid: "0", sdpMLineIndex: 0 };
    expect(videoMirrorReceiverSignalSchema.safeParse({ type: "ice", connection: 1, candidate }).success).toBe(false);
    expect(videoMirrorPublisherSignalSchema.safeParse({ type: "ice", connection: 1, candidate: { ...candidate, candidate: host("127.0.0.1") } }).success).toBe(true);
  });

  it("accepts only relay-assigned receiver ids", () => {
    expect(videoMirrorReceiverIdSchema.safeParse("browser:client-1").success).toBe(true);
    expect(videoMirrorReceiverIdSchema.safeParse("desktop:overlay").success).toBe(true);
    expect(videoMirrorReceiverIdSchema.safeParse("client-1").success).toBe(false);
  });
});

describe("videoMirrorVideoEncoding", () => {
  const capture = { width: 1920, height: 1080 };
  it("scales a full-size capture down to the declared box at the capture frame rate", () => {
    expect(videoMirrorVideoEncoding(capture, { maxWidth: 1382, maxHeight: 778 })).toEqual({ scaleResolutionDownBy: 1.39, maxBitrate: 3_105_000, maxFramerate: 30 });
    expect(videoMirrorVideoEncoding(capture, { maxWidth: 960, maxHeight: 540 })).toEqual({ scaleResolutionDownBy: 2, maxBitrate: 1_500_000, maxFramerate: 30 });
    // The tighter side wins, rounded up so the encode never exceeds the box.
    expect(videoMirrorVideoEncoding(capture, { maxWidth: 1920, maxHeight: 360 }).scaleResolutionDownBy).toBe(3);
    expect(1920 / videoMirrorVideoEncoding(capture, { maxWidth: 1383 }).scaleResolutionDownBy).toBeLessThanOrEqual(1383);
  });

  it("never upscales and caps a full-size encode at 6 Mbps", () => {
    for (const request of [{}, { media: "both" as const }, { maxWidth: 1920, maxHeight: 1080 }, { maxWidth: 3840, maxHeight: 2160 }]) {
      expect(videoMirrorVideoEncoding(capture, request)).toEqual({ scaleResolutionDownBy: 1, maxBitrate: 6_000_000, maxFramerate: 30 });
    }
  });

  it("keeps a usable bitrate floor for small boxes and tolerates an unknown capture size", () => {
    expect(videoMirrorVideoEncoding(capture, { maxWidth: 240, maxHeight: 135 })).toEqual({ scaleResolutionDownBy: 8, maxBitrate: 600_000, maxFramerate: 30 });
    expect(videoMirrorVideoEncoding({ width: 0, height: 0 }, { maxWidth: 640, maxHeight: 360 })).toEqual({ scaleResolutionDownBy: 1, maxBitrate: 6_000_000, maxFramerate: 30 });
  });
});

describe("desktop video transport", () => {
  it("validates commands against the provider allowlist and device bounds", () => {
    expect(desktopVideoCommandSchema.safeParse({ type: "load", purpose: "live", itemId: "video:1", source: { provider: "twitch-clip", clipSlug: "Slug" }, positionMs: 0, paused: false }).success).toBe(true);
    expect(desktopVideoCommandSchema.safeParse({ type: "load", purpose: "live", itemId: "video:1", source: { provider: "direct", url: "http://example.com/a.mp4" }, positionMs: 0, paused: false }).success).toBe(false);
    expect(desktopVideoCommandSchema.safeParse({ type: "set-output", purpose: "live", muted: false, devices: [{ deviceId: "a", delayMs: 501 }] }).success).toBe(false);
    expect(desktopVideoCommandSchema.safeParse({ type: "set-output", purpose: "live", muted: false, devices: [{ deviceId: "default", delayMs: 0 }] }).success).toBe(false);
    expect(desktopVideoCommandSchema.safeParse({ type: "set-output", purpose: "live", muted: false, devices: [{ deviceId: "a", delayMs: 0 }, { deviceId: "a", delayMs: 10 }] }).success).toBe(false);
  });

  it("validates host events", () => {
    expect(desktopVideoEventSchema.safeParse({ type: "report", purpose: "test", itemId: "video:1", state: "progress", positionMs: 1200, durationMs: 9000, controls: { pause: true, seek: true } }).success).toBe(true);
    expect(desktopVideoEventSchema.safeParse({ type: "report", purpose: "test", itemId: "video:1", state: "playing" }).success).toBe(false);
  });
});

describe("parseYouTubeMessage", () => {
  it("reads state, time and duration and ignores other messages", () => {
    expect(parseYouTubeMessage(JSON.stringify({ event: "infoDelivery", info: { playerState: 1, currentTime: 3, duration: 212.4 } }))).toEqual({ playerState: 1, currentTime: 3, duration: 212.4 });
    expect(parseYouTubeMessage(JSON.stringify({ event: "infoDelivery", info: { duration: 0 } }))).toEqual({ playerState: null, currentTime: null });
    expect(parseYouTubeMessage("[")).toBeNull();
  });
});

describe("device delays", () => {
  const config = { ...createDefaultVideosModuleConfig(), audioDeviceIds: ["route-a"] };
  it("defaults missing delays and bounds them per selected device", () => {
    const legacy: Partial<typeof config> = { ...config };
    delete legacy.audioDeviceDelaysMs;
    expect(videosModuleConfigSchema.parse(legacy).audioDeviceDelaysMs).toEqual({});
    expect(videosModuleConfigSchema.safeParse({ ...config, audioDeviceDelaysMs: { "route-a": 500 } }).success).toBe(true);
    expect(videosModuleConfigSchema.safeParse({ ...config, audioDeviceDelaysMs: { "route-a": 501 } }).success).toBe(false);
    expect(videosModuleConfigSchema.safeParse({ ...config, audioDeviceDelaysMs: { "route-a": -1 } }).success).toBe(false);
    expect(videosModuleConfigSchema.safeParse({ ...config, audioDeviceDelaysMs: { "route-a": 1.5 } }).success).toBe(false);
    expect(videosModuleConfigSchema.safeParse({ ...config, audioDeviceDelaysMs: { "route-b": 10 } }).success).toBe(false);
  });
});

describe("browser player duration reports", () => {
  const report = { type: "overlay.playback.duration", instructionId: "video:item-1", mediaDurationMs: 212_000 };

  it("accepts a positive whole-millisecond length up to 24 hours for a video instruction", () => {
    expect(overlayVideoDurationReportSchema.safeParse(report).success).toBe(true);
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, mediaDurationMs: 1 }).success).toBe(true);
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, mediaDurationMs: videoMediaDurationMaximumMs }).success).toBe(true);
  });

  it("rejects zero, negative, fractional, huge and non-numeric lengths", () => {
    for (const mediaDurationMs of [0, -1, 1.5, videoMediaDurationMaximumMs + 1, Number.POSITIVE_INFINITY, Number.NaN, "212000", null]) {
      expect(overlayVideoDurationReportSchema.safeParse({ ...report, mediaDurationMs }).success).toBe(false);
    }
    expect(overlayVideoDurationReportSchema.safeParse({ type: report.type, instructionId: report.instructionId }).success).toBe(false);
  });

  it("rejects non-video instructions, bare prefixes, oversized ids, other types and unknown fields", () => {
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, instructionId: "alert-1" }).success).toBe(false);
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, instructionId: "video:" }).success).toBe(false);
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, instructionId: `video:${"a".repeat(129)}` }).success).toBe(false);
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, type: "overlay.playback.started" }).success).toBe(false);
    expect(overlayVideoDurationReportSchema.safeParse({ ...report, positionMs: 0 }).success).toBe(false);
  });
});
