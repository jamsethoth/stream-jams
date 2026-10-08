import { describe, expect, it } from "vitest";
import {
  desktopVideoCommandSchema, desktopVideoEventSchema, isLocalHostIceCandidate, parseYouTubeMessage,
  videoMirrorPublisherSignalSchema, videoMirrorReceiverIdSchema, videoMirrorReceiverSignalSchema
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
