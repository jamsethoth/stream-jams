import { z } from "zod";
import { dataOverlayProjectionSchema } from "../data-overlays/projection-schemas.js";
import type { DataOverlayProjection } from "../data-overlays/types.js";
import { musicWidgetProjectionSchema } from "../music/schemas.js";
import { timerStackProjectionSchema } from "../timers/schemas.js";
import type { MusicWidgetProjection } from "../music/types.js";
import type { TimerStackProjection } from "../timers/types.js";
import type { VideoShoutoutProjection } from "../video-shoutout/types.js";

export type OverlayModulePresentation =
  | { readonly kind: "data-overlays"; readonly projection: DataOverlayProjection }
  | { readonly kind: "timer-stack"; readonly stack: TimerStackProjection }
  | { readonly kind: "music-widget"; readonly widget: MusicWidgetProjection }
  | { readonly kind: "video-shoutout"; readonly shoutout: VideoShoutoutProjection };

/**
 * Shape guard only: the overlay renderer re-validates the full projection with
 * `@stream-jams/core/video-shoutout` before anything renders, which keeps the
 * strict clip contract out of the shared management bundle.
 */
const videoShoutoutPresentationSchema = z.custom<VideoShoutoutProjection>(value =>
  typeof value === "object" && value !== null && typeof (value as { readonly status?: unknown }).status === "string");

export const overlayModulePresentationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("data-overlays"), projection: dataOverlayProjectionSchema }).strict(),
  z.object({ kind: z.literal("timer-stack"), stack: z.lazy(() => timerStackProjectionSchema) }).strict(),
  z.object({ kind: z.literal("music-widget"), widget: musicWidgetProjectionSchema }).strict(),
  z.object({ kind: z.literal("video-shoutout"), shoutout: videoShoutoutPresentationSchema }).strict()
]) satisfies z.ZodType<OverlayModulePresentation>;
