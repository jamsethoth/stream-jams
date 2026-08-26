import type { AlertTextBoxStyle, AlertTextStyle } from "../alerts/text-style.js";
import { streamEventTypeSchema } from "../alerts/schemas.js";
import {
  alertEditorDocumentSchema,
  alertLayerSchema,
  alertStarterTemplates,
  alertStarterThemeIdSchema,
  alertTargetProfileDocumentSchema,
  targetProfileDefinitions
} from "./contracts.js";
import type {
  AlertEditorDocument,
  AlertLayer,
  AlertStarterThemeId,
  AlertStarterThemeSummary,
  AlertTargetProfileDocument,
  TargetProfileId
} from "./contracts.js";

export const alertStarterThemes: readonly AlertStarterThemeSummary[] = Object.freeze([
  Object.freeze({
    id: "clean-signal",
    label: "Clean Signal",
    description: "A calm, high-contrast signal panel with a crisp cyan accent."
  }),
  Object.freeze({
    id: "bold-pop",
    label: "Bold Pop",
    description: "Bright overlapping color blocks frame a punchy dark message panel."
  }),
  Object.freeze({
    id: "neon-terminal",
    label: "Neon Terminal",
    description: "A near-black terminal panel with vivid green type and glow."
  })
]);

export interface AlertStarterThemeMaterializeInput {
  readonly documentId: string;
  readonly eventType: AlertEditorDocument["eventType"];
  readonly themeId: AlertStarterThemeId;
  readonly messageTemplate?: string;
  readonly targetProfileEnabled?: Readonly<Partial<Record<TargetProfileId, boolean>>>;
}

export interface AlertStarterThemeComposition {
  readonly layers: AlertLayer[];
  readonly targetProfiles: AlertTargetProfileDocument[];
}

interface PercentRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ThemeBlueprint {
  readonly entrance: "fade" | "scale" | "slide-up";
  readonly panelFill: string;
  readonly panel: Readonly<Record<TargetProfileId, PercentRectangle>>;
  readonly decorationsBehindPanel: boolean;
  readonly decorations: readonly {
    readonly role: string;
    readonly name: string;
    readonly fill: string;
    readonly rectangles: Readonly<Record<TargetProfileId, PercentRectangle | "panel-accent" | "panel-rule">>;
  }[];
  readonly eyebrowStyle: AlertTextStyle;
  readonly messageStyle: AlertTextStyle;
}

const transparentTextBox: AlertTextBoxStyle = {
  backgroundColor: "#00000000",
  paddingPx: 0,
  cornerRadiusPx: 0,
  shadow: null
};

const blueprints: Readonly<Record<AlertStarterThemeId, ThemeBlueprint>> = {
  "clean-signal": {
    entrance: "fade",
    panelFill: "#07111DDE",
    decorationsBehindPanel: false,
    panel: {
      landscape: { x: 15, y: 66, width: 70, height: 22 },
      vertical: { x: 9, y: 66, width: 82, height: 18 }
    },
    decorations: [{
      role: "accent",
      name: "Accent",
      fill: "#53D8FBFF",
      rectangles: { landscape: "panel-accent", vertical: "panel-accent" }
    }],
    eyebrowStyle: textStyle("system-sans", 22, 700, "#53D8FBFF", null),
    messageStyle: textStyle("system-sans", 56, 800, "#FFFFFFFF", null)
  },
  "bold-pop": {
    entrance: "scale",
    panelFill: "#171321F2",
    decorationsBehindPanel: true,
    panel: {
      landscape: { x: 18, y: 67, width: 64, height: 20 },
      vertical: { x: 11, y: 64, width: 78, height: 20 }
    },
    decorations: [
      {
        role: "magenta-block",
        name: "Magenta block",
        fill: "#EF3F8FFF",
        rectangles: {
          landscape: { x: 16.5, y: 65.5, width: 24, height: 8 },
          vertical: { x: 8.5, y: 62.5, width: 30, height: 7 }
        }
      },
      {
        role: "cyan-block",
        name: "Cyan block",
        fill: "#16D9D2FF",
        rectangles: {
          landscape: { x: 68, y: 73, width: 15, height: 10 },
          vertical: { x: 72, y: 72, width: 18, height: 10 }
        }
      },
      {
        role: "yellow-block",
        name: "Yellow block",
        fill: "#FFD34EFF",
        rectangles: {
          landscape: { x: 20, y: 82.5, width: 28, height: 6 },
          vertical: { x: 14, y: 82, width: 34, height: 5 }
        }
      }
    ],
    eyebrowStyle: textStyle("rounded-sans", 24, 800, "#FFD34EFF", null),
    messageStyle: textStyle("rounded-sans", 64, 800, "#FFFFFFFF", null)
  },
  "neon-terminal": {
    entrance: "slide-up",
    panelFill: "#020805F2",
    decorationsBehindPanel: false,
    panel: {
      landscape: { x: 14, y: 66, width: 72, height: 20 },
      vertical: { x: 8, y: 64, width: 84, height: 20 }
    },
    decorations: [{
      role: "rule",
      name: "Rule",
      fill: "#31F577FF",
      rectangles: { landscape: "panel-rule", vertical: "panel-rule" }
    }],
    eyebrowStyle: textStyle("monospace", 20, 700, "#31F577FF", {
      offsetX: 0,
      offsetY: 0,
      blur: 8,
      color: "#31F577FF"
    }),
    messageStyle: textStyle("monospace", 52, 700, "#FFFFFFFF", {
      offsetX: 0,
      offsetY: 0,
      blur: 12,
      color: "#31F577FF"
    })
  }
};

export function materializeAlertStarterTheme(
  input: AlertStarterThemeMaterializeInput
): AlertStarterThemeComposition {
  if (input.documentId.trim() === "") {
    throw new Error("Starter-theme materialization requires a document ID");
  }
  const themeId = alertStarterThemeIdSchema.parse(input.themeId);
  const template = starterTemplate(input.eventType);
  const blueprint = blueprints[themeId];
  const animation = {
    mode: "preset" as const,
    entrance: blueprint.entrance,
    exit: "fade",
    durationMs: 300,
    delayMs: 0,
    easing: "ease-out"
  };
  const layers: AlertLayer[] = [];
  const appendPanel = () => {
    layers.push({
      id: layerId(input.documentId, themeId, "panel"),
      name: "Panel",
      type: "shape",
      visible: true,
      order: layers.length,
      animation: structuredClone(animation),
      fill: blueprint.panelFill
    });
  };
  const appendDecorations = () => {
    for (const decoration of blueprint.decorations) {
      layers.push({
        id: layerId(input.documentId, themeId, decoration.role),
        name: decoration.name,
        type: "shape",
        visible: true,
        order: layers.length,
        animation: structuredClone(animation),
        fill: decoration.fill
      });
    }
  };
  if (blueprint.decorationsBehindPanel) {
    appendDecorations();
    appendPanel();
  } else {
    appendPanel();
    appendDecorations();
  }
  layers.push(textLayer(input.documentId, themeId, "eyebrow", "Eyebrow", template.label, blueprint.eyebrowStyle, layers.length, animation));
  layers.push(textLayer(
    input.documentId,
    themeId,
    "message",
    "Message",
    input.messageTemplate ?? template.text,
    blueprint.messageStyle,
    layers.length,
    animation
  ));

  const targetProfiles = targetProfileDefinitions.map((definition) => ({
      id: definition.id,
      enabled: input.targetProfileEnabled?.[definition.id] ?? true,
      reviewState: "needs-review",
      layerLayouts: layoutsForProfile(input.documentId, themeId, definition.id, layers, blueprint)
    }));
  return {
    layers: layers.map((layer) => alertLayerSchema.parse(layer)),
    targetProfiles: targetProfiles.map((profile) => alertTargetProfileDocumentSchema.parse(profile))
  };
}

export function applyAlertStarterTheme(
  document: AlertEditorDocument,
  themeId: AlertStarterThemeId
): AlertEditorDocument {
  const parsed = alertEditorDocumentSchema.parse(document);
  const selectedThemeId = alertStarterThemeIdSchema.parse(themeId);
  const messageTemplate = primaryMessageTemplate(parsed);
  const preservedNonvisualLayers = parsed.layers.filter((layer) => layer.type === "audio" || layer.type === "tts");
  const composition = materializeAlertStarterTheme({
    documentId: parsed.id,
    eventType: parsed.eventType,
    themeId: selectedThemeId,
    messageTemplate,
    targetProfileEnabled: Object.fromEntries(
      parsed.targetProfiles.map((profile) => [profile.id, profile.enabled])
    ) as Record<TargetProfileId, boolean>
  });

  return alertEditorDocumentSchema.parse({
    ...parsed,
    enabled: false,
    layers: [...composition.layers, ...preservedNonvisualLayers],
    targetProfiles: composition.targetProfiles
  });
}

function textStyle(
  fontPreset: AlertTextStyle["fontPreset"],
  fontSizePx: number,
  fontWeight: AlertTextStyle["fontWeight"],
  color: string,
  shadow: AlertTextStyle["shadow"]
): AlertTextStyle {
  return {
    fontPreset,
    fontSizePx,
    fontWeight,
    lineHeight: 1.05,
    horizontalAlign: "left",
    verticalAlign: "center",
    color,
    shadow
  };
}

function textLayer(
  documentId: string,
  themeId: AlertStarterThemeId,
  role: string,
  name: string,
  template: string,
  style: AlertTextStyle,
  order: number,
  animation: AlertLayer["animation"]
): AlertLayer {
  return {
    id: layerId(documentId, themeId, role),
    name,
    type: "text",
    visible: true,
    order,
    animation: structuredClone(animation),
    template,
    textStyle: structuredClone(style),
    boxStyle: structuredClone(transparentTextBox)
  };
}

function layerId(documentId: string, themeId: AlertStarterThemeId, role: string): string {
  return `${documentId}:${themeId}:${role}`;
}

function layoutsForProfile(
  documentId: string,
  themeId: AlertStarterThemeId,
  profileId: TargetProfileId,
  layers: readonly AlertLayer[],
  blueprint: ThemeBlueprint
): AlertTargetProfileDocument["layerLayouts"] {
  const definition = targetProfileDefinitions.find((candidate) => candidate.id === profileId);
  if (definition === undefined) throw new Error(`Unknown target profile: ${profileId}`);
  const panel = scaleRectangle(blueprint.panel[profileId], definition.width, definition.height);
  const insetX = Math.round(panel.width * 0.025);
  const insetY = Math.round(panel.height * 0.025);
  const content = {
    x: panel.x + insetX,
    y: panel.y + insetY,
    width: panel.width - (insetX * 2),
    height: panel.height - (insetY * 2)
  };
  const eyebrowHeight = Math.round(content.height * 0.225);
  const rectangles = new Map<string, ReturnType<typeof scaleRectangle>>([
    ["panel", panel],
    ["eyebrow", { ...content, height: eyebrowHeight }],
    ["message", { ...content, y: content.y + eyebrowHeight, height: content.height - eyebrowHeight }]
  ]);
  for (const decoration of blueprint.decorations) {
    const rectangle = decoration.rectangles[profileId];
    rectangles.set(decoration.role, rectangle === "panel-accent"
      ? { ...panel, width: Math.round(definition.width * 0.0075) }
      : rectangle === "panel-rule"
        ? { ...panel, height: Math.round(panel.height * 0.025) }
        : scaleRectangle(rectangle, definition.width, definition.height));
  }

  return layers.map((layer) => {
    const role = layer.id.slice(`${documentId}:${themeId}:`.length);
    const rectangle = rectangles.get(role);
    if (rectangle === undefined) throw new Error(`Missing starter-theme rectangle: ${role}`);
    return { layerId: layer.id, ...rectangle, zIndex: layer.order };
  });
}

function scaleRectangle(rectangle: PercentRectangle, width: number, height: number) {
  return {
    x: Math.round(width * rectangle.x / 100),
    y: Math.round(height * rectangle.y / 100),
    width: Math.round(width * rectangle.width / 100),
    height: Math.round(height * rectangle.height / 100)
  };
}

function primaryMessageTemplate(document: AlertEditorDocument): string {
  const textLayers = document.layers
    .filter((layer): layer is Extract<AlertLayer, { type: "text" }> => layer.type === "text")
    .slice()
    .sort((left, right) => left.order - right.order || compareIds(left.id, right.id));
  const selected = textLayers.find((layer) => layer.name.toLowerCase() === "message")
    ?? textLayers.find((layer) => layer.visible)
    ?? textLayers[0];
  return selected?.template ?? starterTemplate(document.eventType).text;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function starterTemplate(eventType: AlertEditorDocument["eventType"]) {
  const parsedEventType = streamEventTypeSchema.parse(eventType);
  const template = alertStarterTemplates.find((candidate) => candidate.eventType === parsedEventType);
  if (template === undefined) {
    throw new Error(`Missing alert starter metadata for canonical event: ${parsedEventType}`);
  }
  return template;
}
