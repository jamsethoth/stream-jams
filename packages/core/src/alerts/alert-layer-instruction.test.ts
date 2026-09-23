import { describe, expect, it } from "vitest";
import type { AlertLayer } from "../management/contracts.js";
import { compatibilityAlertTextBoxStyle, compatibilityAlertTextStyle } from "./text-style.js";
import { buildAlertLayerInstruction } from "./alert-layer-instruction.js";

const animation = {
  mode: "preset" as const,
  entrance: "fade",
  exit: "scale",
  durationMs: 300,
  delayMs: 25,
  easing: "ease-out"
};
const layout = { layerId: "layer", x: 10, y: 20, width: 300, height: 200, zIndex: 4 };
const base = {
  id: "instruction-1",
  overlayId: "overlay-1",
  moduleId: "alerts",
  operatorTest: true as const,
  purpose: "live" as const,
  scope: "module" as const,
  targetProfileId: "landscape" as const,
  durationMs: 4_000
};

const common = {
  ...base,
  visual: null,
  audio: null,
  text: null,
  shape: null,
  animation,
  tts: null
};

describe("buildAlertLayerInstruction", () => {
  it.each([
    {
      name: "text",
      layer: layer({ type: "text", template: "Hello", textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle }),
      input: { layout, renderedText: "Hello Viewer" },
      expected: {
        ...common,
        text: { text: "Hello Viewer", layout, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle }
      }
    },
    {
      name: "image",
      layer: layer({ type: "image", assetId: "asset-image" }),
      input: { layout },
      expected: { ...common, visual: { assetId: "asset-image", mediaType: "image", layout } }
    },
    {
      name: "GIF-backed visual",
      layer: layer({ type: "image", assetId: "asset-gif" }),
      input: { layout, visualMediaType: "gif" as const },
      expected: { ...common, visual: { assetId: "asset-gif", mediaType: "gif", layout } }
    },
    {
      name: "looping video",
      layer: layer({ type: "video", assetId: "asset-video", loop: true, playEmbeddedAudio: true, audioVolume: 0.7 }),
      input: { layout, visualMediaType: "video" as const },
      expected: { ...common, visual: { assetId: "asset-video", mediaType: "video", layout, loop: true } }
    },
    {
      name: "audio envelope",
      layer: layer({ type: "audio", assetId: "asset-audio", volume: 0.6, fadeInMs: 50, fadeOutMs: 75 }),
      input: { layout: undefined, audio: { sourceKind: "video-soundtrack" as const, playbackDurationMs: 3_200, fadeInMs: 125, fadeOutMs: 250 } },
      expected: {
        ...common,
        audio: { assetId: "asset-audio", volume: 0.6, sourceKind: "video-soundtrack", playbackDurationMs: 3_200, fadeInMs: 125, fadeOutMs: 250 }
      }
    },
    {
      name: "TTS",
      layer: layer({ type: "tts", enabled: true, providerId: "speakerbot", template: "Read this" }),
      input: { layout: undefined, tts: { mode: "remote-trigger" as const, text: "Read this", audioAssetId: null, providerPayload: { providerId: "speakerbot" } } },
      expected: {
        ...common,
        tts: { mode: "remote-trigger", text: "Read this", audioAssetId: null, providerPayload: { providerId: "speakerbot" } }
      }
    },
    {
      name: "shape",
      layer: layer({ type: "shape", fill: "#336699CC" }),
      input: { layout },
      expected: { ...common, shape: { fill: "#336699CC", layout } }
    }
  ])("projects a full $name instruction", ({ layer, input, expected }) => {
    expect(buildAlertLayerInstruction({ base, layer, ...input })).toEqual(expected);
  });

  it("returns null when a visual has no layout", () => {
    expect(buildAlertLayerInstruction({
      base,
      layer: layer({ type: "image", assetId: "asset-image" }),
      layout: undefined
    })).toBeNull();
  });

  it("returns null when a TTS layer has no prepared payload", () => {
    expect(buildAlertLayerInstruction({
      base,
      layer: layer({ type: "tts", enabled: false, providerId: "browser-speech", template: "Hidden" }),
      layout: undefined
    })).toBeNull();
  });
});

type LayerDetails<T> = T extends AlertLayer
  ? Omit<T, "id" | "name" | "visible" | "order" | "animation">
  : never;

function layer(specific: LayerDetails<AlertLayer>): AlertLayer {
  return {
    id: "layer",
    name: "Layer",
    visible: true,
    order: 0,
    animation,
    ...specific
  } as AlertLayer;
}
