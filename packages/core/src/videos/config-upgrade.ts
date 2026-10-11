import { z } from "zod";
import { videosCanvas, videosLayoutLimits, createDefaultVideosLayout } from "./layout.js";
import { videosLayoutSchema } from "./layout-schema.js";
import type { VideosLayout } from "./types.js";

const legacyLayoutSchema = z.strictObject({ x: z.int().nonnegative(), y: z.int().nonnegative(),
  width: z.int().min(videosLayoutLimits.minWidth), height: z.int().min(videosLayoutLimits.minHeight) })
  .refine(box => box.x + box.width <= videosCanvas.width && box.y + box.height <= videosCanvas.height);

/** One validation/upgrade boundary for historical database rows and portable backup preflight. */
export function upgradeVideosLayout(raw: unknown): VideosLayout {
  if (raw === undefined) return createDefaultVideosLayout();
  const current = videosLayoutSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = legacyLayoutSchema.safeParse(raw);
  if (!legacy.success) throw new TypeError("Videos layout is invalid. Correct content dimensions and desktop placement before upgrading.");
  const { x, y, width, height } = legacy.data;
  return videosLayoutSchema.parse({ schemaVersion: 2, content: { width, height }, desktopPlacement: { x, y, scale: 1 } });
}
