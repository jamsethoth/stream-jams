import { z } from "zod";
import { serializedExceptionSchema, type SerializedException } from "../diagnostics/serialized-exception.js";

export const overlayPlaybackFailureStageSchema = z.enum([
  "source-load",
  "metadata",
  "seek",
  "decode",
  "play"
]);

export type OverlayPlaybackFailureStage = z.infer<typeof overlayPlaybackFailureStageSchema>;

export interface OverlayPlaybackFailure {
  readonly referenceId: string;
  readonly stage: OverlayPlaybackFailureStage;
  readonly message: string;
  readonly exception: SerializedException;
}

export const overlayPlaybackFailureSchema: z.ZodType<OverlayPlaybackFailure> = z.object({
  referenceId: z.string().min(1).max(128),
  stage: overlayPlaybackFailureStageSchema,
  message: z.string().min(1).max(1_024),
  exception: serializedExceptionSchema
}).strict();
