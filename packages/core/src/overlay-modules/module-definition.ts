import { z } from "zod";
import type { OverlayModuleDefinition } from "./types.js";

export interface AlertsOverlayModuleConfig {
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
}

export const alertsOverlayModuleConfigSchema = z.object({
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
});

export const alertsOverlayModuleDefinition = {
  id: "alerts",
  displayName: "Alerts",
  version: "0.0.0",
  defaultEnabled: true,
  configSchemaVersion: 1,
  defaultConfig: {
    canvas: {
      width: 1920,
      height: 1080
    }
  },
  configSchema: alertsOverlayModuleConfigSchema,
  wizard: {
    steps: [
      {
        id: "alerts-canvas",
        title: "Canvas",
        fields: [
          {
            id: "canvas.width",
            label: "Canvas width",
            type: "number",
            required: true
          },
          {
            id: "canvas.height",
            label: "Canvas height",
            type: "number",
            required: true
          }
        ]
      },
      {
        id: "alerts-collections",
        title: "Collections",
        fields: [
          {
            id: "collection.name",
            label: "Collection name",
            type: "text",
            required: true
          },
          {
            id: "collection.enabled",
            label: "Active",
            type: "boolean",
            required: true
          }
        ]
      },
      {
        id: "alerts-rules",
        title: "Alert rules",
        fields: [
          {
            id: "rule.name",
            label: "Rule name",
            type: "text",
            required: true
          },
          {
            id: "rule.eventType",
            label: "Event type",
            type: "select",
            required: true
          },
          {
            id: "rule.enabled",
            label: "Enabled",
            type: "boolean",
            required: true
          },
          {
            id: "rule.collectionIds",
            label: "Collections",
            type: "select",
            required: true
          }
        ]
      },
      {
        id: "alerts-variants",
        title: "Variants",
        fields: [
          {
            id: "variant.textTemplate",
            label: "Text template",
            type: "text",
            required: true
          },
          {
            id: "variant.visualAssetId",
            label: "Visual asset",
            type: "asset",
            required: false
          },
          {
            id: "variant.audioAssetId",
            label: "Audio asset",
            type: "asset",
            required: false
          },
          {
            id: "variant.durationMs",
            label: "Duration",
            type: "number",
            required: true
          }
        ]
      }
    ]
  },
  renderer: {
    entryPoint: "overlay/modules/alerts",
    supportedOutputs: ["module", "unified"]
  }
} as const satisfies OverlayModuleDefinition<AlertsOverlayModuleConfig>;
