import { z } from "zod";
import { overlayPurposeSchema } from "../shared/schemas.js";
import type { VideosModuleConfig } from "./types.js";

export const videosMaximumLengthSecondsLimit = 4 * 60 * 60;
export const videosMaximumGapSeconds = 30;
export const videosMaximumDirectHosts = 32;
export const videosMaximumRewardMappings = 16;
export const videosMaximumAudioDevices = 8;

const directHostSchema = /* @__PURE__ */ z.string().trim().toLowerCase()
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u);

export const videosModuleConfigSchema = /* @__PURE__ */ z.object({
  maxLengthSeconds: z.number().int().min(5).max(videosMaximumLengthSecondsLimit),
  gapSeconds: z.number().int().min(0).max(videosMaximumGapSeconds),
  allowedDirectHosts: z.array(directHostSchema).max(videosMaximumDirectHosts)
    .refine(hosts => new Set(hosts).size === hosts.length, "Hosts must be unique"),
  obsAudio: z.boolean(),
  audioDeviceIds: z.array(z.string().min(1).max(512)).max(videosMaximumAudioDevices)
    .refine(ids => new Set(ids).size === ids.length, "Devices must be unique"),
  streamerBotAutoplay: z.boolean(),
  rewardMappings: z.array(z.object({ rewardId: z.string().trim().min(1).max(128), purpose: overlayPurposeSchema }).strict())
    .max(videosMaximumRewardMappings)
    .refine(mappings => new Set(mappings.map(mapping => mapping.rewardId)).size === mappings.length, "Rewards must be unique")
}).strict() satisfies z.ZodType<VideosModuleConfig>;

export function createDefaultVideosModuleConfig(): VideosModuleConfig {
  return {
    maxLengthSeconds: 120,
    gapSeconds: 3,
    allowedDirectHosts: [],
    obsAudio: true,
    audioDeviceIds: [],
    streamerBotAutoplay: true,
    rewardMappings: []
  };
}
