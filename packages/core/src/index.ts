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
  desktopConfigSchema,
  desktopConfigUpdateSchema,
  appConfigSchema,
  appConfigUpdateSchema,
  appServerConfigSchema,
  appStorageConfigSchema
} from "./config/schemas.js";

export type * from "./auth/management-session-service.js";

export type * from "./audio/types.js";
export type { AudioDeviceCapability, AudioRouteStatus, AudioOutputStatus } from "./audio/schemas.js";
export type { AudioOutputRouteRepository } from "./audio/audio-output-route-repository.js";
export { resolveAudioDestinations } from "./audio/resolve-audio-destinations.js";
export { resolveAlertAudio } from "./audio/resolve-alert-audio.js";
export {
  alertAudioOutputsSchema,
  audioRouteIdSchema,
  explicitAudioDeviceIdSchema,
  audioOutputDeviceSchema,
  audioOutputRouteSchema,
  audioOutputRouteCreateSchema,
  audioOutputRoutePatchSchema,
  audioOutputRouteTestSchema,
  resolvedAudioLayerSchema,
  resolvedAlertAudioSchema,
  audioDestinationSchema,
  deviceAudioBatchSchema,
  deviceAudioResultSchema,
  audioDeviceCapabilitySchema,
  audioRouteStatusSchema,
  audioOutputStatusSchema
} from "./audio/schemas.js";

export type * from "./alerts/types.js";
export type { ChannelPointRewardSelection } from "./alerts/channel-point-reward-selection.js";
export {
  channelPointRewardIdsSchema,
  channelPointRewardSelectionSchema,
  channelPointRewardSelectionsMayOverlap,
  readChannelPointRewardSelection,
  replaceChannelPointRewardSelection
} from "./alerts/channel-point-reward-selection.js";
export type * from "./alerts/text-style.js";
export {
  alertFontPresets,
  alertFontWeights,
  alertShadowStyleSchema,
  alertTextBoxStyleSchema,
  alertTextStyleLimits,
  alertTextStyleSchema,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  defaultOptionalAlertShadow,
  rgbaColorSchema
} from "./alerts/text-style.js";
export type * from "./alerts/repository.js";
export type * from "./alerts/alert-service.js";
export type * from "./alerts/condition-evaluator.js";
export { DefaultAlertConditionEvaluator } from "./alerts/condition-evaluator.js";
export type * from "./alerts/alert-matcher.js";
export { DefaultAlertMatcher } from "./alerts/alert-matcher.js";
export type * from "./alerts/alert-resolver.js";
export { AlertVariantSelectionError, DefaultAlertResolver, createAlertTemplateContext } from "./alerts/alert-resolver.js";
export type * from "./alerts/variation-authoring.js";
export type { AlertVariationPriorityAssignment } from "./alerts/variation-authoring.js";
export {
  areAlertPriorityGroupsEqual,
  buildAlertPriorityGroups,
  chooseWeightedAlertVariation,
  createNormalizedAlertSampleEvent,
  evaluateAlertVariationSample,
  formatAlertConditionSummary,
  getAlertConditionFieldDefinitions,
  moveAlertPriorityGroup,
  moveAlertVariationToPriorityGroup,
  normalizeAlertPriorityGroups,
  projectAlertVariationSelection,
  validateAuthoredAlertConditions
} from "./alerts/variation-authoring.js";
export {
  AlertCollectionNotFoundError,
  LastActiveAlertCollectionError,
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
export { streamEventTypes } from "./events/types.js";
export type { SubscriptionTier } from "./events/schemas.js";
export {
  channelPointRedemptionEventSchema,
  cheerEventSchema,
  communityGiftEventSchema,
  externalStreamEventSchema,
  followEventSchema,
  giftSubscriptionEventSchema,
  hypeTrainEndEventSchema,
  hypeTrainProgressEventSchema,
  hypeTrainStartEventSchema,
  ingestProviderIdSchema,
  normalizedStreamEventSchema,
  pollChoiceSchema,
  pollEndEventSchema,
  pollProgressEventSchema,
  pollStartEventSchema,
  predictionEndEventSchema,
  predictionLockEventSchema,
  predictionOutcomeSchema,
  predictionProgressEventSchema,
  predictionStartEventSchema,
  raidEventSchema,
  resubscriptionEventSchema,
  sourcePlatformIdSchema,
  streamOfflineEventSchema,
  streamOnlineEventSchema,
  streamerBotSubscriptionSelectionSchema,
  subscriptionEventSchema,
  subscriptionTierSchema
} from "./events/schemas.js";

export type * from "./overlay-modules/types.js";
export { surfaceLayerSchema, surfaceLayersSchema, surfaceConfigurationSchema, reconcileSurfaceLayers, validateSurfaceOrder } from "./overlay-modules/surface-configuration.js";
export type { SurfaceLayer, SurfaceConfiguration, SurfaceRepository } from "./overlay-modules/surface-configuration.js";
export { visualRecipientKeySchema } from "./overlays/visual-recipient.js";
export type { VisualRecipientKey } from "./overlays/visual-recipient.js";
export { playbackTimingSchema } from "./overlays/playback-timing.js";
export type { PlaybackTiming } from "./overlays/playback-timing.js";
export { desktopVisualInstructionSchema, desktopVisualAssetSchema, desktopVisualBatchSchema, desktopVisualCommandSchema, desktopVisualReplySchema, desktopVisualRendererRequestSchema, desktopVisualRendererReplySchema, maxDesktopVisualTransferBytes, visualMediaType } from "./overlays/desktop-visual-transport.js";
export type { DesktopVisualBatch, DesktopVisualAsset, DesktopVisualCommand, DesktopVisualReply, DesktopOverlayTransport, DesktopVisualRendererRequest, DesktopVisualRendererReply } from "./overlays/desktop-visual-transport.js";
export { VisualRecipientLedger } from "./overlays/visual-recipient-ledger.js";
export { selectedDesktopDisplaySchema, desktopOverlayStatusSchema, surfaceSettingsViewSchema } from "./overlays/desktop-overlay-status.js";
export type { SelectedDesktopDisplay, DesktopOverlayStatus, SurfaceSettingsView } from "./overlays/desktop-overlay-status.js";
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
export { defaultPlaybackSafetyState } from "./playback/types.js";
export type * from "./playback/playback-queue.js";
export { DefaultPlaybackQueue, PlaybackQueueItemNotFoundError } from "./playback/playback-queue.js";
export type * from "./playback/cooldown-service.js";
export { DefaultPlaybackCooldownService } from "./playback/cooldown-service.js";
export type * from "./playback/dedupe-service.js";
export { DefaultPlaybackDedupeService } from "./playback/dedupe-service.js";
export {
  playbackQueueItemSchema,
  playbackQueueSnapshotSchema,
  playbackSafetyStateSchema,
  resolvedAlertSchema
} from "./playback/schemas.js";

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
  overlayTargetProfileIdSchema,
  positiveIntegerSchema,
  uuidLikeIdSchema
} from "./shared/schemas.js";

export type * from "./moderation/moderation-service.js";
export type * from "./moderation/repository.js";
export {
  DefaultModerationService,
  InvalidModerationSettingsError,
  normalizeModerationSettings
} from "./moderation/moderation-service.js";
export { defaultModerationSettings, blockedTermReplacement, strippedUrlReplacement } from "./moderation/default-rules.js";

export * from "./management/contracts.js";
export * from "./management/alert-starter-themes.js";
export * from "./management/twitch-reward-catalog.js";

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
export * from "./audio/transport.js";
export * from "./management/alert-document-compatibility.js";
export * from "./audio/media-audio.js";
export * from "./audio/prepare-timed-media.js";
