import { z } from "zod";
import { isValidVideosLayout } from "./layout.js";
import type { VideosLayout } from "./types.js";

/** Shared by the saved config and the overlay projection, so both fail closed on the same rules. */
export const videosLayoutSchema = /* @__PURE__ */ z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict()
  .refine(isValidVideosLayout, "Invalid Videos box") satisfies z.ZodType<VideosLayout>;
