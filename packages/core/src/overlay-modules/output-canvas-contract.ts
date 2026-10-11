import { z } from "zod";

/** Saved geometry, independent of playback and viewport dimensions. */
export interface OutputCanvas {
  readonly schemaVersion: 1;
  readonly kind: "content" | "scene";
  readonly width: number;
  readonly height: number;
  readonly origin: { readonly x: number; readonly y: number };
  readonly insets: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly configRevision: number;
}
// Zod numbers exclude nonfinite values; int() also requires a safe integer.
const dimension = z.int().positive();
const inset = z.number().nonnegative();
export const outputCanvasSchema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.enum(["content", "scene"]), width: dimension, height: dimension,
  origin: z.strictObject({ x: z.number(), y: z.number() }),
  insets: z.strictObject({ top: inset, right: inset, bottom: inset, left: inset }),
  configRevision: z.int().nonnegative()
}) satisfies z.ZodType<OutputCanvas>;
