import { z } from "zod";
import { musicWidgetProjectionSchema } from "../music/schemas.js";
import { timerStackProjectionSchema } from "../timers/schemas.js";
import type { MusicWidgetProjection } from "../music/types.js";
import type { TimerStackProjection } from "../timers/types.js";

export type OverlayModulePresentation =
  | { readonly kind: "timer-stack"; readonly stack: TimerStackProjection }
  | { readonly kind: "music-widget"; readonly widget: MusicWidgetProjection };

export const overlayModulePresentationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("timer-stack"), stack: z.lazy(() => timerStackProjectionSchema) }).strict(),
  z.object({ kind: z.literal("music-widget"), widget: musicWidgetProjectionSchema }).strict()
]) satisfies z.ZodType<OverlayModulePresentation>;
