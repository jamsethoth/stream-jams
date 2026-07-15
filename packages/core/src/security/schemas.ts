import { z } from "zod";
import {
  isoDateTimeSchema,
  nonEmptyStringSchema,
  overlayPurposeSchema,
  overlayScopeSchema,
  overlayTargetProfileIdSchema
} from "../shared/schemas.js";

export const secretRefSchema = z.object({
  namespace: z.enum(["twitch", "streamerbot", "tts", "management", "overlay"]),
  accountId: nonEmptyStringSchema,
  name: nonEmptyStringSchema
});

export const overlayAccessKeySchema = z.object({
  id: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  targetProfileId: overlayTargetProfileIdSchema.nullable().optional(),
  keyHash: nonEmptyStringSchema,
  routeKeySecretRef: secretRefSchema.nullable(),
  createdAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable()
});

export const managementSessionSchema = z.object({
  id: nonEmptyStringSchema,
  csrfToken: nonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable()
});

export const createOverlayKeyInputSchema = z.object({
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  targetProfileId: overlayTargetProfileIdSchema.nullable().optional()
});
