import { z } from "zod";
import { videoMaximumLinkLength } from "./providers.js";
export const videoTitleSchema = z.string().trim().min(1).max(200);
export const videoRequesterSchema = z.string().trim().min(1).max(64);

/** Shared bounded input; parsing/admission and autoplay authority remain server-owned. */
export const videoRequestInputSchema = z.object({
  link: z.string().trim().min(1).max(videoMaximumLinkLength),
  title: videoTitleSchema.optional(),
  requester: videoRequesterSchema.optional(),
  durationSeconds: z.number().finite().positive().max(24 * 60 * 60).optional(),
  autoplay: z.boolean().optional()
}).strict();
export type VideoRequestInput = z.infer<typeof videoRequestInputSchema>;
