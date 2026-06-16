export type { AppVersion } from "./version.js";
export { createAppVersion } from "./version.js";

export type {
  CorrelationId,
  Logger,
  LogContext,
  LogLevel,
  LogSettings,
  LogSettingsUpdate,
  ProcessingId
} from "./diagnostics/logging.js";
export {
  defaultLogSettings,
  logContextSchema,
  logLevelSchema,
  logSettingsSchema,
  logSettingsUpdateSchema
} from "./diagnostics/logging.js";
export type * from "./diagnostics/repository.js";

export type * from "./config/types.js";
export type { ConfigStore } from "./config/config-store.js";
export {
  appConfigSchema,
  appConfigUpdateSchema,
  appServerConfigSchema,
  appStorageConfigSchema
} from "./config/schemas.js";

export type * from "./auth/management-session-service.js";

export type * from "./alerts/types.js";
export type * from "./alerts/repository.js";
export type * from "./alerts/alert-service.js";
export type * from "./alerts/condition-evaluator.js";
export { DefaultAlertConditionEvaluator } from "./alerts/condition-evaluator.js";
export type * from "./alerts/alert-matcher.js";
export { DefaultAlertMatcher } from "./alerts/alert-matcher.js";
export type * from "./alerts/alert-resolver.js";
export { AlertVariantSelectionError, DefaultAlertResolver } from "./alerts/alert-resolver.js";
export {
  AlertCollectionNotFoundError,
  AlertRuleNotFoundError,
  AlertVariantIdConflictError,
  AlertVariantNotFoundError,
  LastAlertVariantError,
  DefaultAlertService,
  createAlertCollectionInputSchema,
  createAlertRuleInputSchema,
  createAlertVariantInputSchema,
  updateAlertCollectionInputSchema,
  updateAlertRuleInputSchema,
  updateAlertVariantInputSchema
} from "./alerts/alert-service.js";
export {
  alertActivationStateSchema,
  alertCollectionSchema,
  alertConditionSchema,
  alertRuleSchema,
  alertTtsConfigSchema,
  alertVariantSchema,
  streamEventTypeSchema
} from "./alerts/schemas.js";

export type * from "./assets/types.js";
export type * from "./assets/repository.js";
export type * from "./assets/asset-validator.js";
export type * from "./assets/media-import-pipeline.js";
export { DefaultAssetValidator, defaultAssetValidationPolicy } from "./assets/asset-validator.js";
export { DefaultMediaImportPipeline, InvalidMediaImportError, NoopMediaTranscodingStage } from "./assets/media-import-pipeline.js";
export { assetMediaTypeSchema, assetRecordSchema, assetValidationResultSchema } from "./assets/schemas.js";

export type * from "./events/types.js";
export {
  channelPointRedemptionEventSchema,
  cheerEventSchema,
  externalStreamEventSchema,
  followEventSchema,
  ingestProviderIdSchema,
  normalizedStreamEventSchema,
  raidEventSchema,
  resubscriptionEventSchema,
  sourcePlatformIdSchema,
  streamerBotSubscriptionSelectionSchema,
  subscriptionEventSchema,
  subscriptionTierSchema
} from "./events/schemas.js";

export type * from "./overlay-modules/types.js";
export type { AlertsOverlayModuleConfig } from "./overlay-modules/module-definition.js";
export { alertsOverlayModuleConfigSchema, alertsOverlayModuleDefinition } from "./overlay-modules/module-definition.js";
export type { OverlayModuleRegistry } from "./overlay-modules/module-registry.js";
export { StaticOverlayModuleRegistry, createDefaultOverlayModuleRegistry } from "./overlay-modules/module-registry.js";
export type { OverlayModuleConfigRepository, OverlayModuleConfigService, SaveOverlayModuleConfigInput } from "./overlay-modules/module-config-service.js";
export { DefaultOverlayModuleConfigService, InMemoryOverlayModuleConfigRepository, InvalidOverlayModuleConfigError, UnknownOverlayModuleError } from "./overlay-modules/module-config-service.js";
export type { OverlayCompositionService, OverlayModuleRuntime, OverlayModuleSnapshotRequest } from "./overlay-modules/overlay-composition-service.js";
export { DefaultOverlayCompositionService, InvalidOverlayModuleSnapshotError } from "./overlay-modules/overlay-composition-service.js";
export {
  overlayModuleConfigSchema,
  overlayModuleDefinitionSchema,
  overlayModuleRendererDefinitionSchema,
  overlayModuleWizardDefinitionSchema,
  overlayModuleWizardFieldSchema,
  overlayModuleWizardStepSchema
} from "./overlay-modules/schemas.js";

export type * from "./overlays/types.js";
export {
  moduleOverlayPath,
  moduleOverlayWebSocketPath,
  unifiedOverlayPath,
  unifiedOverlayWebSocketPath
} from "./overlays/types.js";
export type * from "./overlays/overlay-access-service.js";
export {
  moduleOutputRequestSchema,
  overlayAudioInstructionSchema,
  overlayCompositionSchema,
  overlayInstructionSchema,
  overlayModuleSnapshotSchema,
  overlayTextInstructionSchema,
  overlayVisualInstructionSchema,
  unifiedOutputRequestSchema
} from "./overlays/schemas.js";

export type * from "./playback/types.js";
export type * from "./playback/playback-queue.js";
export { DefaultPlaybackQueue, PlaybackQueueItemNotFoundError } from "./playback/playback-queue.js";
export type * from "./playback/cooldown-service.js";
export { DefaultPlaybackCooldownService } from "./playback/cooldown-service.js";
export type * from "./playback/dedupe-service.js";
export { DefaultPlaybackDedupeService } from "./playback/dedupe-service.js";
export { playbackQueueItemSchema, playbackQueueSnapshotSchema, resolvedAlertSchema } from "./playback/schemas.js";

export type * from "./security/types.js";
export type { Redactor, SecretStore } from "./security/secret-store.js";
export {
  createOverlayKeyInputSchema,
  managementSessionSchema,
  overlayAccessKeySchema,
  secretRefSchema
} from "./security/schemas.js";

export {
  isoDateTimeSchema,
  metadataSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  nullableNonEmptyStringSchema,
  overlayElementLayoutSchema,
  overlayPurposeSchema,
  overlayScopeSchema,
  positiveIntegerSchema,
  uuidLikeIdSchema
} from "./shared/schemas.js";

export type * from "./moderation/moderation-service.js";
export { DefaultModerationService, InvalidModerationSettingsError } from "./moderation/moderation-service.js";
export { defaultModerationSettings, blockedTermReplacement, strippedUrlReplacement } from "./moderation/default-rules.js";

export type * from "./templates/template-renderer.js";
export { DefaultTemplateRenderer } from "./templates/template-renderer.js";
export type * from "./templates/safe-template-renderer.js";
export { SafeTemplateRenderer } from "./templates/safe-template-renderer.js";

export type * from "./tts/types.js";
export type * from "./tts/tts-provider.js";
export type * from "./tts/tts-service.js";
export {
  DefaultTtsService,
  TtsProviderFailureError,
  UnknownTtsProviderError,
  UnsupportedTtsOptionError
} from "./tts/tts-service.js";
export {
  ttsPlaybackInstructionSchema,
  ttsPlaybackModeSchema,
  ttsProviderCapabilitiesSchema,
  ttsProviderConfigRefSchema,
  ttsVoiceSchema
} from "./tts/schemas.js";
