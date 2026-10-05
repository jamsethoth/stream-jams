# Error audit baseline

Source HEAD: `90c5e8323f9b8bce0d85dbcf0eee8164da7dcf5e`. This lexical inventory was manually checked for the five findings; it is not compiler-resolved reachability.

100 declarations: 2 duplicate-definition entries to unify, 3 payload-free subscription leaves to consolidate, 24 names to repair, and 71 retained semantic contracts. Retained does not imply every handler needs no change. The full inventory follows for implementation reconciliation.

## All 24 missing names

| Error | Declaration file |
| --- | --- |
| DesktopConfigError | `apps/server/src/config/desktop-config-service.ts` |
| ServerConfigValidationError | `apps/server/src/config/server-config-service.ts` |
| PortUnavailableError | `apps/server/src/config/server-config-service.ts` |
| HttpResponseError | `apps/server/src/http/errors.ts` |
| AlertSetNotFoundError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AlertRuleForSetNotFoundError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AlertSetNameConflictError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AlertVariationNameConflictError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AlertSetActivationBlockedError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AlertSetActivationConfirmationRequiredError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AlertSetDeleteBlockedError | `apps/server/src/modules/alerts/alert-set-management-service.ts` |
| AudioOutputError | `apps/server/src/modules/audio/audio-output-error.ts` |
| AutomationControlError | `apps/server/src/modules/automation/automation-control-service.ts` |
| AutomationCredentialError | `apps/server/src/modules/automation/automation-credential-service.ts` |
| MusicSourceNotFoundError | `apps/server/src/modules/music/music-management-service.ts` |
| PearAuthenticationError | `apps/server/src/modules/music/pear-music-source.ts` |
| PearTransportUnavailableError | `apps/server/src/modules/music/pear-music-source.ts` |
| PearProtocolError | `apps/server/src/modules/music/pear-music-source.ts` |
| SurfaceSettingsError | `apps/server/src/modules/overlay-surfaces/surface-settings-service.ts` |
| UnknownOverlayOutputError | `apps/server/src/modules/overlays/overlay-output-management-service.ts` |
| UnrecoverableOverlayRouteKeyError | `apps/server/src/modules/overlays/overlay-output-management-service.ts` |
| MusicCredentialReplacementUnavailableError | `apps/server/src/modules/providers/provider-management-service.ts` |
| StartupPortInUseError | `apps/server/src/server/start-server.ts` |
| PolicyError | `packages/core/src/music/style-policy.ts` |

## Full declaration dispositions

| Error | File | Primary action |
| --- | --- | --- |
| DesktopConfigError | `apps/server/src/config/desktop-config-service.ts` | Retain and repair stable name |
| ServerConfigValidationError | `apps/server/src/config/server-config-service.ts` | Retain and repair stable name |
| PortUnavailableError | `apps/server/src/config/server-config-service.ts` | Retain and repair stable name |
| HttpResponseError | `apps/server/src/http/errors.ts` | Retain and repair stable name |
| AlertEditorNotFoundError | `apps/server/src/modules/alerts/alert-editor-service.ts` | Retain semantic contract |
| AlertEditorValidationError | `apps/server/src/modules/alerts/alert-editor-service.ts` | Retain semantic contract |
| AlertEditorDeliveryBlockedError | `apps/server/src/modules/alerts/alert-editor-service.ts` | Retain semantic contract |
| AlertEditorLiveImpactConfirmationRequiredError | `apps/server/src/modules/alerts/alert-editor-service.ts` | Retain semantic contract |
| AlertSetNotFoundError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AlertRuleForSetNotFoundError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AlertManagedLiveImpactConfirmationRequiredError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain semantic contract |
| AlertSetNameConflictError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AlertVariationNameConflictError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AlertSetActivationBlockedError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AlertSetActivationConfirmationRequiredError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AlertSetDeleteBlockedError | `apps/server/src/modules/alerts/alert-set-management-service.ts` | Retain and repair stable name |
| AssetLibraryNotFoundError | `apps/server/src/modules/assets/asset-library-service.ts` | Retain semantic contract |
| AssetLibraryInUseError | `apps/server/src/modules/assets/asset-library-service.ts` | Retain semantic contract |
| InvalidMusicAssetReferenceError | `apps/server/src/modules/assets/asset-library-service.ts` | Retain semantic contract |
| AssetPathTraversalError | `apps/server/src/modules/assets/local-asset-store.ts` | Retain semantic contract |
| AssetFileNotFoundError | `apps/server/src/modules/assets/local-asset-store.ts` | Retain semantic contract |
| AssetReadLimitExceededError | `apps/server/src/modules/assets/local-asset-store.ts` | Retain semantic contract |
| AssetFileChangedError | `apps/server/src/modules/assets/local-asset-store.ts` | Retain semantic contract |
| AssetStreamCapacityError | `apps/server/src/modules/assets/local-asset-store.ts` | Retain semantic contract |
| MediaUnavailableError | `apps/server/src/modules/assets/local-media-service.ts` | Retain semantic contract |
| MediaCapacityError | `apps/server/src/modules/assets/local-media-service.ts` | Retain semantic contract |
| AudioOutputError | `apps/server/src/modules/audio/audio-output-error.ts` | Retain and repair stable name |
| AutomationControlError | `apps/server/src/modules/automation/automation-control-service.ts` | Retain and repair stable name |
| AutomationCredentialError | `apps/server/src/modules/automation/automation-credential-service.ts` | Retain and repair stable name |
| ConfigurationRestoreBlockedError | `apps/server/src/modules/backup/configuration-backup-service.ts` | Retain semantic contract |
| RuntimeMaintenanceUnavailableError | `apps/server/src/modules/backup/runtime-maintenance-gate.ts` | Retain semantic contract |
| DiagnosticsLimitError | `apps/server/src/modules/diagnostics/diagnostics-service.ts` | Retain semantic contract |
| MusicSourceNotFoundError | `apps/server/src/modules/music/music-management-service.ts` | Retain and repair stable name |
| PearAuthenticationError | `apps/server/src/modules/music/pear-music-source.ts` | Retain and repair stable name |
| PearTransportUnavailableError | `apps/server/src/modules/music/pear-music-source.ts` | Retain and repair stable name |
| PearProtocolError | `apps/server/src/modules/music/pear-music-source.ts` | Retain and repair stable name |
| SurfaceSettingsError | `apps/server/src/modules/overlay-surfaces/surface-settings-service.ts` | Retain and repair stable name |
| UnknownOverlayOutputError | `apps/server/src/modules/overlays/overlay-output-management-service.ts` | Retain and repair stable name |
| UnrecoverableOverlayRouteKeyError | `apps/server/src/modules/overlays/overlay-output-management-service.ts` | Retain and repair stable name |
| UnknownPlaybackOwnerError | `apps/server/src/modules/playback/playback-operations-service.ts` | Retain semantic contract |
| PlaybackOperationsConflictError | `apps/server/src/modules/playback/playback-operations-service.ts` | Retain semantic contract |
| ProviderActivationBlockedError | `apps/server/src/modules/providers/provider-management-service.ts` | Retain semantic contract |
| ProviderActivationConfirmationRequiredError | `apps/server/src/modules/providers/provider-management-service.ts` | Retain semantic contract |
| ProviderRegistrationNotFoundError | `apps/server/src/modules/providers/provider-management-service.ts` | Retain semantic contract |
| StreamerBotSubscriptionWrongProviderError | `apps/server/src/modules/providers/provider-management-service.ts` | Consolidate payload-free leaf |
| StreamerBotSubscriptionInactiveError | `apps/server/src/modules/providers/provider-management-service.ts` | Consolidate payload-free leaf |
| StreamerBotSubscriptionSelectionUnavailableError | `apps/server/src/modules/providers/provider-management-service.ts` | Retain semantic contract |
| StreamerBotBroadcasterUnverifiedError | `apps/server/src/modules/providers/provider-management-service.ts` | Consolidate payload-free leaf |
| MusicCredentialReplacementUnavailableError | `apps/server/src/modules/providers/provider-management-service.ts` | Retain and repair stable name |
| EffectDefinitionNotFoundError | `apps/server/src/modules/screen-effects/effect-admission-service.ts` | Unify duplicated definition |
| EffectRecentOccurrenceNotFoundError | `apps/server/src/modules/screen-effects/effect-admission-service.ts` | Retain semantic contract |
| EffectVariantNotFoundError | `apps/server/src/modules/screen-effects/effect-admission-service.ts` | Retain semantic contract |
| EffectDefinitionNotFoundError | `apps/server/src/modules/screen-effects/effect-management-service.ts` | Unify duplicated definition |
| EffectDefinitionConflictError | `apps/server/src/modules/screen-effects/effect-management-service.ts` | Retain semantic contract |
| EffectLiveImpactConfirmationRequiredError | `apps/server/src/modules/screen-effects/effect-management-service.ts` | Retain semantic contract |
| EffectBindingUnavailableError | `apps/server/src/modules/screen-effects/effect-management-service.ts` | Retain semantic contract |
| EffectTestDisabledError | `apps/server/src/modules/screen-effects/effect-management-service.ts` | Retain semantic contract |
| EffectTestVariantUnavailableError | `apps/server/src/modules/screen-effects/effect-management-service.ts` | Retain semantic contract |
| SecretStoreUnavailableError | `apps/server/src/modules/security/runtime-secret-store.ts` | Retain semantic contract |
| StreamerBotProtocolError | `apps/server/src/modules/streamerbot/streamerbot-client.ts` | Retain semantic contract |
| StreamerBotAuthenticationError | `apps/server/src/modules/streamerbot/streamerbot-client.ts` | Retain semantic contract |
| StreamerBotConnectionError | `apps/server/src/modules/streamerbot/streamerbot-client.ts` | Retain semantic contract |
| StreamerBotEventNormalizationError | `apps/server/src/modules/streamerbot/streamerbot-event-normalizer.ts` | Retain semantic contract |
| StreamerBotRuntimeUnavailableError | `apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts` | Retain semantic contract |
| TimerDefinitionReferenceError | `apps/server/src/modules/timers/sqlite-timer-definition-repository.ts` | Retain semantic contract |
| TimerDefinitionNotFoundError | `apps/server/src/modules/timers/timer-management-service.ts` | Retain semantic contract |
| ActiveTimerDefinitionError | `apps/server/src/modules/timers/timer-management-service.ts` | Retain semantic contract |
| TimerGenerationConflictError | `apps/server/src/modules/timers/timer-runtime-coordinator.ts` | Retain semantic contract |
| TwitchApiHttpError | `apps/server/src/modules/twitch/twitch-api-client.ts` | Retain semantic contract |
| TwitchApiResponseError | `apps/server/src/modules/twitch/twitch-api-client.ts` | Retain semantic contract |
| TwitchApiTransportError | `apps/server/src/modules/twitch/twitch-api-client.ts` | Retain semantic contract |
| TwitchEventNormalizationError | `apps/server/src/modules/twitch/twitch-event-normalizer.ts` | Retain semantic contract |
| TwitchEventSubApiError | `apps/server/src/modules/twitch/twitch-eventsub-client.ts` | Retain semantic contract |
| TwitchEventSubResponseError | `apps/server/src/modules/twitch/twitch-eventsub-client.ts` | Retain semantic contract |
| TwitchOAuthAuthorizationError | `apps/server/src/modules/twitch/twitch-oauth-service.ts` | Retain semantic contract |
| TwitchOAuthProviderError | `apps/server/src/modules/twitch/twitch-oauth-service.ts` | Retain semantic contract |
| TwitchRewardCatalogError | `apps/server/src/modules/twitch/twitch-reward-catalog-service.ts` | Retain semantic contract |
| LocalRuntimeStartupError | `apps/server/src/runtime/start-local-runtime.ts` | Retain semantic contract |
| StartupPortInUseError | `apps/server/src/server/start-server.ts` | Retain and repair stable name |
| ManagementHttpError | `apps/web/src/management/management-http-client.ts` | Retain semantic contract |
| PlaybackOperationsConflictError | `apps/web/src/operator/playback-api.ts` | Retain semantic contract |
| AlertVariantSelectionError | `packages/core/src/alerts/alert-resolver.ts` | Retain semantic contract |
| AlertCollectionNotFoundError | `packages/core/src/alerts/alert-service.ts` | Retain semantic contract |
| LastActiveAlertCollectionError | `packages/core/src/alerts/alert-service.ts` | Retain semantic contract |
| AlertRuleNotFoundError | `packages/core/src/alerts/alert-service.ts` | Retain semantic contract |
| AlertVariantNotFoundError | `packages/core/src/alerts/alert-service.ts` | Retain semantic contract |
| LastAlertVariantError | `packages/core/src/alerts/alert-service.ts` | Retain semantic contract |
| AlertVariantIdConflictError | `packages/core/src/alerts/alert-service.ts` | Retain semantic contract |
| InvalidMediaImportError | `packages/core/src/assets/media-import-pipeline.ts` | Retain semantic contract |
| TimedMediaPreparationError | `packages/core/src/audio/prepare-timed-media.ts` | Retain semantic contract |
| InvalidModerationSettingsError | `packages/core/src/moderation/moderation-service.ts` | Retain semantic contract |
| PolicyError | `packages/core/src/music/style-policy.ts` | Retain and repair stable name |
| UnknownOverlayModuleError | `packages/core/src/overlay-modules/module-config-service.ts` | Retain semantic contract |
| InvalidOverlayModuleConfigError | `packages/core/src/overlay-modules/module-config-service.ts` | Retain semantic contract |
| InvalidOverlayModuleSnapshotError | `packages/core/src/overlay-modules/overlay-composition-service.ts` | Retain semantic contract |
| PlaybackQueueItemNotFoundError | `packages/core/src/playback/playback-queue.ts` | Retain semantic contract |
| ScreenEffectSetError | `packages/core/src/screen-effects/sets.ts` | Retain semantic contract |
| UnknownTtsProviderError | `packages/core/src/tts/tts-service.ts` | Retain semantic contract |
| UnsupportedTtsOptionError | `packages/core/src/tts/tts-service.ts` | Retain semantic contract |
| TtsProviderFailureError | `packages/core/src/tts/tts-service.ts` | Retain semantic contract |
