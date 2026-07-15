import { z } from "zod";
import { alertConditionSchema, streamEventTypeSchema } from "../alerts/schemas.js";
import { assetMediaTypeSchema } from "../assets/schemas.js";
import {
  isoDateTimeSchema,
  metadataSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  overlayElementLayoutSchema,
  overlayPurposeSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";
import { ttsVoiceSchema } from "../tts/schemas.js";

export const managementErrorSeveritySchema = z.enum(["info", "warning", "error", "critical"]);

export const managementCorrectionTargetSchema = z.object({
  label: nonEmptyStringSchema,
  route: nonEmptyStringSchema
});

export const actionableManagementErrorSchema = z.object({
  summary: nonEmptyStringSchema,
  cause: nonEmptyStringSchema.nullable(),
  nextStep: nonEmptyStringSchema,
  severity: managementErrorSeveritySchema,
  occurredAt: isoDateTimeSchema.nullable(),
  referenceId: nonEmptyStringSchema.nullable(),
  correction: managementCorrectionTargetSchema.nullable()
});

export const targetProfileIdSchema = z.enum(["landscape", "vertical"]);

export const targetProfileDefinitionSchema = z.discriminatedUnion("id", [
  z.object({
    id: z.literal("landscape"),
    label: z.literal("Landscape 16:9"),
    width: z.literal(1920),
    height: z.literal(1080)
  }),
  z.object({
    id: z.literal("vertical"),
    label: z.literal("Vertical 9:16"),
    width: z.literal(1080),
    height: z.literal(1920)
  })
]);

export const targetProfileDefinitions = [
  { id: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 },
  { id: "vertical", label: "Vertical 9:16", width: 1080, height: 1920 }
] as const satisfies readonly TargetProfileDefinition[];

export const providerCapabilitySchema = z.enum(["event-source", "tts"]);
export const providerKindSchema = z.enum(["twitch", "streamerbot", "speakerbot", "browser-speech"]);
export const providerConnectionStateSchema = z.enum(["unconfigured", "validating", "connected", "disconnected", "error"]);
export const providerIntakeStateSchema = z.enum(["active", "inactive", "error"]);

const providerSetupBaseSchema = z.object({
  name: nonEmptyStringSchema
});

const websocketProviderConfigurationSchema = z
  .object({
    protocol: z.enum(["ws", "wss"]),
    host: nonEmptyStringSchema,
    port: positiveIntegerSchema.max(65_535),
    endpoint: nonEmptyStringSchema
  })
  .strict();

export const providerSetupInputSchema = z.discriminatedUnion("kind", [
  providerSetupBaseSchema.extend({
    kind: z.literal("twitch"),
    configuration: z.object({}).strict()
  }).strict(),
  providerSetupBaseSchema.extend({
    kind: z.literal("streamerbot"),
    configuration: websocketProviderConfigurationSchema,
    credential: z.string().max(4_096).nullable().optional()
  }).strict(),
  providerSetupBaseSchema.extend({
    kind: z.literal("speakerbot"),
    configuration: websocketProviderConfigurationSchema
  }).strict(),
  providerSetupBaseSchema.extend({
    kind: z.literal("browser-speech"),
    configuration: z.object({}).strict()
  }).strict()
]);

export const providerValidationResultSchema = z.object({
  valid: z.boolean(),
  connectionState: providerConnectionStateSchema,
  intakeState: providerIntakeStateSchema.nullable(),
  validatedAt: isoDateTimeSchema,
  availableVoices: z.array(ttsVoiceSchema),
  error: actionableManagementErrorSchema.nullable()
});

export const registeredProviderViewSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  kind: providerKindSchema,
  capability: providerCapabilitySchema,
  active: z.boolean(),
  connectionState: providerConnectionStateSchema,
  intakeState: providerIntakeStateSchema.nullable(),
  validatedAt: isoDateTimeSchema.nullable(),
  error: actionableManagementErrorSchema.nullable(),
  usedByAlertCount: nonNegativeIntegerSchema
});

export const registeredProviderDetailSchema = z.object({
  provider: registeredProviderViewSchema,
  configuration: metadataSchema,
  availableVoices: z.array(ttsVoiceSchema),
  ttsSafety: z.lazy(() => ttsProviderSafetySettingsSchema).nullable()
});

export const providerRegistrationAttemptSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("registered"),
    provider: registeredProviderDetailSchema,
    validation: providerValidationResultSchema
  }),
  z.object({
    status: z.literal("validation-failed"),
    provider: z.null(),
    validation: providerValidationResultSchema
  })
]);

export const providerActivationImpactSchema = z.object({
  matchedAlertCount: nonNegativeIntegerSchema,
  unmatchedAlertCount: nonNegativeIntegerSchema,
  blockers: z.array(actionableManagementErrorSchema),
  warnings: z.array(actionableManagementErrorSchema)
});

export const ttsProviderSafetySettingsSchema = z.object({
  defaultVoiceId: nonEmptyStringSchema.nullable(),
  volume: z.number().finite().min(0).max(1),
  minimumRate: z.number().finite().positive(),
  maximumRate: z.number().finite().positive(),
  maximumTextLength: positiveIntegerSchema
});

export const providerActivationResultSchema = z.object({
  provider: registeredProviderViewSchema,
  replacedProviderId: nonEmptyStringSchema.nullable(),
  impact: providerActivationImpactSchema
});

export const providerVoiceTestResultSchema = z.object({
  delivered: z.boolean(),
  error: actionableManagementErrorSchema.nullable()
});

export const alertValidationSeveritySchema = z.enum(["blocker", "warning"]);

export const alertValidationIssueSchema = z.object({
  id: nonEmptyStringSchema,
  severity: alertValidationSeveritySchema,
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  nextStep: nonEmptyStringSchema,
  targetProfileId: targetProfileIdSchema.nullable(),
  providerKind: providerKindSchema.nullable(),
  eventType: streamEventTypeSchema.nullable(),
  alertId: nonEmptyStringSchema.nullable(),
  referenceId: nonEmptyStringSchema.nullable()
});

export const alertTargetProfileSummarySchema = z.object({
  id: targetProfileIdSchema,
  enabled: z.boolean(),
  reviewState: z.enum(["ready", "needs-review"]),
  blockerCount: nonNegativeIntegerSchema,
  warningCount: nonNegativeIntegerSchema
});

export const alertOutputStateSchema = z.object({
  targetProfileId: targetProfileIdSchema,
  purpose: overlayPurposeSchema,
  connectionState: z.enum(["connected", "disconnected", "never-connected"]),
  lastConnectedAt: isoDateTimeSchema.nullable(),
  copyableUrlStatus: z.enum(["available", "create-required", "regenerate-required"])
});

export const alertSetOverviewSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  active: z.boolean(),
  starter: z.boolean(),
  starterReviewState: z.enum(["pending", "complete"]),
  enabledAlertCount: nonNegativeIntegerSchema,
  targetProfiles: z.array(alertTargetProfileSummarySchema).min(1),
  validationIssues: z.array(alertValidationIssueSchema),
  outputs: z.array(alertOutputStateSchema)
});

export const alertInventoryRowSchema = z.object({
  id: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
  providerKind: providerKindSchema,
  eventType: streamEventTypeSchema,
  name: nonEmptyStringSchema,
  kind: z.enum(["default", "variation"]),
  enabled: z.boolean(),
  reviewState: z.enum(["ready", "needs-review"]),
  targetProfileIds: z.array(targetProfileIdSchema),
  previewText: z.string()
});

export const alertBrowserSourceViewSchema = z.object({
  id: nonEmptyStringSchema,
  targetProfileId: targetProfileIdSchema,
  purpose: overlayPurposeSchema,
  connectionState: z.enum(["connected", "disconnected", "never-connected"]),
  lastConnectedAt: isoDateTimeSchema.nullable(),
  keyId: nonEmptyStringSchema.nullable(),
  url: nonEmptyStringSchema.nullable(),
  copyableUrlStatus: z.enum(["available", "create-required", "regenerate-required"])
});

export const alertSetDetailSchema = z.object({
  overview: alertSetOverviewSchema,
  inventory: z.array(alertInventoryRowSchema),
  browserSources: z.array(alertBrowserSourceViewSchema)
});

export const alertSetMutationInputSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const alertSetActivationImpactSchema = z.object({
  currentActiveSetId: nonEmptyStringSchema.nullable(),
  replacingActiveSetName: nonEmptyStringSchema.nullable(),
  enabledAlertCount: nonNegativeIntegerSchema,
  affectedTargetProfileIds: z.array(targetProfileIdSchema),
  affectedEventTypes: z.array(streamEventTypeSchema),
  blockers: z.array(alertValidationIssueSchema),
  warnings: z.array(alertValidationIssueSchema)
});

export const alertSetActivationResultSchema = z.object({
  activeSet: alertSetOverviewSchema,
  replacedSetId: nonEmptyStringSchema.nullable(),
  impact: alertSetActivationImpactSchema
});

const presetAnimationSchema = z.object({
  mode: z.literal("preset"),
  entrance: nonEmptyStringSchema,
  exit: nonEmptyStringSchema,
  durationMs: nonNegativeIntegerSchema,
  delayMs: nonNegativeIntegerSchema,
  easing: nonEmptyStringSchema
});

const alertLayerBaseSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  visible: z.boolean(),
  order: nonNegativeIntegerSchema,
  animation: presetAnimationSchema
});

export const alertLayerSchema = z.discriminatedUnion("type", [
  alertLayerBaseSchema.extend({
    type: z.literal("text"),
    template: z.string()
  }),
  alertLayerBaseSchema.extend({
    type: z.literal("image"),
    assetId: nonEmptyStringSchema
  }),
  alertLayerBaseSchema.extend({
    type: z.literal("video"),
    assetId: nonEmptyStringSchema
  }),
  alertLayerBaseSchema.extend({
    type: z.literal("audio"),
    assetId: nonEmptyStringSchema,
    volume: z.number().finite().min(0).max(1)
  }),
  alertLayerBaseSchema.extend({
    type: z.literal("tts"),
    template: z.string()
  }),
  alertLayerBaseSchema.extend({
    type: z.literal("shape"),
    fill: nonEmptyStringSchema
  })
]);

export const alertLayerLayoutSchema = overlayElementLayoutSchema.extend({
  layerId: nonEmptyStringSchema
});

export const alertTargetProfileDocumentSchema = z.object({
  id: targetProfileIdSchema,
  enabled: z.boolean(),
  reviewState: z.enum(["ready", "needs-review"]),
  layerLayouts: z.array(alertLayerLayoutSchema)
});

const alertTargetProfileDocumentsSchema = z
  .array(alertTargetProfileDocumentSchema)
  .length(2)
  .superRefine((profiles, context) => {
    const ids = new Set(profiles.map((profile) => profile.id));
    if (!ids.has("landscape") || !ids.has("vertical")) {
      context.addIssue({
        code: "custom",
        message: "Alert documents require one landscape and one vertical target profile"
      });
    }
  });

export const alertSamplePayloadSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  kind: z.enum(["built-in", "session"]),
  payload: metadataSchema
});

export const alertEditorDocumentSchema = z.object({
  id: nonEmptyStringSchema,
  setId: nonEmptyStringSchema,
  providerKind: providerKindSchema,
  eventType: streamEventTypeSchema,
  kind: z.enum(["default", "variation"]),
  parentAlertId: nonEmptyStringSchema.nullable(),
  name: nonEmptyStringSchema,
  enabled: z.boolean(),
  conditions: z.array(alertConditionSchema),
  durationMs: positiveIntegerSchema.max(120_000),
  layers: z.array(alertLayerSchema),
  targetProfiles: alertTargetProfileDocumentsSchema,
  samplePayloads: z.array(alertSamplePayloadSchema).min(1)
});

export const alertEditorSaveInputSchema = z.object({
  document: alertEditorDocumentSchema
});

export const alertEditorTestRequestSchema = z.object({
  document: alertEditorDocumentSchema,
  targetProfileId: targetProfileIdSchema,
  samplePayload: metadataSchema,
  includeAudio: z.boolean(),
  includeTts: z.boolean()
});

export const alertEditorTestResultSchema = z.object({
  status: z.literal("queued"),
  targetProfileId: targetProfileIdSchema,
  referenceId: nonEmptyStringSchema,
  test: z.literal(true)
});

export const assetUsageLinkSchema = z.object({
  setId: nonEmptyStringSchema.nullable(),
  setName: nonEmptyStringSchema.nullable(),
  eventType: streamEventTypeSchema,
  alertId: nonEmptyStringSchema,
  alertName: nonEmptyStringSchema,
  targetProfileIds: z.array(targetProfileIdSchema)
});

export const assetUsageSummarySchema = z
  .object({
    assetId: nonEmptyStringSchema,
    totalUsageCount: nonNegativeIntegerSchema,
    usages: z.array(assetUsageLinkSchema)
  })
  .superRefine((summary, context) => {
    if (summary.totalUsageCount !== summary.usages.length) {
      context.addIssue({ code: "custom", message: "Asset usage count must match usage records" });
    }
  });

export const assetLibraryItemSchema = z.object({
  id: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  originalFileName: nonEmptyStringSchema,
  mediaType: assetMediaTypeSchema,
  mimeType: nonEmptyStringSchema,
  sizeBytes: positiveIntegerSchema,
  width: positiveIntegerSchema.nullable(),
  height: positiveIntegerSchema.nullable(),
  durationMs: positiveIntegerSchema.nullable(),
  health: z.enum(["available", "missing", "broken"]),
  tags: z.array(nonEmptyStringSchema).transform(normalizeAssetTags),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  usage: assetUsageSummarySchema
});

export const assetMetadataUpdateInputSchema = z.object({
  displayName: nonEmptyStringSchema,
  tags: z.array(nonEmptyStringSchema).transform(normalizeAssetTags)
});

export const assetChangeImpactSchema = z.object({
  assetId: nonEmptyStringSchema,
  usage: assetUsageSummarySchema,
  canDelete: z.boolean(),
  requiresConfirmation: z.boolean(),
  warnings: z.array(nonEmptyStringSchema)
});

export const diagnosticsEventViewSchema = z.object({
  id: nonEmptyStringSchema,
  providerId: nonEmptyStringSchema,
  providerKind: providerKindSchema,
  eventType: streamEventTypeSchema,
  occurredAt: isoDateTimeSchema,
  outcome: z.enum(["received", "processed", "ignored", "failed"]),
  test: z.boolean(),
  referenceId: nonEmptyStringSchema,
  alertIds: z.array(nonEmptyStringSchema)
});

export const diagnosticsRawLogViewSchema = z.object({
  id: nonEmptyStringSchema,
  timestamp: isoDateTimeSchema,
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
  component: nonEmptyStringSchema,
  event: nonEmptyStringSchema,
  referenceId: nonEmptyStringSchema.nullable(),
  data: metadataSchema
});

export const diagnosticsWorkspaceViewSchema = z.object({
  problems: z.array(actionableManagementErrorSchema),
  events: z.array(diagnosticsEventViewSchema),
  rawLogs: z.array(diagnosticsRawLogViewSchema)
});

export const homeReadinessItemSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  state: z.enum(["complete", "action-required", "blocked"]),
  actionLabel: nonEmptyStringSchema,
  actionRoute: nonEmptyStringSchema
});

export const homeSetupSummarySchema = z.object({
  readiness: z.array(homeReadinessItemSchema),
  activeAlertSet: alertSetOverviewSchema.nullable(),
  actionableProblems: z.array(actionableManagementErrorSchema)
});

export const configurationBackupSummarySchema = z.object({
  state: z.enum(["ready", "invalid", "blocked-live"]),
  appVersion: nonEmptyStringSchema,
  schemaVersion: nonNegativeIntegerSchema,
  configurationRecordCount: nonNegativeIntegerSchema,
  assetCount: nonNegativeIntegerSchema,
  totalAssetBytes: nonNegativeIntegerSchema,
  secretExclusions: z.array(nonEmptyStringSchema),
  blockers: z.array(actionableManagementErrorSchema)
});

export function normalizeAssetTags(tags: readonly string[]): readonly string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function providerCapabilityForKind(kind: ProviderKind): ProviderCapability {
  return kind === "twitch" || kind === "streamerbot" ? "event-source" : "tts";
}

export function evaluateProviderActivation(impact: ProviderActivationImpact): {
  readonly allowed: boolean;
  readonly requiresConfirmation: boolean;
} {
  const allowed = impact.blockers.length === 0;
  return {
    allowed,
    requiresConfirmation: allowed && impact.warnings.length > 0
  };
}

export function evaluateAlertSetActivation(alertSet: AlertSetOverview): AlertSetActivationDecision {
  const enabledProfileIds = new Set(
    alertSet.targetProfiles.filter((profile) => profile.enabled).map((profile) => profile.id)
  );
  const relevantIssues = alertSet.validationIssues.filter(
    (issue) => issue.targetProfileId === null || enabledProfileIds.has(issue.targetProfileId)
  );
  const blockerIds = relevantIssues.filter((issue) => issue.severity === "blocker").map((issue) => issue.id);
  const hasValidEnabledProfile = alertSet.targetProfiles.some(
    (profile) => profile.enabled && profile.blockerCount === 0
  );

  if (!hasValidEnabledProfile && blockerIds.length === 0) {
    blockerIds.push("no-valid-enabled-profile");
  }

  const allowed = blockerIds.length === 0;
  const warningIds = allowed
    ? relevantIssues.filter((issue) => issue.severity === "warning").map((issue) => issue.id)
    : [];

  return {
    allowed,
    requiresConfirmation: allowed && warningIds.length > 0,
    blockerIds,
    warningIds
  };
}

export type ManagementErrorSeverity = z.infer<typeof managementErrorSeveritySchema>;
export type ManagementCorrectionTarget = z.infer<typeof managementCorrectionTargetSchema>;
export type ActionableManagementError = z.infer<typeof actionableManagementErrorSchema>;
export type TargetProfileId = z.infer<typeof targetProfileIdSchema>;
export type TargetProfileDefinition = z.infer<typeof targetProfileDefinitionSchema>;
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type ProviderKind = z.infer<typeof providerKindSchema>;
export type ProviderSetupInput = z.infer<typeof providerSetupInputSchema>;
export type ProviderValidationResult = z.infer<typeof providerValidationResultSchema>;
export type RegisteredProviderView = z.infer<typeof registeredProviderViewSchema>;
export type RegisteredProviderDetail = z.infer<typeof registeredProviderDetailSchema>;
export type ProviderRegistrationAttempt = z.infer<typeof providerRegistrationAttemptSchema>;
export type ProviderActivationImpact = z.infer<typeof providerActivationImpactSchema>;
export type ProviderActivationResult = z.infer<typeof providerActivationResultSchema>;
export type ProviderVoiceTestResult = z.infer<typeof providerVoiceTestResultSchema>;
export type TtsProviderSafetySettings = z.infer<typeof ttsProviderSafetySettingsSchema>;
export type AlertValidationIssue = z.infer<typeof alertValidationIssueSchema>;
export type AlertOutputState = z.infer<typeof alertOutputStateSchema>;
export type AlertSetOverview = z.infer<typeof alertSetOverviewSchema>;
export type AlertInventoryRow = z.infer<typeof alertInventoryRowSchema>;
export type AlertBrowserSourceView = z.infer<typeof alertBrowserSourceViewSchema>;
export type AlertSetDetail = z.infer<typeof alertSetDetailSchema>;
export type AlertSetMutationInput = z.infer<typeof alertSetMutationInputSchema>;
export type AlertSetActivationImpact = z.infer<typeof alertSetActivationImpactSchema>;
export type AlertSetActivationResult = z.infer<typeof alertSetActivationResultSchema>;
export type AlertLayer = z.infer<typeof alertLayerSchema>;
export type AlertTargetProfileDocument = z.infer<typeof alertTargetProfileDocumentSchema>;
export type AlertSamplePayload = z.infer<typeof alertSamplePayloadSchema>;
export type AlertEditorDocument = z.infer<typeof alertEditorDocumentSchema>;
export type AlertEditorSaveInput = z.infer<typeof alertEditorSaveInputSchema>;
export type AlertEditorTestRequest = z.infer<typeof alertEditorTestRequestSchema>;
export type AlertEditorTestResult = z.infer<typeof alertEditorTestResultSchema>;
export type AssetUsageSummary = z.infer<typeof assetUsageSummarySchema>;
export type AssetLibraryItem = z.infer<typeof assetLibraryItemSchema>;
export type AssetMetadataUpdateInput = z.infer<typeof assetMetadataUpdateInputSchema>;
export type AssetChangeImpact = z.infer<typeof assetChangeImpactSchema>;
export type DiagnosticsWorkspaceView = z.infer<typeof diagnosticsWorkspaceViewSchema>;
export type HomeSetupSummary = z.infer<typeof homeSetupSummarySchema>;
export type ConfigurationBackupSummary = z.infer<typeof configurationBackupSummarySchema>;

export interface AlertSetActivationDecision {
  readonly allowed: boolean;
  readonly requiresConfirmation: boolean;
  readonly blockerIds: readonly string[];
  readonly warningIds: readonly string[];
}
