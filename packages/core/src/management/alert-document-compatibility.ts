import { z } from "zod";
import { alertEditorDocumentSchema, alertLayerSchema, type AlertEditorDocument } from "./contracts.js";

const videoAudioSettingsSchema = z.object({
  playEmbeddedAudio: z.boolean(),
  audioVolume: z.number().finite().min(0).max(1)
});

export type VideoAudioSettings = z.infer<typeof videoAudioSettingsSchema>;

export function createVideoAudioSettings(): VideoAudioSettings {
  return { playEmbeddedAudio: true, audioVolume: 1 };
}

export function readLegacyVideoAudioSettings(value: unknown): VideoAudioSettings {
  const settings = videoAudioSettingsSchema.partial().parse(value);
  return { playEmbeddedAudio: settings.playEmbeddedAudio ?? false, audioVolume: settings.audioVolume ?? 1 };
}

const legacyDocumentSchema = alertEditorDocumentSchema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.undefined().optional(),
  layers: z.array(z.union([
    alertLayerSchema,
    alertLayerSchema.options[2].extend({
      playEmbeddedAudio: z.boolean().optional(),
      audioVolume: z.number().finite().min(0).max(1).optional()
    })
  ]))
});

export function parseStoredAlertEditorDocument(value: unknown): AlertEditorDocument {
  const version = z.object({ schemaVersion: z.unknown().optional() }).parse(value).schemaVersion;
  if (version !== undefined) return alertEditorDocumentSchema.parse(value);
  const legacy = legacyDocumentSchema.parse(value);
  return alertEditorDocumentSchema.parse({
    ...legacy,
    schemaVersion: 1,
    layers: legacy.layers.map(layer => layer.type === "video"
      ? { ...layer, ...readLegacyVideoAudioSettings(layer) }
      : layer)
  });
}
