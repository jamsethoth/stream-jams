import { z } from "zod";
import { overlayPurposeSchema } from "../shared/schemas.js";
import type { VideosModuleConfig } from "./types.js";

export const videosMaximumLengthSecondsLimit = 4 * 60 * 60;
export const videosMaximumGapSeconds = 30;
export const videosMaximumDirectHosts = 32;
export const videosMaximumRewardMappings = 16;
export const videosMaximumAudioDevices = 8;
/** Per-device delay that lines device sound up with the mirrored picture in OBS. */
export const videosMaximumDeviceDelayMs = 500;

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
  // Saved before device delays existed: no delay.
  audioDeviceDelaysMs: z.record(z.string().min(1).max(512), z.number().int().min(0).max(videosMaximumDeviceDelayMs)).default({}),
  streamerBotAutoplay: z.boolean(),
  rewardMappings: z.array(z.object({ rewardId: z.string().trim().min(1).max(128), purpose: overlayPurposeSchema }).strict())
    .max(videosMaximumRewardMappings)
    .refine(mappings => new Set(mappings.map(mapping => mapping.rewardId)).size === mappings.length, "Rewards must be unique")
}).strict().refine(config => Object.keys(config.audioDeviceDelaysMs).every(id => config.audioDeviceIds.includes(id)),
  { message: "Delays are only allowed for selected devices", path: ["audioDeviceDelaysMs"] }) satisfies z.ZodType<VideosModuleConfig>;

export function createDefaultVideosModuleConfig(): VideosModuleConfig {
  return {
    maxLengthSeconds: 120,
    gapSeconds: 3,
    allowedDirectHosts: [],
    obsAudio: true,
    audioDeviceIds: [],
    audioDeviceDelaysMs: {},
    streamerBotAutoplay: true,
    rewardMappings: []
  };
}
