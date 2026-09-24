import type { AlertEditorDocument } from "@stream-jams/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { useAlertPreview } from "./use-alert-preview.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAlertPreview", () => {
  it("remains usable through the Strict Mode effect probe", async () => {
    const assetApi = previewAssetApi();
    const { result } = renderHook(() => useAlertPreview({
      assetApi,
      visualAssetMediaTypes: {},
      assetDurations: {},
      onError: vi.fn()
    }), { wrapper: StrictModeBoundary });

    await act(() => result.current.start({
      document: documentWithoutMedia(),
      ttsTextByLayerId: {},
      includeAudio: false,
      includeTts: false
    }));

    expect(result.current.active).toBe(true);
  });

  it("publishes controller state and retains the controller across data updates", async () => {
    const assetApi = previewAssetApi();
    const { result, rerender } = renderHook(
      ({ durations }) => useAlertPreview({
        assetApi,
        visualAssetMediaTypes: {},
        assetDurations: durations,
        onError: vi.fn()
      }),
      { initialProps: { durations: {} as Readonly<Record<string, number | null>> } }
    );

    await act(() => result.current.start({
      document: documentWithoutMedia(),
      ttsTextByLayerId: {},
      includeAudio: false,
      includeTts: false
    }));
    expect(result.current).toMatchObject({ active: true, playing: true, runId: 1 });

    rerender({ durations: { asset: 1_000 } });
    expect(result.current).toMatchObject({ active: true, playing: true, runId: 1 });
  });

  it("disposes pending work when the asset API identity changes", async () => {
    let resolveBlob!: (blob: Blob) => void;
    const firstAssetApi = previewAssetApi(() => new Promise((resolve) => { resolveBlob = resolve; }));
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const { result, rerender } = renderHook(
      ({ assetApi }) => useAlertPreview({
        assetApi,
        visualAssetMediaTypes: {},
        assetDurations: {},
        onError: vi.fn()
      }),
      { initialProps: { assetApi: firstAssetApi } }
    );

    let started!: Promise<void>;
    act(() => {
      started = result.current.start({
        document: documentWithAudio(),
        ttsTextByLayerId: {},
        includeAudio: true,
        includeTts: false
      });
    });
    rerender({ assetApi: previewAssetApi() });
    resolveBlob(new Blob(["late"]));
    await act(() => started);

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it("disposes its controller on unmount", async () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(readonly text: string) {} });
    vi.stubGlobal("speechSynthesis", { cancel, speak });
    const { result, unmount } = renderHook(() => useAlertPreview({
      assetApi: previewAssetApi(),
      visualAssetMediaTypes: {},
      assetDurations: {},
      onError: vi.fn()
    }));

    await act(() => result.current.start({
      document: documentWithTts(),
      ttsTextByLayerId: { tts: "Speech" },
      includeAudio: false,
      includeTts: true
    }));
    unmount();
    await act(() => Promise.resolve());

    expect(speak).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});

function StrictModeBoundary({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

function previewAssetApi(getAssetFile: AssetApi["getAssetFile"] = async () => new Blob(["audio"])): AssetApi {
  return {
    listAssets: vi.fn(async () => []),
    importAsset: vi.fn(),
    getAssetFile,
    replaceAsset: vi.fn()
  };
}

function documentWithoutMedia(): AlertEditorDocument {
  return { ...baseDocument(), layers: [] };
}

function documentWithAudio(): AlertEditorDocument {
  return {
    ...baseDocument(),
    layers: [{
      id: "audio",
      name: "Audio",
      type: "audio",
      visible: true,
      order: 0,
      assetId: "asset",
      volume: 1,
      animation: previewAnimation()
    }]
  };
}

function documentWithTts(): AlertEditorDocument {
  return {
    ...baseDocument(),
    layers: [{
      id: "tts",
      name: "Speech",
      type: "tts",
      visible: true,
      order: 0,
      enabled: true,
      providerId: "provider",
      template: "Hello",
      animation: previewAnimation()
    }]
  };
}

function previewAnimation() {
  return { mode: "preset" as const, entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" };
}

function baseDocument(): AlertEditorDocument {
  return {
    schemaVersion: 1,
    id: "alert",
    setId: "set",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "Alert",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5_000,
    outputs: { browserSource: true, deviceRouteIds: [] },
    layers: [],
    targetProfiles: [],
    samplePayloads: []
  };
}
