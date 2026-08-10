import { z } from "zod";
import { alertConditionSchema, streamEventTypeSchema } from "../alerts/schemas.js";
import {
  alertTextBoxStyleSchema,
  alertTextStyleSchema,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle
} from "../alerts/text-style.js";
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
export const providerLiveStatusSchema = z.enum(["not-running", "starting", "healthy", "reconnecting", "error"]);

const twitchAuthorizationAccountSchema = z.object({
  accountId: nonEmptyStringSchema,
  login: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  scopes: z.array(nonEmptyStringSchema),
  connectedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

const twitchAuthorizationSchema = z.union([
  z.object({
    authorizationState: z.literal("disconnected"),
    missingScopes: z.array(nonEmptyStringSchema).length(0),
    account: z.null()
  }),
  z.object({
    authorizationState: z.literal("ready"),
    missingScopes: z.array(nonEmptyStringSchema).length(0),
    account: twitchAuthorizationAccountSchema
  }),
  z.object({
    authorizationState: z.literal("update-required"),
    missingScopes: z.array(nonEmptyStringSchema).min(1),
    account: twitchAuthorizationAccountSchema
  })
]);

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
  liveStatus: providerLiveStatusSchema.optional(),
  twitchAuthorization: twitchAuthorizationSchema.optional(),
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
  parentAlertId: nonEmptyStringSchema.nullable().default(null),
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

export const alertCreateInputSchema = z.object({
  eventType: streamEventTypeSchema,
  name: z.string().trim().min(1).max(120)
});

export const alertVariationCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const managedAlertMutationInputSchema = z.object({
  confirmLiveImpact: z.boolean().default(false)
});

export const alertStarterTemplates = [
  { eventType: "follow", group: "Core", label: "Follow", defaultName: "New follower", description: "One alert for each new follower.", text: "Thanks for following, {userName}!" },
  { eventType: "subscription", group: "Subscriptions", label: "Subscription", defaultName: "New subscriber", description: "One alert for each new subscription.", text: "Thanks for subscribing, {userName}!" },
  { eventType: "resubscription", group: "Subscriptions", label: "Resubscription", defaultName: "Resubscription", description: "One alert for each renewed subscription.", text: "Thanks for resubscribing, {userName}!" },
  { eventType: "cheer", group: "Core", label: "Cheer", defaultName: "New cheer", description: "One alert for each Bits cheer.", text: "Thanks for the cheer, {userName}!" },
  { eventType: "raid", group: "Core", label: "Raid", defaultName: "New raid", description: "One alert when another channel raids.", text: "Welcome raiders from {userName}!" },
  { eventType: "channel_point_redemption", group: "Core", label: "Channel point redemption", defaultName: "Custom reward", description: "One alert for each completed reward redemption.", text: "{userName} redeemed {rewardTitle}!" },
  { eventType: "gift_subscription", group: "Subscriptions", label: "Gift subscription received", defaultName: "Gift subscription received", description: "One alert per recipient gift subscription.", text: "{recipientName} received a Tier {tier} gift subscription!" },
  { eventType: "community_gift", group: "Subscriptions", label: "Community gift received", defaultName: "Community gift received", description: "One alert for each aggregate community gift, not each recipient.", text: "{gifterName} gifted {giftCount} Tier {tier} subscriptions!" },
  { eventType: "hype_train_start", group: "Hype Train", label: "Hype Train started", defaultName: "Hype Train started", description: "One alert when a Hype Train starts.", text: "Hype Train level {level} has started!" },
  { eventType: "hype_train_progress", group: "Hype Train", label: "Hype Train progress", defaultName: "Hype Train progress", description: "One alert for Hype Train progress updates.", text: "Hype Train level {level}: {progress}/{total}!" },
  { eventType: "hype_train_end", group: "Hype Train", label: "Hype Train ended", defaultName: "Hype Train ended", description: "One alert when a Hype Train ends.", text: "Hype Train ended at level {level}!" },
  { eventType: "poll_start", group: "Polls", label: "Poll started", defaultName: "Poll started", description: "One alert when a poll starts.", text: "Poll started: {title}" },
  { eventType: "poll_progress", group: "Polls", label: "Poll progress", defaultName: "Poll progress", description: "One alert for poll progress updates.", text: "{title}: {totalVotes} votes so far." },
  { eventType: "poll_end", group: "Polls", label: "Poll ended", defaultName: "Poll ended", description: "One alert when a poll reaches a terminal status.", text: "Poll ended: {title} ({totalVotes} votes)." },
  { eventType: "prediction_start", group: "Predictions", label: "Prediction started", defaultName: "Prediction started", description: "One alert when a prediction starts.", text: "Prediction started: {title}" },
  { eventType: "prediction_progress", group: "Predictions", label: "Prediction progress", defaultName: "Prediction progress", description: "One alert for prediction progress updates.", text: "{title}: {totalPoints} points from {totalUsers} participants." },
  { eventType: "prediction_lock", group: "Predictions", label: "Prediction locked", defaultName: "Prediction locked", description: "One alert when prediction entries lock.", text: "Prediction locked: {title}" },
  { eventType: "prediction_end", group: "Predictions", label: "Prediction ended", defaultName: "Prediction ended", description: "One alert when a prediction reaches a terminal status.", text: "Prediction ended: {title}" },
  { eventType: "stream_online", group: "Stream", label: "Stream online", defaultName: "Stream online", description: "One alert when the stream goes online.", text: "Stream is live." },
  { eventType: "stream_offline", group: "Stream", label: "Stream offline", defaultName: "Stream offline", description: "One alert when the stream goes offline.", text: "Stream is offline." }
] as const satisfies readonly {
  readonly eventType: z.infer<typeof streamEventTypeSchema>;
  readonly group: "Core" | "Subscriptions" | "Hype Train" | "Polls" | "Predictions" | "Stream";
  readonly label: string;
  readonly defaultName: string;
  readonly description: string;
  readonly text: string;
}[];

export const alertBrowserSourceViewSchema = z.object({
  id: nonEmptyStringSchema,
  targetProfileId: targetProfileIdSchema,
  purpose: z.literal("live"),
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
    template: z.string(),
    textStyle: alertTextStyleSchema.default(compatibilityAlertTextStyle),
    boxStyle: alertTextBoxStyleSchema.default(compatibilityAlertTextBoxStyle)
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
    enabled: z.boolean().default(true),
    providerId: nonEmptyStringSchema.default("browser-speech"),
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

export const alertTemplateVariableSchema = z.object({
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  description: nonEmptyStringSchema
});

type AlertSampleEventType = z.infer<typeof streamEventTypeSchema>;

const commonTemplateVariables = [
  { key: "userName", label: "User name", description: "Display name for the event actor." }
] as const;

const hypeTrainTemplateVariables = [
  { key: "level", label: "Level", description: "Current Hype Train level." },
  { key: "progress", label: "Progress", description: "Current Hype Train progress." },
  { key: "goal", label: "Goal", description: "Contribution goal for the current Hype Train level." },
  { key: "total", label: "Total", description: "Current Hype Train total." }
] as const;

const pollTemplateVariables = [
  { key: "title", label: "Poll title", description: "Poll title." },
  { key: "totalVotes", label: "Total votes", description: "Total votes across poll choices." },
  { key: "status", label: "Status", description: "Normalized poll lifecycle status." }
] as const;

const predictionTemplateVariables = [
  { key: "title", label: "Prediction title", description: "Prediction title." },
  { key: "totalUsers", label: "Participants", description: "Total prediction participants." },
  { key: "totalPoints", label: "Total points", description: "Total prediction points." },
  { key: "status", label: "Status", description: "Normalized prediction lifecycle status." }
] as const;

const eventTemplateVariables: Record<AlertSampleEventType, readonly z.infer<typeof alertTemplateVariableSchema>[]> = {
  follow: commonTemplateVariables,
  raid: [
    ...commonTemplateVariables,
    { key: "raidViewers", label: "Raid viewers", description: "Number of viewers in the raid." }
  ],
  cheer: [
    ...commonTemplateVariables,
    { key: "cheerAmount", label: "Bits", description: "Number of Bits cheered." },
    { key: "message", label: "Message", description: "Optional message sent with the cheer." }
  ],
  subscription: [
    ...commonTemplateVariables,
    { key: "tier", label: "Tier", description: "Subscription tier." }
  ],
  resubscription: [
    ...commonTemplateVariables,
    { key: "totalMonths", label: "Total months", description: "Total number of subscribed months." },
    { key: "streakMonths", label: "Current streak", description: "Current subscription streak in months when available." },
    { key: "tier", label: "Tier", description: "Subscription tier." },
    { key: "message", label: "Message", description: "Optional resubscription message." }
  ],
  channel_point_redemption: [
    ...commonTemplateVariables,
    { key: "rewardTitle", label: "Reward title", description: "Channel Point reward title." },
    { key: "userInput", label: "User input", description: "Optional text entered with the redemption." }
  ],
  gift_subscription: [
    { key: "recipientName", label: "Recipient name", description: "Display name of the gift recipient." },
    { key: "gifterName", label: "Gifter name", description: "Display name of the gifter when available." },
    { key: "tier", label: "Tier", description: "Gift subscription tier." }
  ],
  community_gift: [
    { key: "gifterName", label: "Gifter name", description: "Display name of the community-gift sender." },
    { key: "giftCount", label: "Gift count", description: "Number of subscriptions in the aggregate community gift." },
    { key: "tier", label: "Tier", description: "Community gift tier." },
    { key: "cumulativeGifts", label: "Cumulative gifts", description: "Gifter cumulative community gift total when available." }
  ],
  hype_train_start: hypeTrainTemplateVariables,
  hype_train_progress: hypeTrainTemplateVariables,
  hype_train_end: hypeTrainTemplateVariables,
  poll_start: pollTemplateVariables,
  poll_progress: pollTemplateVariables,
  poll_end: pollTemplateVariables,
  prediction_start: predictionTemplateVariables,
  prediction_progress: predictionTemplateVariables,
  prediction_lock: predictionTemplateVariables,
  prediction_end: predictionTemplateVariables,
  stream_online: [{ key: "streamType", label: "Stream type", description: "Normalized stream type when available." }],
  stream_offline: []
};

export function getAlertTemplateVariableCatalog(eventType: AlertSampleEventType) {
  return [...(eventTemplateVariables[eventType] ?? [])];
}

export function validateAlertSamplePayload(
  eventType: AlertSampleEventType,
  payload: Record<string, unknown>
): string | null {
  const positiveNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  switch (eventType) {
    case "raid":
      return positiveNumber(payload.raidViewers ?? payload.amount) ? null : "Raid viewer count must be a positive number.";
    case "cheer":
      return positiveNumber(payload.cheerAmount ?? payload.amount) ? null : "Cheer bit amount must be a positive number.";
    case "subscription":
    case "resubscription":
      return typeof payload.tier === "string" && ["prime", "1000", "2000", "3000"].includes(payload.tier) && positiveNumber(payload.amount)
        ? null
        : "Subscription samples require a supported tier and positive month or quantity value.";
    case "gift_subscription":
      return typeof payload.tier === "string" && ["prime", "1000", "2000", "3000"].includes(payload.tier) && hasDisplayName(payload.recipient)
        ? null
        : "Gift subscription samples require a supported tier and recipient.";
    case "community_gift":
      return typeof payload.tier === "string" && ["prime", "1000", "2000", "3000"].includes(payload.tier) && positiveNumber(payload.amount)
        ? null
        : "Community gift samples require a supported tier and positive gift count.";
    case "hype_train_start":
    case "hype_train_progress":
    case "hype_train_end":
      return positiveNumber(payload.level) && nonNegativeNumber(payload.progress) && positiveNumber(payload.total)
        ? null
        : "Hype Train samples require a level, progress, and total.";
    case "poll_start":
    case "poll_progress":
    case "poll_end":
      return nonEmptyText(payload.title) && nonNegativeNumber(payload.totalVotes) && nonEmptyText(payload.status)
        ? null
        : "Poll samples require a title, vote total, and status.";
    case "prediction_start":
    case "prediction_progress":
    case "prediction_lock":
    case "prediction_end":
      return nonEmptyText(payload.title) && nonNegativeNumber(payload.totalPoints) && nonNegativeNumber(payload.totalUsers) && nonEmptyText(payload.status)
        ? null
        : "Prediction samples require a title, point total, participant total, and status.";
    case "stream_online":
      return nonEmptyText(payload.streamType) ? null : "Stream online samples require a stream type.";
    case "stream_offline":
      return null;
    case "channel_point_redemption":
      return typeof payload.rewardTitle === "string" && payload.rewardTitle.trim() !== ""
        ? null
        : "Channel Point samples require a reward title.";
    case "follow":
      return null;
    default:
      return null;
  }
}

function hasDisplayName(value: unknown): boolean {
  return typeof value === "object" && value !== null && nonEmptyText((value as Record<string, unknown>).displayName);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function nonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

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
  variantConditions: z.array(alertConditionSchema).default([]),
  weight: positiveIntegerSchema.default(1),
  priority: z.number().int().nullable().default(null),
  cooldownSeconds: nonNegativeIntegerSchema.default(0),
  rulePriority: z.number().int().default(0),
  durationMs: positiveIntegerSchema.max(120_000),
  layers: z.array(alertLayerSchema),
  targetProfiles: alertTargetProfileDocumentsSchema,
  templateVariables: z.array(alertTemplateVariableSchema).optional(),
  samplePayloads: z.array(alertSamplePayloadSchema).min(1)
});

export const alertEditorSaveInputSchema = z.object({
  document: alertEditorDocumentSchema,
  confirmLiveImpact: z.boolean().default(false)
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

export const alertEditorErrorReportInputSchema = z.object({
  setId: nonEmptyStringSchema.nullable(),
  error: actionableManagementErrorSchema.extend({ referenceId: nonEmptyStringSchema })
});

export const alertEditorErrorReportResultSchema = z.object({
  referenceId: nonEmptyStringSchema
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
  processingId: nonEmptyStringSchema.nullable(),
  actorDisplayName: nonEmptyStringSchema,
  alertIds: z.array(nonEmptyStringSchema),
  matchedRuleIds: z.array(nonEmptyStringSchema),
  playbackStatus: z.enum(["queued", "playing", "completed", "skipped", "failed"]).nullable(),
  errorMessage: z.string().nullable(),
  sanitizedPayload: z.record(z.string(), z.unknown()),
  correction: managementCorrectionTargetSchema.nullable()
});

export const diagnosticsRawLogViewSchema = z.object({
  id: nonEmptyStringSchema,
  timestamp: isoDateTimeSchema,
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
  component: nonEmptyStringSchema,
  event: nonEmptyStringSchema,
  referenceId: nonEmptyStringSchema.nullable(),
  processingId: nonEmptyStringSchema.nullable(),
  message: nonEmptyStringSchema,
  data: z.record(z.string(), z.unknown()),
  correction: managementCorrectionTargetSchema.nullable()
});

export const diagnosticsProblemAreaSchema = z.enum(["providers", "alerts", "assets", "outputs", "settings", "runtime"]);

export const diagnosticsProblemViewSchema = actionableManagementErrorSchema.extend({
  id: nonEmptyStringSchema,
  area: diagnosticsProblemAreaSchema
});

export const diagnosticsWorkspaceViewSchema = z.object({
  problems: z.array(diagnosticsProblemViewSchema),
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
  dataDirectory: nonEmptyStringSchema,
  assetDirectory: nonEmptyStringSchema,
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
  logRetentionHours: positiveIntegerSchema,
  secretExclusions: z.array(nonEmptyStringSchema),
  blockers: z.array(actionableManagementErrorSchema)
});

export const openDataFolderResultSchema = z.object({
  dataDirectory: nonEmptyStringSchema
});

export const clearOldLogsResultSchema = z.object({
  deletedCount: nonNegativeIntegerSchema
});

const backupChecksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const backupJsonRecordSchema = z.record(z.string(), z.unknown());

export const configurationBackupLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxAssetCount: 10_000,
  maxTotalAssetBytes: 384 * 1024 * 1024
} as const;

const backupStorageSafeIdSchema = nonEmptyStringSchema.regex(
  /^[A-Za-z0-9_-]+$/u,
  "Backup asset IDs may contain only letters, numbers, underscores, and hyphens"
);

export const configurationBackupProviderMetadataSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  kind: providerKindSchema
});

export const configurationBackupOutputSchema = z.object({
  overlayId: nonEmptyStringSchema,
  scope: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  targetProfileId: targetProfileIdSchema.nullable()
});

export const configurationBackupAssetSchema = z.object({
  id: backupStorageSafeIdSchema,
  filename: nonEmptyStringSchema,
  mediaType: assetMediaTypeSchema,
  mimeType: nonEmptyStringSchema,
  sizeBytes: nonNegativeIntegerSchema,
  checksum: backupChecksumSchema,
  dataBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/u)
});

export const currentConfigurationBackupArchiveVersion = 2 as const;

export const legacyConfigurationBackupArchiveEnvelopeSchema = z.object({
  manifest: z.object({
    format: z.literal("stream-jams-backup"),
    archiveVersion: z.literal(1),
    schemaVersion: nonNegativeIntegerSchema
  }).passthrough()
}).passthrough();

export const configurationBackupArchiveSchema = z.object({
  manifest: z.object({
    format: z.literal("stream-jams-backup"),
    archiveVersion: z.literal(currentConfigurationBackupArchiveVersion),
    appVersion: nonEmptyStringSchema,
    schemaVersion: nonNegativeIntegerSchema,
    createdAt: isoDateTimeSchema,
    configurationChecksum: backupChecksumSchema,
    configurationRecordCount: nonNegativeIntegerSchema,
    assetCount: nonNegativeIntegerSchema.max(configurationBackupLimits.maxAssetCount),
    totalAssetBytes: nonNegativeIntegerSchema.max(configurationBackupLimits.maxTotalAssetBytes)
  }),
  configuration: z.object({
    appConfig: backupJsonRecordSchema,
    tables: z.record(z.string(), z.array(backupJsonRecordSchema)),
    providerReconnectMetadata: z.array(configurationBackupProviderMetadataSchema),
    overlayOutputs: z.array(configurationBackupOutputSchema)
  }),
  assets: z.array(configurationBackupAssetSchema).max(configurationBackupLimits.maxAssetCount)
}).superRefine((archive, context) => {
  visitBackupValue(archive.configuration, [], (path) => {
    context.addIssue({
      code: "custom",
      message: `Backup configuration contains a forbidden secret field at ${path.join(".")}`,
      path: ["configuration", ...path]
    });
  });
});

export const configurationRestoreImpactSchema = z.object({
  configurationRecords: nonNegativeIntegerSchema,
  providers: nonNegativeIntegerSchema,
  alertSets: nonNegativeIntegerSchema,
  assets: nonNegativeIntegerSchema,
  preferences: nonNegativeIntegerSchema,
  browserOutputs: nonNegativeIntegerSchema
});

export const configurationRestoreRuntimeSchema = z.object({
  intakeActive: z.boolean(),
  playbackActive: z.boolean(),
  queuedPlaybackCount: nonNegativeIntegerSchema
});

export const configurationRestorePreflightSchema = z.object({
  state: z.enum(["valid", "invalid", "blocked-live"]),
  archiveId: backupChecksumSchema.nullable(),
  appVersion: nonEmptyStringSchema.nullable(),
  schemaVersion: nonNegativeIntegerSchema.nullable(),
  createdAt: isoDateTimeSchema.nullable(),
  impact: configurationRestoreImpactSchema.nullable(),
  runtime: configurationRestoreRuntimeSchema,
  blockers: z.array(actionableManagementErrorSchema),
  warnings: z.array(actionableManagementErrorSchema)
});

export const configurationRestoreRequestSchema = z.object({
  archive: configurationBackupArchiveSchema,
  archiveId: backupChecksumSchema,
  confirmation: z.literal("RESTORE"),
  regenerateRouteKeys: z.literal(true)
});

export const configurationRestoreResultSchema = z.object({
  state: z.literal("completed"),
  safetyBackupPath: nonEmptyStringSchema,
  restored: configurationRestoreImpactSchema,
  regeneratedOutputs: z.array(z.object({
    label: nonEmptyStringSchema,
    url: nonEmptyStringSchema
  })),
  reconnectProviders: z.array(nonEmptyStringSchema),
  warnings: z.array(actionableManagementErrorSchema)
});

function visitBackupValue(
  value: unknown,
  path: readonly (string | number)[],
  onForbiddenField: (path: readonly (string | number)[]) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitBackupValue(item, [...path, index], onForbiddenField));
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const canonicalKey = key.replace(/[^a-z0-9]/giu, "").toLocaleLowerCase();
    if (canonicalKey !== "nonsecretconfigjson" && /(?:password|credential|token|authorization|secret|routekey|keyhash|rawkey|accesskey)/u.test(canonicalKey)) {
      onForbiddenField([...path, key]);
      continue;
    }
    visitBackupValue(nested, [...path, key], onForbiddenField);
  }
}

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

export function getAlertEditorAffectedProfileIds(
  savedDocument: AlertEditorDocument,
  candidateDocument: AlertEditorDocument
): readonly TargetProfileId[] {
  const profileIds = new Set<TargetProfileId>();
  for (const document of [savedDocument, candidateDocument]) {
    for (const profile of document.targetProfiles) profileIds.add(profile.id);
  }

  return [...profileIds].filter((profileId) =>
    JSON.stringify(alertEditorLiveOutputState(savedDocument, profileId))
      !== JSON.stringify(alertEditorLiveOutputState(candidateDocument, profileId))
  );
}

function alertEditorLiveOutputState(document: AlertEditorDocument, profileId: TargetProfileId) {
  const profile = document.targetProfiles.find((candidate) => candidate.id === profileId);
  if (!document.enabled || profile?.enabled !== true) return null;
  return {
    providerKind: document.providerKind,
    eventType: document.eventType,
    conditions: document.conditions,
    variantConditions: document.variantConditions,
    weight: document.weight,
    priority: document.priority,
    cooldownSeconds: document.cooldownSeconds,
    rulePriority: document.rulePriority,
    durationMs: document.durationMs,
    layers: document.layers.map(alertLayerLiveOutputState),
    layerLayouts: profile.layerLayouts
  };
}

function alertLayerLiveOutputState(layer: AlertLayer) {
  const { name, ...state } = layer;
  void name;
  return state;
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
export type ProviderLiveStatus = z.infer<typeof providerLiveStatusSchema>;
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
export type AlertVariationCreateInput = z.infer<typeof alertVariationCreateInputSchema>;
export type ManagedAlertMutationInput = z.infer<typeof managedAlertMutationInputSchema>;
export type AlertCreateInput = z.infer<typeof alertCreateInputSchema>;
export type AlertBrowserSourceView = z.infer<typeof alertBrowserSourceViewSchema>;
export type AlertSetDetail = z.infer<typeof alertSetDetailSchema>;
export type AlertSetMutationInput = z.infer<typeof alertSetMutationInputSchema>;
export type AlertSetActivationImpact = z.infer<typeof alertSetActivationImpactSchema>;
export type AlertSetActivationResult = z.infer<typeof alertSetActivationResultSchema>;
export type AlertLayer = z.infer<typeof alertLayerSchema>;
export type AlertTargetProfileDocument = z.infer<typeof alertTargetProfileDocumentSchema>;
export type AlertSamplePayload = z.infer<typeof alertSamplePayloadSchema>;
export type AlertTemplateVariable = z.infer<typeof alertTemplateVariableSchema>;
export type AlertEditorDocument = z.infer<typeof alertEditorDocumentSchema>;
export type AlertEditorSaveInput = z.infer<typeof alertEditorSaveInputSchema>;
export type AlertEditorTestRequest = z.infer<typeof alertEditorTestRequestSchema>;
export type AlertEditorTestResult = z.infer<typeof alertEditorTestResultSchema>;
export type AlertEditorErrorReportInput = z.infer<typeof alertEditorErrorReportInputSchema>;
export type AlertEditorErrorReportResult = z.infer<typeof alertEditorErrorReportResultSchema>;
export type AssetUsageSummary = z.infer<typeof assetUsageSummarySchema>;
export type AssetLibraryItem = z.infer<typeof assetLibraryItemSchema>;
export type AssetMetadataUpdateInput = z.infer<typeof assetMetadataUpdateInputSchema>;
export type AssetChangeImpact = z.infer<typeof assetChangeImpactSchema>;
export type DiagnosticsProblemArea = z.infer<typeof diagnosticsProblemAreaSchema>;
export type DiagnosticsProblemView = z.infer<typeof diagnosticsProblemViewSchema>;
export type DiagnosticsEventView = z.infer<typeof diagnosticsEventViewSchema>;
export type DiagnosticsRawLogView = z.infer<typeof diagnosticsRawLogViewSchema>;
export type DiagnosticsWorkspaceView = z.infer<typeof diagnosticsWorkspaceViewSchema>;
export type HomeSetupSummary = z.infer<typeof homeSetupSummarySchema>;
export type ConfigurationBackupSummary = z.infer<typeof configurationBackupSummarySchema>;
export type OpenDataFolderResult = z.infer<typeof openDataFolderResultSchema>;
export type ClearOldLogsResult = z.infer<typeof clearOldLogsResultSchema>;
export type ConfigurationBackupProviderMetadata = z.infer<typeof configurationBackupProviderMetadataSchema>;
export type ConfigurationBackupOutput = z.infer<typeof configurationBackupOutputSchema>;
export type ConfigurationBackupAsset = z.infer<typeof configurationBackupAssetSchema>;
export type ConfigurationBackupArchive = z.infer<typeof configurationBackupArchiveSchema>;
export type ConfigurationRestoreImpact = z.infer<typeof configurationRestoreImpactSchema>;
export type ConfigurationRestoreRuntime = z.infer<typeof configurationRestoreRuntimeSchema>;
export type ConfigurationRestorePreflight = z.infer<typeof configurationRestorePreflightSchema>;
export type ConfigurationRestoreRequest = z.infer<typeof configurationRestoreRequestSchema>;
export type ConfigurationRestoreResult = z.infer<typeof configurationRestoreResultSchema>;

export interface AlertSetActivationDecision {
  readonly allowed: boolean;
  readonly requiresConfirmation: boolean;
  readonly blockerIds: readonly string[];
  readonly warningIds: readonly string[];
}
