import type { AlertCollection, AlertRule, OverlayComposition } from "@stream-jams/core";
import type {
  DashboardSummary,
  DiagnosticsView,
  ManagementModuleView,
  ModerationSettingsView,
  OverlayClientView,
  OverlayOutputUrl,
  PlaybackView,
  ServerConfigView,
  TtsProviderView,
  TwitchConnectionStatusView,
  TwitchEventSubStatusView
} from "../management/management-api.js";
import type { AssetRecord } from "../management/assets/asset-api.js";

export const storyNow = "2026-06-19T16:00:00.000Z";

export const storyDashboardSummary = {
  twitch: {
    connected: true,
    label: "Twitch connected"
  },
  overlay: {
    connectedClientCount: 1,
    label: "1 overlay client"
  },
  queue: {
    label: "Queue idle",
    queuedCount: 2
  },
  recentErrors: ["Speaker.bot provider timed out on the last test alert."]
} satisfies DashboardSummary;

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

export const testAlertsOutput = {
  id: "output-alerts-test",
  label: "Alerts Test",
  purpose: "test",
  scope: "module",
  moduleId: "alerts",
  overlayId: "overlay-alerts-test",
  enabled: true,
  keyId: "key-alerts-test",
  url: "http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_story_test",
  copyableUrlStatus: "available"
} satisfies OverlayOutputUrl;

export const unifiedOutputNeedsKey = {
  id: "output-unified-live",
  label: "Unified Live",
  purpose: "live",
  scope: "unified",
  moduleId: null,
  overlayId: "overlay-unified-live",
  enabled: true,
  keyId: null,
  url: null,
  copyableUrlStatus: "create-required"
} satisfies OverlayOutputUrl;

export const storyOverlayOutputs = [liveAlertsOutput, testAlertsOutput, unifiedOutputNeedsKey] satisfies readonly OverlayOutputUrl[];

export const storyOverlayClients = [
  {
    id: "client-obs-main",
    overlayId: "overlay-alerts-live",
    purpose: "live",
    scope: "module",
    moduleId: "alerts",
    connectedAt: "2026-06-19T15:48:00.000Z",
    lastSeenAt: storyNow,
    userAgent: "OBS Browser Source"
  }
] satisfies readonly OverlayClientView[];

export const storyModules = [
  {
    id: "alerts",
    displayName: "Alerts",
    enabled: true,
    config: {
      canvas: {
        width: 1920,
        height: 1080
      }
    },
    wizard: {
      steps: [
        {
          id: "canvas",
          title: "Canvas",
          fields: [
            { id: "width", label: "Width", type: "number", required: true },
            { id: "height", label: "Height", type: "number", required: true }
          ]
        }
      ]
    }
  }
] satisfies readonly ManagementModuleView[];

export const storyPlayback = {
  current: {
    id: "queue-current",
    label: "New follower alert",
    status: "playing"
  },
  queuedCount: 2,
  paused: false,
  muted: false,
  doNotDisturb: false,
  recent: [
    {
      id: "queue-recent",
      label: "500 Bits alert",
      status: "completed"
    }
  ]
} satisfies PlaybackView;

export const storyTtsProviders = [
  {
    id: "speakerbot",
    label: "Speaker.bot",
    capabilities: {
      supportsVoices: true,
      supportsRate: false,
      supportsPitch: false,
      supportsVolume: true,
      playbackMode: "remote-trigger"
    },
    voices: [
      {
        id: "default",
        label: "Default"
      }
    ]
  }
] satisfies readonly TtsProviderView[];

export const storyTwitchStatus = {
  connected: true,
  account: {
    accountId: "twitch-story",
    login: "streamjams",
    displayName: "StreamJams",
    scopes: ["channel:read:redemptions", "bits:read"],
    connectedAt: "2026-06-19T15:00:00.000Z",
    updatedAt: storyNow
  }
} satisfies TwitchConnectionStatusView;

export const storyTwitchEventSubStatus = {
  state: "connected",
  connectionState: "connected",
  sessionId: "session-story",
  connectedAt: "2026-06-19T15:00:00.000Z",
  lastMessageAt: storyNow,
  subscriptionTypes: ["channel.follow", "channel.cheer"],
  acceptedCount: 24,
  duplicateCount: 1,
  rejectedCount: 0,
  lastEventAt: "2026-06-19T15:57:00.000Z",
  lastErrorAt: null,
  message: null
} satisfies TwitchEventSubStatusView;

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

export const storyAlertCollections = [
  {
    id: "collection-default",
    name: "Default",
    enabled: true
  },
  {
    id: "collection-charity",
    name: "Charity Stream",
    enabled: false
  }
] satisfies readonly AlertCollection[];

export const storyAlertRules = [
  {
    id: "rule-follow",
    name: "New follower",
    eventType: "follow",
    enabled: true,
    collectionIds: ["collection-default"],
    conditions: [],
    cooldownSeconds: 5,
    priority: 10,
    variants: [
      {
        id: "variant-follow-default",
        name: "Default follower",
        enabled: true,
        weight: 1,
        visualAssetId: storyImageAsset.id,
        audioAssetId: null,
        textTemplate: "Thanks for following, {{actor.displayName}}!",
        ttsConfig: null,
        durationMs: 4500,
        layout: {
          x: 540,
          y: 340,
          width: 840,
          height: 260,
          zIndex: 10
        }
      }
    ]
  },
  {
    id: "rule-cheer",
    name: "Big cheer",
    eventType: "cheer",
    enabled: true,
    collectionIds: ["collection-default"],
    conditions: [
      {
        field: "amount",
        operator: "min",
        value: 500
      }
    ],
    cooldownSeconds: 10,
    priority: 20,
    variants: [
      {
        id: "variant-cheer-default",
        name: "500 Bits",
        enabled: true,
        weight: 1,
        visualAssetId: storyImageAsset.id,
        audioAssetId: null,
        textTemplate: "{{actor.displayName}} cheered {{amount}} Bits!",
        ttsConfig: {
          enabled: true,
          providerId: "speakerbot",
          voiceId: "default",
          template: "{{actor.displayName}} cheered {{amount}} Bits!",
          minimumAmount: 500
        },
        durationMs: 5500,
        layout: {
          x: 480,
          y: 300,
          width: 960,
          height: 320,
          zIndex: 12
        }
      }
    ]
  }
] satisfies readonly AlertRule[];

export const storyFollowEvent = {
  id: "event-follow-story",
  providerId: "twitch",
  sourcePlatform: "twitch",
  ingestProvider: "twitch",
  occurredAt: storyNow,
  actor: {
    id: "viewer-one",
    displayName: "ViewerOne"
  },
  message: null,
  metadata: {},
  type: "follow",
  amount: null
} as const;

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
