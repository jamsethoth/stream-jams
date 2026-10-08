import { z } from "zod";
import { nonNegativeIntegerSchema } from "../shared/schemas.js";
import type { VideoSource } from "./types.js";
import { isSafeDirectVideoUrl } from "./providers.js";

const maximumOffsetMs = 24 * 60 * 60 * 1000;
const offsetSchema = nonNegativeIntegerSchema.max(maximumOffsetMs);

export const videoSourceSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("youtube"), videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/u), startAtMs: offsetSchema }).strict(),
  z.object({ provider: z.literal("twitch-clip"), clipSlug: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u) }).strict(),
  z.object({ provider: z.literal("twitch-vod"), videoId: z.string().regex(/^\d{1,20}$/u), startAtMs: offsetSchema }).strict(),
  z.object({ provider: z.literal("direct"), url: z.string().max(2048).refine(isSafeDirectVideoUrl) }).strict()
]) satisfies z.ZodType<VideoSource>;

