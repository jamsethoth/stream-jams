import { z } from "zod";
import { boxShadowSchema } from "../shared/box-shadow.js";
import { isValidVideosLayout, videoCaptionFonts } from "./layout.js";
import type { VideosLayout } from "./types.js";

/** Shared by the saved config and the overlay projection, so both fail closed on the same rules. */
export const videosLayoutSchema = /* @__PURE__ */ z.strictObject({ schemaVersion: z.literal(2),
  content: z.strictObject({ width: z.number(), height: z.number() }),
  desktopPlacement: z.strictObject({ x: z.number(), y: z.number(), scale: z.number() }), shadow: boxShadowSchema.optional(),
  captionFont: z.enum(videoCaptionFonts).optional() })
  .refine(isValidVideosLayout, "Invalid Videos box") satisfies z.ZodType<VideosLayout>;
