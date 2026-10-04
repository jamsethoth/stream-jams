import { z } from "zod";
import { musicStatusSchema } from "./schemas.js";
import { pearConfigurationSchema } from "./pear-configuration.js";
import { providerValidationResultSchema } from "../management/contracts.js";

export const musicPairingAttemptViewSchema = z.object({
  attemptId: z.string().min(1).max(128),
  status: z.enum(["pending", "approved", "denied", "expired", "cancelled"]),
  expiresAt: z.iso.datetime()
}).strict();

export const musicCredentialReplacementInputSchema = z.object({
  pairingAttemptId: z.string().min(1).max(128),
  configuration: pearConfigurationSchema
}).strict();

export const musicCredentialReplacementResultSchema = z.object({
  validation: providerValidationResultSchema,
  runtimeReconcilePending: z.boolean(),
  credentialRetirementPending: z.boolean()
}).strict();

export const musicManagementStatusSchema = z.object({
  enabled: z.boolean(),
  selectedProviderId: z.string().nullable(),
  status: musicStatusSchema,
  missingAssetIds: z.object({ landscape: z.array(z.string()), vertical: z.array(z.string()) }).strict()
}).strict();

export type MusicPairingAttemptView = z.infer<typeof musicPairingAttemptViewSchema>;
export type MusicCredentialReplacementInput = z.infer<typeof musicCredentialReplacementInputSchema>;
export type MusicCredentialReplacementResult = z.infer<typeof musicCredentialReplacementResultSchema>;
export type MusicManagementStatus = z.infer<typeof musicManagementStatusSchema>;
