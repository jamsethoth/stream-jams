import type { AssetRecord, EffectContentSnapshot } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { EffectPlaybackEligibilityService } from "./effect-playback-eligibility-service.js";

describe("EffectPlaybackEligibilityService", () => {
  it.each([
    { name: "missing visual", records: [], content: content(), expected: false },
    { name: "mismatched visual", records: [asset("visual", "video")], content: content(), expected: false },
    {
      name: "non-audio sound",
      records: [asset("visual", "image"), asset("sound", "image")],
      content: content({ sound: { assetId: "sound", volume: 1 } }),
      expected: false
    },
    {
      name: "deleted audio route",
      records: [asset("visual", "image"), asset("sound", "audio")],
      content: content({ sound: { assetId: "sound", volume: 1 }, outputs: { browserSource: false, deviceRouteIds: ["deleted"] } }),
      expected: false
    },
    {
      name: "valid references",
      records: [asset("visual", "image"), asset("sound", "audio")],
      content: content({ sound: { assetId: "sound", volume: 1 }, outputs: { browserSource: false, deviceRouteIds: ["route-1"] } }),
      expected: true
    }
  ])("checks $name", async ({ records, content: snapshot, expected }) => {
    const harness = createHarness(records, expected ? ["route-1"] : []);
    await expect(harness.service.referencesExist(snapshot)).resolves.toBe(expected);
  });

  it.each([
    {
      name: "visual-only browser",
      content: content(), browserReady: true, desktopReady: false, deviceReady: false, expected: true
    },
    {
      name: "browser audio only",
      content: content({
        visual: null,
        sound: { assetId: "sound", volume: 1 },
        outputs: { browserSource: true, deviceRouteIds: [] },
        visualOutputs: { browserSource: false, desktop: false }
      }),
      browserReady: true, desktopReady: false, deviceReady: false, expected: true
    },
    {
      name: "desktop only",
      content: content({ outputs: { browserSource: false, deviceRouteIds: [] }, visualOutputs: { browserSource: false, desktop: true } }),
      browserReady: false, desktopReady: true, deviceReady: false, expected: true
    },
    {
      name: "device only",
      content: content({ visual: null, sound: { assetId: "sound", volume: 1 }, outputs: { browserSource: false, deviceRouteIds: ["route-1"] }, visualOutputs: { browserSource: false, desktop: false } }),
      browserReady: false, desktopReady: false, deviceReady: true, expected: true
    },
    {
      name: "no ready output",
      content: content({ sound: { assetId: "sound", volume: 1 }, outputs: { browserSource: true, deviceRouteIds: ["route-1"] }, visualOutputs: { browserSource: true, desktop: true } }),
      browserReady: false, desktopReady: false, deviceReady: false, expected: false
    }
  ])("checks $name availability", async ({ content: snapshot, browserReady, desktopReady, deviceReady, expected }) => {
    const harness = createHarness([]);
    harness.outputs.isBrowserOutputReady.mockResolvedValue(browserReady);
    harness.outputs.isDesktopVisualReady.mockResolvedValue(desktopReady);
    harness.outputs.hasReadyAudioRoute.mockResolvedValue(deviceReady);

    await expect(harness.service.hasAvailableOutput(snapshot)).resolves.toBe(expected);
  });
});

function createHarness(records: readonly AssetRecord[], routeIds: readonly string[] = []) {
  const assets = {
    findManyByIds: vi.fn(async (ids: readonly string[]) =>
      new Map(records.filter((record) => ids.includes(record.id)).map((record) => [record.id, record]))
    )
  };
  const routes = {
    findById: vi.fn((id: string) => routeIds.includes(id)
      ? { id, name: id, deviceId: `${id}-device`, deviceLabel: id, autoFollowDeviceName: false }
      : null)
  };
  const outputs = {
    isBrowserOutputReady: vi.fn(async () => false),
    isDesktopVisualReady: vi.fn(async () => false),
    hasReadyAudioRoute: vi.fn(async () => false)
  };
  return { service: new EffectPlaybackEligibilityService({ assets, routes, outputs }), assets, routes, outputs };
}

function content(overrides: Partial<EffectContentSnapshot["variant"]> = {}): EffectContentSnapshot {
  return {
    effectId: "effect-1",
    effectName: "Effect",
    priority: 1,
    variant: {
      id: "variant-1",
      name: "Default",
      enabled: true,
      weight: 1,
      visual: {
        assetId: "visual",
        mediaType: "image",
        layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 }
      },
      sound: null,
      durationMs: 5_000,
      outputs: { browserSource: false, deviceRouteIds: [] },
      visualOutputs: { browserSource: true, desktop: false },
      ...overrides
    }
  };
}

function asset(id: string, mediaType: AssetRecord["mediaType"]): AssetRecord {
  return {
    id,
    originalFileName: id,
    mediaType,
    mimeType: `${mediaType}/test`,
    sizeBytes: 1,
    checksum: id,
    storagePath: id,
    durationMs: null
  };
}
