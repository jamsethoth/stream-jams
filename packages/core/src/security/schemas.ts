import { z } from "zod";
import { isoDateTimeSchema, nonEmptyStringSchema, overlayPurposeSchema, overlayScopeSchema } from "../shared/schemas.js";

export const secretRefSchema = z.object({
  namespace: z.enum(["twitch", "tts", "management", "overlay"]),
  accountId: nonEmptyStringSchema,
  name: nonEmptyStringSchema
});

export const overlayAccessKeySchema = z.object({
  id: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  keyHash: nonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable()
});

export const managementSessionSchema = z.object({
  id: nonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema
});

export const createOverlayKeyInputSchema = z.object({
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema
});
