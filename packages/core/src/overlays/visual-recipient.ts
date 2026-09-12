import { z } from "zod";

const identitySchema = z.string().min(1).refine(value => value === value.trim());

/** Runtime acknowledgement identity only; never persisted with surface settings. */
export const visualRecipientKeySchema = z.object({
  surfaceId: identitySchema,
  moduleId: identitySchema,
  occurrenceId: identitySchema,
  generation: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
}).strict();

export type VisualRecipientKey = z.infer<typeof visualRecipientKeySchema>;
