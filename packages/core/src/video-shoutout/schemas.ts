import { z } from "zod";
import type { VideoShoutoutModuleConfig } from "./types.js";

/** Matches the overlay playback safety limit used for alerts and screen effects. */
export const videoShoutoutMaximumDurationMs = 120_000;

export const videoShoutoutMaximumUrlLength = 2048;

export const videoShoutoutModuleConfigSchema = z.object({}).strict() as unknown as z.ZodType<VideoShoutoutModuleConfig>;

export function createDefaultVideoShoutoutModuleConfig(): VideoShoutoutModuleConfig {
  return {};
}
