import { z } from "zod";
import { musicStatusSchema } from "./schemas.js";
import { pearCertificateFingerprintSchema, pearConfigurationSchema } from "./pear-configuration.js";
import { providerValidationResultSchema } from "../management/contracts.js";

/** Details shown to the user before they accept a Pear certificate that no trusted authority signed. */
export const pearCertificateReviewSchema = z.object({
  sha256: pearCertificateFingerprintSchema,
  subject: z.string().max(512),
  issuer: z.string().max(512),
  validFrom: z.string().max(64),
  validTo: z.string().max(64),
  /** True when this source already trusted a different certificate. */
  replacesTrusted: z.boolean()
}).strict();

export const musicPairingAttemptViewSchema = z.object({
  attemptId: z.string().min(1).max(128),
  status: z.enum(["certificate-review", "pending", "approved", "denied", "expired", "cancelled"]),
  expiresAt: z.iso.datetime(),
  /** Configuration to validate and save with this attempt; includes the accepted certificate once confirmed. */
  configuration: pearConfigurationSchema,
  certificate: pearCertificateReviewSchema.nullable()
}).strict();

export const musicPairingCertificateAcceptanceSchema = z.object({ sha256: pearCertificateFingerprintSchema }).strict();

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
export type PearCertificateReview = z.infer<typeof pearCertificateReviewSchema>;
export type MusicCredentialReplacementInput = z.infer<typeof musicCredentialReplacementInputSchema>;
export type MusicCredentialReplacementResult = z.infer<typeof musicCredentialReplacementResultSchema>;
export type MusicManagementStatus = z.infer<typeof musicManagementStatusSchema>;
