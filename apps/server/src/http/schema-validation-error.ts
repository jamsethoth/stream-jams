import { z } from "zod";

const transportedIssue = z.object({
  code: z.string().min(1),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
  message: z.string()
});
const transportedValidationError = z.object({
  name: z.literal("ZodError"),
  issues: z.array(transportedIssue).min(1)
});

/** Narrow vendor compatibility only; application errors use module-owned identities/codes. */
export function isSchemaValidationError(error: unknown): boolean {
  return error instanceof z.ZodError || transportedValidationError.safeParse(error).success;
}
