import { z } from "zod";
import { musicWidgetProjectionSchema } from "../music/schemas.js";
import { timerStackProjectionSchema } from "../timers/schemas.js";
import type { MusicWidgetProjection } from "../music/types.js";
import type { TimerStackProjection } from "../timers/types.js";
import type { VideosProjection } from "../videos/types.js";

export type OverlayModulePresentation =
  | { readonly kind: "timer-stack"; readonly stack: TimerStackProjection }
  | { readonly kind: "music-widget"; readonly widget: MusicWidgetProjection }
  | { readonly kind: "videos"; readonly videos: VideosProjection };

/**
 * Shape guard only: the overlay renderer re-validates the full projection with
 * `@stream-jams/core/videos` before anything renders, which keeps the
 * provider allowlist out of the shared management bundle.
 */
const videosPresentationSchema = z.custom<VideosProjection>(value =>
  typeof value === "object" && value !== null && typeof (value as { readonly status?: unknown }).status === "string");

export const overlayModulePresentationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("timer-stack"), stack: z.lazy(() => timerStackProjectionSchema) }).strict(),
  z.object({ kind: z.literal("music-widget"), widget: musicWidgetProjectionSchema }).strict(),
  z.object({ kind: z.literal("videos"), videos: videosPresentationSchema }).strict()
]) satisfies z.ZodType<OverlayModulePresentation>;
