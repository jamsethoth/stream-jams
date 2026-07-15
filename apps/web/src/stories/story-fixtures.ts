import type { AssetLibraryItem, OverlayComposition } from "@stream-jams/core";
import type {
  DiagnosticsView,
  ModerationSettingsView,
  OverlayOutputUrl,
  ServerConfigView
} from "../management/management-api.js";
import type { AssetRecord } from "../management/assets/asset-api.js";

export const storyNow = "2026-06-19T16:00:00.000Z";

export const storyServerConfig = {
  host: "127.0.0.1",
  port: 39187
} satisfies ServerConfigView;

export const storyModerationSettings = {
  renderedText: {
    maxLength: 240,
    blockedTerms: ["spoiler"],
    stripUrls: true
  },
  ttsText: {
    maxLength: 180,
    blockedTerms: ["spoiler", "loud noise"],
    stripUrls: true
  }
} satisfies ModerationSettingsView;

export const liveAlertsOutput = {
  id: "output-alerts-live",
  label: "Alerts Live",
  purpose: "live",
  scope: "module",
  moduleId: "alerts",
  overlayId: "overlay-alerts-live",
  enabled: true,
  keyId: "key-alerts-live",
  url: "http://127.0.0.1:39187/overlay/modules/alerts/live/ovl_story_live",
  copyableUrlStatus: "available"
} satisfies OverlayOutputUrl;

export const storyDiagnostics = {
  eventLogs: [
    {
      id: "event-log-1",
      eventId: "event-follow-1",
      providerId: "twitch",
      eventType: "follow",
      actorDisplayName: "ViewerOne",
      status: "processed",
      receivedAt: "2026-06-19T15:58:00.000Z",
      correlationId: "corr-story-1",
      processingId: "proc-story-1",
      errorMessage: null
    }
  ],
  alertMatchLogs: [
    {
      id: "match-log-1",
      sourceEventId: "event-follow-1",
      ruleId: "rule-follow",
      variantId: "variant-follow-default",
      matchedAt: "2026-06-19T15:58:01.000Z",
      correlationId: "corr-story-1",
      processingId: "proc-story-1"
    }
  ],
  playbackLogs: [
    {
      id: "playback-log-1",
      queueItemId: "queue-current",
      sourceEventId: "event-follow-1",
      alertIds: ["rule-follow"],
      status: "playing",
      occurredAt: "2026-06-19T15:58:02.000Z",
      correlationId: "corr-story-1",
      processingId: "proc-story-1",
      message: null
    }
  ],
  providerErrors: [
    {
      id: "provider-error-1",
      providerId: "speakerbot",
      label: "Speaker.bot",
      occurredAt: "2026-06-19T15:59:00.000Z",
      message: "Provider did not acknowledge playback before timeout.",
      correlationId: "corr-story-2",
      processingId: null
    }
  ],
  runtimeLogging: {
    logDirectory: "C:/Users/Streamer/AppData/Local/StreamJams/logs",
    level: "INFO",
    rollover: "hourly",
    retentionHours: 48,
    fileCount: 3,
    currentLogFile: "runtime-2026061916.jsonl",
    oldestLogFile: "runtime-2026061914.jsonl",
    newestLogFile: "runtime-2026061916.jsonl"
  }
} satisfies DiagnosticsView;

export const storyImageAsset = {
  id: "asset-alert-image",
  originalFileName: "tiny-alert.svg",
  mediaType: "image",
  mimeType: "image/svg+xml",
  sizeBytes: 912,
  checksum: "sha256:storybook-alert",
  storagePath: "storybook-assets/tiny-alert.svg"
} satisfies AssetRecord;

export const storyAudioAsset = {
  id: "asset-alert-sound",
  originalFileName: "short-chime.wav",
  mediaType: "audio",
  mimeType: "audio/wav",
  sizeBytes: 1536,
  checksum: "sha256:storybook-chime",
  storagePath: "storybook-assets/short-chime.wav"
} satisfies AssetRecord;

export const storyAssets = [storyImageAsset, storyAudioAsset] satisfies readonly AssetRecord[];

export const storyAssetLibraryItems = [
  {
    id: storyImageAsset.id,
    displayName: "Follower burst",
    originalFileName: storyImageAsset.originalFileName,
    mediaType: storyImageAsset.mediaType,
    mimeType: storyImageAsset.mimeType,
    sizeBytes: storyImageAsset.sizeBytes,
    width: 320,
    height: 180,
    durationMs: null,
    health: "available",
    tags: ["follow", "bright"],
    createdAt: storyNow,
    updatedAt: storyNow,
    usage: {
      assetId: storyImageAsset.id,
      totalUsageCount: 1,
      usages: [{
        setId: "collection-default",
        setName: "Default",
        eventType: "follow",
        alertId: "rule-follow",
        alertName: "New follower",
        targetProfileIds: ["landscape", "vertical"]
      }]
    }
  },
  {
    id: storyAudioAsset.id,
    displayName: "Short chime",
    originalFileName: storyAudioAsset.originalFileName,
    mediaType: storyAudioAsset.mediaType,
    mimeType: storyAudioAsset.mimeType,
    sizeBytes: storyAudioAsset.sizeBytes,
    width: null,
    height: null,
    durationMs: 850,
    health: "available",
    tags: ["audio", "short"],
    createdAt: storyNow,
    updatedAt: storyNow,
    usage: { assetId: storyAudioAsset.id, totalUsageCount: 0, usages: [] }
  }
] satisfies readonly AssetLibraryItem[];

export const idleOverlayComposition = {
  overlayId: "overlay-alerts-live",
  purpose: "live",
  scope: "module",
  modules: [
    {
      moduleId: "alerts",
      enabled: true,
      instructions: []
    }
  ]
} satisfies OverlayComposition;

export const textOnlyOverlayComposition = {
  overlayId: "overlay-alerts-test",
  purpose: "test",
  scope: "module",
  modules: [
    {
      moduleId: "alerts",
      enabled: true,
      instructions: [
        {
          id: "instruction-text",
          overlayId: "overlay-alerts-test",
          moduleId: "alerts",
          purpose: "test",
          scope: "module",
          visual: null,
          audio: null,
          text: {
            text: "ViewerOne followed!",
            layout: {
              x: 620,
              y: 420,
              width: 680,
              height: 120,
              zIndex: 10
            }
          },
          tts: null,
          durationMs: 4500
        }
      ]
    }
  ]
} satisfies OverlayComposition;

export const mediaOverlayComposition = {
  overlayId: "overlay-alerts-test",
  purpose: "test",
  scope: "module",
  modules: [
    {
      moduleId: "alerts",
      enabled: true,
      instructions: [
        {
          id: "instruction-media",
          overlayId: "overlay-alerts-test",
          moduleId: "alerts",
          purpose: "test",
          scope: "module",
          visual: {
            assetId: storyImageAsset.id,
            mediaType: "image",
            layout: {
              x: 700,
              y: 290,
              width: 520,
              height: 292,
              zIndex: 8
            }
          },
          audio: null,
          text: {
            text: "500 Bits from ViewerOne",
            layout: {
              x: 560,
              y: 610,
              width: 800,
              height: 120,
              zIndex: 10
            }
          },
          tts: null,
          durationMs: 5500
        }
      ]
    }
  ]
} satisfies OverlayComposition;

export const errorSafeOverlayComposition = {
  overlayId: "overlay-alerts-live",
  purpose: "live",
  scope: "module",
  modules: [
    {
      moduleId: "alerts",
      enabled: false,
      instructions: []
    }
  ]
} satisfies OverlayComposition;
