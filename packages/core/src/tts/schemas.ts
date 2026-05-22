import { z } from "zod";
import { metadataSchema, nonEmptyStringSchema } from "../shared/schemas.js";

export const ttsPlaybackModeSchema = z.enum(["audio-file", "remote-trigger", "browser-speech"]);

export const ttsPlaybackInstructionSchema = z.object({
  mode: ttsPlaybackModeSchema,
  text: z.string(),
  audioAssetId: nonEmptyStringSchema.nullable(),
  providerPayload: metadataSchema.nullable()
});

export const ttsProviderCapabilitiesSchema = z.object({
  supportsVoices: z.boolean(),
  supportsRate: z.boolean(),
  supportsPitch: z.boolean(),
  supportsVolume: z.boolean(),
  playbackMode: ttsPlaybackModeSchema
});

export const ttsProviderConfigRefSchema = z.object({
  providerId: nonEmptyStringSchema,
  accountId: nonEmptyStringSchema
});

export const ttsVoiceSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema
});
