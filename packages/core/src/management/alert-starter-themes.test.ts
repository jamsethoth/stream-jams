import { describe, expect, it } from "vitest";
import {
  alertEditorDocumentSchema,
  alertStarterTemplates,
  alertStarterThemes,
  applyAlertStarterTheme,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  materializeAlertStarterTheme,
  targetProfileDefinitions
} from "../index.js";
import type {
  AlertEditorDocument,
  AlertLayer,
  AlertStarterThemeId,
  AlertStarterThemeMaterializeInput,
  AlertTargetProfileDocument
} from "../index.js";

const noAnimation = {
  mode: "preset",
  entrance: "none",
  exit: "none",
  durationMs: 0,
  delayMs: 0,
  easing: "linear"
} as const;

function documentFixture(overrides: Partial<AlertEditorDocument> = {}): AlertEditorDocument {
  return alertEditorDocumentSchema.parse({
    id: "alert-raid",
    setId: "set-live",
    providerKind: "twitch",
    eventType: "raid",
    kind: "variation",
    parentAlertId: "rule-raid",
    name: "VIP raid",
    enabled: true,
    conditions: [{ field: "payload.viewerCount", operator: "min", value: 25 }],
    variantConditions: [{ field: "ingestProvider", operator: "equals", value: "twitch" }],
    weight: 7,
    priority: 20,
    cooldownSeconds: 15,
    rulePriority: 10,
    durationMs: 8_500,
    layers: [],
    targetProfiles: [
      { id: "landscape", enabled: false, reviewState: "ready", layerLayouts: [] },
      { id: "vertical", enabled: true, reviewState: "ready", layerLayouts: [] }
    ],
    templateVariables: [{ key: "userName", label: "User name", description: "Raid sender." }],
    samplePayloads: [{ id: "normal", label: "Normal raid", kind: "built-in", payload: { userName: "Raider", raidViewers: 25 } }],
    ...overrides
  });
}

function materializedDocument(
  input: AlertStarterThemeMaterializeInput,
  profileEnabled = { landscape: true, vertical: true }
): AlertEditorDocument {
  const composition = materializeAlertStarterTheme({ ...input, targetProfileEnabled: profileEnabled });
  return documentFixture({
    id: input.documentId,
    eventType: input.eventType,
    kind: "default",
    parentAlertId: null,
    layers: composition.layers,
    targetProfiles: composition.targetProfiles
  });
}

function visualLayers(layers: readonly AlertLayer[]) {
  return layers.filter((layer) => layer.type === "text" || layer.type === "shape");
}

function textLayer(layers: readonly AlertLayer[], name: string) {
  const layer = layers.find((candidate) => candidate.type === "text" && candidate.name === name);
  expect(layer, `missing ${name} text layer`).toBeDefined();
  return layer as Extract<AlertLayer, { type: "text" }>;
}

function shapeLayer(layers: readonly AlertLayer[], name: string) {
  const layer = layers.find((candidate) => candidate.type === "shape" && candidate.name === name);
  expect(layer, `missing ${name} shape layer`).toBeDefined();
  return layer as Extract<AlertLayer, { type: "shape" }>;
}

function profile(
  profiles: readonly AlertTargetProfileDocument[],
  id: "landscape" | "vertical"
) {
  const target = profiles.find((candidate) => candidate.id === id);
  expect(target, `missing ${id} profile`).toBeDefined();
  return target as AlertTargetProfileDocument;
}

describe("curated alert starter-theme materialization", () => {
  it("materializes every canonical event, theme, and fixed profile as deterministic valid bounded text and shapes", () => {
    expect(alertStarterThemes.map((theme) => theme.id)).toEqual(["clean-signal", "bold-pop", "neon-terminal"]);

    for (const template of alertStarterTemplates) {
      for (const theme of alertStarterThemes) {
        const input = {
          documentId: `alert-${template.eventType}`,
          eventType: template.eventType,
          themeId: theme.id,
          targetProfileEnabled: { landscape: true, vertical: false }
        } as const;
        const first = materializeAlertStarterTheme(input);
        const second = materializeAlertStarterTheme(input);
        const document = materializedDocument(input, input.targetProfileEnabled);

        expect(first).toEqual(second);
        expect(alertEditorDocumentSchema.parse(document)).toEqual(document);
        expect(first.layers.every((layer) => layer.type === "text" || layer.type === "shape")).toBe(true);
        expect(textLayer(first.layers, "Eyebrow").template).toBe(template.label);
        expect(textLayer(first.layers, "Message").template).toBe(template.text);
        expect(new Set(first.layers.map((layer) => layer.id)).size).toBe(first.layers.length);
        expect(new Set(first.layers.map((layer) => layer.order)).size).toBe(first.layers.length);
        expect([...first.layers.map((layer) => layer.order)].sort((left, right) => left - right)).toEqual(
          first.layers.map((_, index) => index)
        );
        expect(first.targetProfiles.map((target) => [target.id, target.enabled, target.reviewState])).toEqual([
          ["landscape", true, "needs-review"],
          ["vertical", false, "needs-review"]
        ]);

        for (const target of first.targetProfiles) {
          const definition = targetProfileDefinitions.find((candidate) => candidate.id === target.id);
          expect(definition).toBeDefined();
          expect(target.layerLayouts.map((layout) => layout.layerId)).toEqual(first.layers.map((layer) => layer.id));
          expect(new Set(target.layerLayouts.map((layout) => layout.layerId)).size).toBe(target.layerLayouts.length);
          for (const layout of target.layerLayouts) {
            expect(Number.isInteger(layout.x)).toBe(true);
            expect(Number.isInteger(layout.y)).toBe(true);
            expect(Number.isInteger(layout.width)).toBe(true);
            expect(Number.isInteger(layout.height)).toBe(true);
            expect(layout.x).toBeGreaterThanOrEqual(0);
            expect(layout.y).toBeGreaterThanOrEqual(0);
            expect(layout.x + layout.width).toBeLessThanOrEqual(definition?.width ?? 0);
            expect(layout.y + layout.height).toBeLessThanOrEqual(definition?.height ?? 0);
          }
        }
      }
    }
  });

  it("uses the exact Clean Signal blueprint", () => {
    const result = materializeAlertStarterTheme({ documentId: "alert-raid", eventType: "raid", themeId: "clean-signal" });
    const message = textLayer(result.layers, "Message");
    const eyebrow = textLayer(result.layers, "Eyebrow");

    expect(result.layers.map((layer) => [layer.name, layer.order, layer.animation])).toEqual([
      ["Panel", 0, { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }],
      ["Accent", 1, { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }],
      ["Eyebrow", 2, { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }],
      ["Message", 3, { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" }]
    ]);
    expect(shapeLayer(result.layers, "Panel").fill).toBe("#07111DDE");
    expect(shapeLayer(result.layers, "Accent").fill).toBe("#53D8FBFF");
    expect(eyebrow.textStyle).toMatchObject({ fontPreset: "system-sans", fontSizePx: 22, fontWeight: 700, color: "#53D8FBFF" });
    expect(message.textStyle).toMatchObject({ fontPreset: "system-sans", fontSizePx: 56, fontWeight: 800, color: "#FFFFFFFF" });
    expect(profile(result.targetProfiles, "landscape").layerLayouts).toEqual([
      { layerId: "alert-raid:clean-signal:panel", x: 288, y: 713, width: 1344, height: 238, zIndex: 0 },
      { layerId: "alert-raid:clean-signal:accent", x: 288, y: 713, width: 14, height: 238, zIndex: 1 },
      { layerId: "alert-raid:clean-signal:eyebrow", x: 322, y: 719, width: 1276, height: 51, zIndex: 2 },
      { layerId: "alert-raid:clean-signal:message", x: 322, y: 770, width: 1276, height: 175, zIndex: 3 }
    ]);
    expect(profile(result.targetProfiles, "vertical").layerLayouts).toEqual([
      { layerId: "alert-raid:clean-signal:panel", x: 97, y: 1267, width: 886, height: 346, zIndex: 0 },
      { layerId: "alert-raid:clean-signal:accent", x: 97, y: 1267, width: 8, height: 346, zIndex: 1 },
      { layerId: "alert-raid:clean-signal:eyebrow", x: 119, y: 1276, width: 842, height: 74, zIndex: 2 },
      { layerId: "alert-raid:clean-signal:message", x: 119, y: 1350, width: 842, height: 254, zIndex: 3 }
    ]);
  });

  it("uses the exact unrotated Bold Pop blueprint", () => {
    const result = materializeAlertStarterTheme({ documentId: "alert-raid", eventType: "raid", themeId: "bold-pop" });
    const message = textLayer(result.layers, "Message");

    expect(result.layers.map((layer) => layer.name)).toEqual([
      "Magenta block", "Cyan block", "Yellow block", "Panel", "Eyebrow", "Message"
    ]);
    expect(result.layers.filter((layer) => layer.type === "shape").map((layer) => layer.fill)).toEqual([
      "#EF3F8FFF", "#16D9D2FF", "#FFD34EFF", "#171321F2"
    ]);
    expect(result.layers.every((layer) => layer.animation.entrance === "scale")).toBe(true);
    expect(message.textStyle).toMatchObject({ fontPreset: "rounded-sans", fontSizePx: 64, fontWeight: 800 });
    expect(profile(result.targetProfiles, "landscape").layerLayouts.slice(0, 4)).toEqual([
      { layerId: "alert-raid:bold-pop:magenta-block", x: 317, y: 707, width: 461, height: 86, zIndex: 0 },
      { layerId: "alert-raid:bold-pop:cyan-block", x: 1306, y: 788, width: 288, height: 108, zIndex: 1 },
      { layerId: "alert-raid:bold-pop:yellow-block", x: 384, y: 891, width: 538, height: 65, zIndex: 2 },
      { layerId: "alert-raid:bold-pop:panel", x: 346, y: 724, width: 1229, height: 216, zIndex: 3 }
    ]);
    expect(profile(result.targetProfiles, "landscape").layerLayouts.every((layout) => !("rotation" in layout))).toBe(true);
    expect(profile(result.targetProfiles, "vertical").layerLayouts.slice(0, 4)).toEqual([
      { layerId: "alert-raid:bold-pop:magenta-block", x: 92, y: 1200, width: 324, height: 134, zIndex: 0 },
      { layerId: "alert-raid:bold-pop:cyan-block", x: 778, y: 1382, width: 194, height: 192, zIndex: 1 },
      { layerId: "alert-raid:bold-pop:yellow-block", x: 151, y: 1574, width: 367, height: 96, zIndex: 2 },
      { layerId: "alert-raid:bold-pop:panel", x: 119, y: 1229, width: 842, height: 384, zIndex: 3 }
    ]);
  });

  it("uses the exact Neon Terminal blueprint with a green rule and green text shadow", () => {
    const result = materializeAlertStarterTheme({ documentId: "alert-raid", eventType: "raid", themeId: "neon-terminal" });
    const message = textLayer(result.layers, "Message");

    expect(shapeLayer(result.layers, "Panel").fill).toBe("#020805F2");
    expect(shapeLayer(result.layers, "Rule").fill).toBe("#31F577FF");
    expect(result.layers.every((layer) => layer.animation.entrance === "slide-up")).toBe(true);
    expect(message.textStyle).toMatchObject({
      fontPreset: "monospace",
      fontSizePx: 52,
      fontWeight: 700,
      shadow: { offsetX: 0, offsetY: 0, blur: 12, color: "#31F577FF" }
    });
    expect(profile(result.targetProfiles, "landscape").layerLayouts.slice(0, 2)).toEqual([
      { layerId: "alert-raid:neon-terminal:panel", x: 269, y: 713, width: 1382, height: 216, zIndex: 0 },
      { layerId: "alert-raid:neon-terminal:rule", x: 269, y: 713, width: 1382, height: 5, zIndex: 1 }
    ]);
    expect(profile(result.targetProfiles, "vertical").layerLayouts.slice(0, 2)).toEqual([
      { layerId: "alert-raid:neon-terminal:panel", x: 86, y: 1229, width: 907, height: 384, zIndex: 0 },
      { layerId: "alert-raid:neon-terminal:rule", x: 86, y: 1229, width: 907, height: 10, zIndex: 1 }
    ]);
  });

  it("accepts a custom message template without allowing a canonical eyebrow override", () => {
    const result = materializeAlertStarterTheme({
      documentId: "alert-raid",
      eventType: "raid",
      themeId: "clean-signal",
      messageTemplate: "Custom welcome for {userName}"
    });

    expect(textLayer(result.layers, "Eyebrow").template).toBe("Raid");
    expect(textLayer(result.layers, "Message").template).toBe("Custom welcome for {userName}");
  });

  it("rejects unknown theme IDs and noncanonical events at the pure boundary", () => {
    expect(() => materializeAlertStarterTheme({
      documentId: "alert-raid",
      eventType: "raid",
      themeId: "unknown"
    } as never)).toThrow();
    expect(() => materializeAlertStarterTheme({
      documentId: "alert-future",
      eventType: "future-event",
      themeId: "clean-signal"
    } as never)).toThrow();
  });
});

describe("applying curated alert starter themes", () => {
  const existingVisualLayers: AlertLayer[] = [
    {
      id: "old-visible",
      name: "Secondary",
      type: "text",
      visible: true,
      order: 1,
      template: "Visible first",
      animation: noAnimation,
      textStyle: compatibilityAlertTextStyle,
      boxStyle: compatibilityAlertTextBoxStyle
    },
    {
      id: "old-message",
      name: "mEsSaGe",
      type: "text",
      visible: false,
      order: 9,
      template: "Preserve this {userName}",
      animation: noAnimation,
      textStyle: compatibilityAlertTextStyle,
      boxStyle: compatibilityAlertTextBoxStyle
    },
    { id: "old-shape", name: "Old shape", type: "shape", visible: true, order: 2, fill: "#FFFFFFFF", animation: noAnimation },
    { id: "old-image", name: "Old image", type: "image", visible: true, order: 3, assetId: "image-1", animation: noAnimation },
    { id: "old-video", name: "Old video", type: "video", visible: true, order: 4, assetId: "video-1", animation: noAnimation }
  ];
  const nonvisualLayers: AlertLayer[] = [
    { id: "audio-1", name: "Audio", type: "audio", visible: true, order: 5, assetId: "audio-asset", volume: 0.4, animation: noAnimation },
    { id: "tts-1", name: "Speech", type: "tts", visible: true, order: 6, enabled: false, providerId: "speakerbot", template: "Speak {userName}", animation: noAnimation }
  ];

  it("purely replaces visuals while preserving behavior, nonvisual layers, availability, and message", () => {
    const original = documentFixture({
      layers: [...existingVisualLayers, ...nonvisualLayers],
      targetProfiles: [
        {
          id: "landscape",
          enabled: false,
          reviewState: "ready",
          layerLayouts: existingVisualLayers.map((layer, index) => ({ layerId: layer.id, x: index, y: index, width: 100, height: 50, zIndex: index }))
        },
        {
          id: "vertical",
          enabled: true,
          reviewState: "ready",
          layerLayouts: existingVisualLayers.map((layer, index) => ({ layerId: layer.id, x: index, y: index, width: 100, height: 50, zIndex: index }))
        }
      ]
    });
    const before = structuredClone(original);
    const applied = applyAlertStarterTheme(original, "bold-pop");
    const reapplied = applyAlertStarterTheme(applied, "bold-pop");

    expect(original).toEqual(before);
    expect(alertEditorDocumentSchema.parse(applied)).toEqual(applied);
    expect(applied).toMatchObject({
      id: original.id,
      setId: original.setId,
      providerKind: original.providerKind,
      eventType: original.eventType,
      kind: original.kind,
      parentAlertId: original.parentAlertId,
      name: original.name,
      enabled: false,
      conditions: original.conditions,
      variantConditions: original.variantConditions,
      weight: original.weight,
      priority: original.priority,
      cooldownSeconds: original.cooldownSeconds,
      rulePriority: original.rulePriority,
      durationMs: original.durationMs,
      templateVariables: original.templateVariables,
      samplePayloads: original.samplePayloads
    });
    expect(applied.layers.filter((layer) => layer.type === "audio" || layer.type === "tts")).toEqual(nonvisualLayers);
    expect(textLayer(applied.layers, "Message").template).toBe("Preserve this {userName}");
    expect(applied.layers.some((layer) => layer.id.startsWith("old-"))).toBe(false);
    expect(applied.targetProfiles.map((target) => [target.id, target.enabled, target.reviewState])).toEqual([
      ["landscape", false, "needs-review"],
      ["vertical", true, "needs-review"]
    ]);
    for (const target of applied.targetProfiles) {
      expect(target.layerLayouts.map((layout) => layout.layerId)).toEqual(visualLayers(applied.layers).map((layer) => layer.id));
    }
    expect(reapplied).toEqual(applied);
  });

  it.each([
    {
      name: "case-insensitive Message before visible text",
      layers: [
        { id: "visible", name: "Other", type: "text", visible: true, order: 0, template: "Visible", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle },
        { id: "named", name: "MESSAGE", type: "text", visible: false, order: 9, template: "Named", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle }
      ],
      expected: "Named"
    },
    {
      name: "first visible text by order",
      layers: [
        { id: "hidden", name: "Hidden", type: "text", visible: false, order: 0, template: "Hidden", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle },
        { id: "visible-late", name: "Late", type: "text", visible: true, order: 8, template: "Late", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle },
        { id: "visible-first", name: "First", type: "text", visible: true, order: 2, template: "First visible", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle }
      ],
      expected: "First visible"
    },
    {
      name: "first text by order when all are hidden",
      layers: [
        { id: "later", name: "Later", type: "text", visible: false, order: 8, template: "Later", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle },
        { id: "first", name: "First", type: "text", visible: false, order: 2, template: "First hidden", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle }
      ],
      expected: "First hidden"
    },
    {
      name: "canonical starter when no text exists",
      layers: [{ id: "audio", name: "Audio", type: "audio", visible: true, order: 0, assetId: "audio-asset", volume: 1, animation: noAnimation }],
      expected: "Welcome raiders from {userName}!"
    },
    {
      name: "layer ID as a deterministic tie break",
      layers: [
        { id: "z-layer", name: "Other", type: "text", visible: true, order: 2, template: "Z", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle },
        { id: "a-layer", name: "Other", type: "text", visible: true, order: 2, template: "A", animation: noAnimation, textStyle: compatibilityAlertTextStyle, boxStyle: compatibilityAlertTextBoxStyle }
      ],
      expected: "A"
    }
  ])("uses $name", ({ layers, expected }) => {
    const applied = applyAlertStarterTheme(documentFixture({ layers: layers as AlertLayer[] }), "clean-signal");
    expect(textLayer(applied.layers, "Message").template).toBe(expected);
  });

  it("rejects invalid documents and unknown theme IDs without weakening schemas", () => {
    expect(() => applyAlertStarterTheme({ ...documentFixture(), eventType: "future-event" } as never, "clean-signal")).toThrow();
    expect(() => applyAlertStarterTheme(documentFixture(), "unknown" as AlertStarterThemeId)).toThrow();
  });
});
