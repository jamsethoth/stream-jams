import type { AlertCollection, AlertRule } from "./modules/alerts/alert-api.js";
import type { AssetRecord } from "./assets/asset-api.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementApp } from "./ManagementApp.js";
import type { AssetApi } from "./assets/AssetManager.js";
import type { ManagementApi } from "./management-api.js";

afterEach(() => {
  cleanup();
});

describe("ManagementApp", () => {
  it("renders dashboard status and navigates to copyable overlay URLs", async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWrite
      }
    });
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Twitch disconnected")).toBeInTheDocument();
    expect(screen.getByText("2 overlay clients")).toBeInTheDocument();
    expect(screen.getByText("Queue paused")).toBeInTheDocument();
    expect(screen.getByText("Last provider request failed")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Overlays" }));
    const overlayPanel = screen.getByRole("tabpanel", { name: "Overlays" });
    expect(within(overlayPanel).getByText("Alerts test")).toBeInTheDocument();
    expect(within(overlayPanel).getByText("http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test")).toBeInTheDocument();
    await user.click(within(overlayPanel).getByRole("button", { name: "Copy Alerts test" }));

    expect(clipboardWrite).toHaveBeenCalledWith("http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test");
    expect(within(overlayPanel).getByText("client-live")).toBeInTheDocument();
    expect(within(overlayPanel).getByText("live module")).toBeInTheDocument();
  });

  it("renders module definitions and module-provided wizard fields", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("tab", { name: "Modules" }));
    const modulesPanel = screen.getByRole("tabpanel", { name: "Modules" });
    expect(await within(modulesPanel).findByRole("heading", { name: "Overlay Modules" })).toBeInTheDocument();
    expect(within(modulesPanel).getByText("Alerts")).toBeInTheDocument();
    expect(within(modulesPanel).getByLabelText("Alerts enabled")).toBeChecked();
    expect(within(modulesPanel).getByText("Canvas width")).toBeInTheDocument();
    expect(within(modulesPanel).getByText("Canvas height")).toBeInTheDocument();

    await user.clear(within(modulesPanel).getByLabelText("Canvas width"));
    await user.type(within(modulesPanel).getByLabelText("Canvas width"), "1280");
    await user.click(within(modulesPanel).getByRole("button", { name: "Save Alerts configuration" }));

    expect(managementApi.saveModuleConfig).toHaveBeenCalledWith("alerts", {
      enabled: true,
      config: {
        canvas: {
          width: 1280,
          height: 1080
        }
      }
    });

    await user.click(within(modulesPanel).getByLabelText("Alerts enabled"));

    expect(managementApi.setModuleEnabled).toHaveBeenCalledWith("alerts", false);
  });

  it("updates server settings and delegates playback controls", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("tab", { name: "Settings" }));
    const settingsPanel = screen.getByRole("tabpanel", { name: "Settings" });
    await user.clear(within(settingsPanel).getByLabelText("Port"));
    await user.type(within(settingsPanel).getByLabelText("Port"), "40123");
    await user.click(within(settingsPanel).getByRole("button", { name: "Save server settings" }));

    expect(managementApi.updateServerConfig).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 40123
    });

    await user.click(screen.getByRole("tab", { name: "Playback" }));
    const playbackPanel = screen.getByRole("tabpanel", { name: "Playback" });
    await user.click(within(playbackPanel).getByRole("button", { name: "Pause" }));
    await user.click(within(playbackPanel).getByRole("button", { name: "Resume" }));
    await user.click(within(playbackPanel).getByRole("button", { name: "Skip" }));
    await user.click(within(playbackPanel).getByRole("button", { name: "Replay recent" }));
    await user.click(within(playbackPanel).getByRole("button", { name: "Mute" }));
    await user.click(within(playbackPanel).getByRole("button", { name: "Unmute" }));
    await user.click(within(playbackPanel).getByLabelText("Do not disturb"));

    expect(managementApi.pausePlayback).toHaveBeenCalledOnce();
    expect(managementApi.resumePlayback).toHaveBeenCalledOnce();
    expect(managementApi.skipPlayback).toHaveBeenCalledOnce();
    expect(managementApi.replayRecent).toHaveBeenCalledWith("recent-1");
    expect(managementApi.mutePlayback).toHaveBeenCalledOnce();
    expect(managementApi.unmutePlayback).toHaveBeenCalledOnce();
    expect(managementApi.setDoNotDisturb).toHaveBeenCalledWith(true);
  });

  it("shows TTS provider capabilities and runs a sample test without unsupported voice controls", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("tab", { name: "TTS" }));
    const ttsPanel = screen.getByRole("tabpanel", { name: "TTS" });
    expect(await within(ttsPanel).findByRole("heading", { name: "TTS" })).toBeInTheDocument();
    expect(within(ttsPanel).getAllByText("Browser Speech").length).toBeGreaterThan(0);
    expect(within(ttsPanel).getAllByText("browser-speech").length).toBeGreaterThan(0);
    expect(within(ttsPanel).queryByLabelText("Voice")).not.toBeInTheDocument();

    await user.click(within(ttsPanel).getByRole("button", { name: "Run TTS test" }));

    expect(managementApi.testTts).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "browser-speech",
        text: "Sample cheer from Viewer for 500 bits",
        rate: 1,
        pitch: 1,
        volume: 1,
        metadata: {
          sampleEventType: "cheer",
          sampleAmount: 500,
          sampleActor: "Viewer"
        }
      })
    );
    expect(await within(ttsPanel).findByText("TTS test ready: browser-speech.")).toBeInTheDocument();
  });
  it("shows diagnostics logs and delegates filtered redacted exports", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    const diagnosticsPanel = screen.getByRole("tabpanel", { name: "Diagnostics" });
    expect(await within(diagnosticsPanel).findByRole("heading", { name: "Diagnostics" })).toBeInTheDocument();
    expect(within(diagnosticsPanel).getByText("twitch follow event-1")).toBeInTheDocument();
    expect(within(diagnosticsPanel).getByText("rule-1")).toBeInTheDocument();
    expect(within(diagnosticsPanel).getByText("queue-item-1")).toBeInTheDocument();
    expect(within(diagnosticsPanel).getByText("Twitch EventSub" )).toBeInTheDocument();

    await user.clear(within(diagnosticsPanel).getByLabelText("Diagnostics limit"));
    await user.type(within(diagnosticsPanel).getByLabelText("Diagnostics limit"), "2");
    await user.click(within(diagnosticsPanel).getByRole("button", { name: "Reload diagnostics" }));
    await user.click(within(diagnosticsPanel).getByRole("button", { name: "Export diagnostics" }));

    expect(managementApi.getDiagnostics).toHaveBeenLastCalledWith({ limit: 2 });
    expect(managementApi.exportDiagnostics).toHaveBeenCalledWith({ limit: 2 });
    expect(await within(diagnosticsPanel).findByText("Diagnostics export generated at 2026-05-31T02:05:00.000Z.")).toBeInTheDocument();
    expect(within(diagnosticsPanel).getByText("1 events, 1 matches, 1 playback rows, 1 provider errors exported.")).toBeInTheDocument();
  });

  it("shows Twitch connection status and delegates connect, refresh, and disconnect", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("tab", { name: "Twitch" }));
    const twitchPanel = screen.getByRole("tabpanel", { name: "Twitch" });
    expect(await within(twitchPanel).findByRole("heading", { name: "Twitch" })).toBeInTheDocument();
    expect(within(twitchPanel).getByText("Twitch disconnected")).toBeInTheDocument();
    expect(await within(twitchPanel).findByText("EventSub connected")).toBeInTheDocument();

    await user.click(within(twitchPanel).getByRole("button", { name: "Connect Twitch" }));

    expect(managementApi.startTwitchAuth).toHaveBeenCalledWith({
      redirectUri: "http://localhost:3000/twitch/auth/callback"
    });
    expect(await within(twitchPanel).findByRole("link", { name: "Open Twitch authorization" })).toHaveAttribute(
      "href",
      "https://id.twitch.tv/oauth2/authorize?state=state-1"
    );
  });

  it("refreshes and disconnects connected Twitch accounts", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi({ twitchConnected: true });
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("tab", { name: "Twitch" }));
    const twitchPanel = screen.getByRole("tabpanel", { name: "Twitch" });
    expect((await within(twitchPanel).findAllByText("Streamer")).length).toBeGreaterThan(0);

    await user.click(within(twitchPanel).getByRole("button", { name: "Refresh Twitch" }));
    await user.click(within(twitchPanel).getByRole("button", { name: "Disconnect Twitch" }));

    expect(managementApi.refreshTwitchAuth).toHaveBeenCalledOnce();
    expect(managementApi.disconnectTwitch).toHaveBeenCalledOnce();
  });

});

function createManagementApi(options: { readonly twitchConnected?: boolean } = {}): ManagementApi {
  const playback = {
    current: {
      id: "current-1",
      label: "Cheer alert",
      status: "playing" as const
    },
    queuedCount: 3,
    paused: true,
    muted: false,
    doNotDisturb: false,
    recent: [
      {
        id: "recent-1",
        label: "Recent follow",
        status: "completed" as const
      }
    ]
  };
  const twitchConnectedStatus = {
    connected: true as const,
    account: {
      accountId: "141981764",
      login: "streamer",
      displayName: "Streamer",
      scopes: ["bits:read"],
      connectedAt: "2026-05-30T12:00:00.000Z",
      updatedAt: "2026-05-30T12:00:00.000Z"
    }
  };
  const twitchDisconnectedStatus = {
    connected: false as const,
    account: null
  };
  const initialTwitchStatus = options.twitchConnected === true ? twitchConnectedStatus : twitchDisconnectedStatus;

  return {
    getDashboard: vi.fn(async () => ({
      twitch: {
        connected: false,
        label: "Twitch disconnected"
      },
      overlay: {
        connectedClientCount: 2,
        label: "2 overlay clients"
      },
      queue: {
        label: "Queue paused",
        queuedCount: 3
      },
      recentErrors: ["Last provider request failed"]
    })),
    getServerConfig: vi.fn(async () => ({
      host: "127.0.0.1",
      port: 39187
    })),
    updateServerConfig: vi.fn(async (input) => input),
    getModerationSettings: vi.fn(async () => ({
      renderedText: {
        maxLength: 240,
        blockedTerms: [],
        stripUrls: false
      },
      ttsText: {
        maxLength: 180,
        blockedTerms: [],
        stripUrls: true
      }
    })),
    updateModerationSettings: vi.fn(async (input) => input),
    listModules: vi.fn(async () => [
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
                {
                  id: "canvas.width",
                  label: "Canvas width",
                  type: "number" as const,
                  required: true
                },
                {
                  id: "canvas.height",
                  label: "Canvas height",
                  type: "number" as const,
                  required: true
                }
              ]
            }
          ]
        }
      }
    ]),
    setModuleEnabled: vi.fn(async (moduleId, enabled) => ({
      moduleId,
      enabled,
      config: {},
      updatedAt: "2026-05-30T12:00:00.000Z"
    })),
    saveModuleConfig: vi.fn(async (moduleId, input) => ({
      moduleId,
      enabled: input.enabled,
      config: input.config,
      updatedAt: "2026-05-30T12:00:00.000Z"
    })),
    listOverlayOutputs: vi.fn(async () => [
      {
        id: "alerts-test",
        label: "Alerts test",
        purpose: "test" as const,
        scope: "module" as const,
        moduleId: "alerts",
        overlayId: "default",
        enabled: true,
        keyId: "overlay-key-alerts-test",
        url: "http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_alerts_test",
        copyableUrlStatus: "available" as const
      },
      {
        id: "unified-live",
        label: "Unified live",
        purpose: "live" as const,
        scope: "unified" as const,
        moduleId: null,
        overlayId: "default",
        enabled: true,
        keyId: "overlay-key-unified-live",
        url: "http://127.0.0.1:39187/overlay/unified/live/ovl_unified_live",
        copyableUrlStatus: "available" as const
      }
    ]),
    listOverlayClients: vi.fn(async () => [
      {
        id: "client-live",
        overlayId: "default",
        purpose: "live" as const,
        scope: "module" as const,
        moduleId: "alerts",
        connectedAt: "2026-05-30T12:00:00.000Z",
        lastSeenAt: "2026-05-30T12:00:05.000Z",
        userAgent: "OBS"
      }
    ]),
    createOverlayOutputKey: vi.fn(async () => ({
      keyId: "overlay-key-created",
      url: "http://127.0.0.1:39187/overlay/unified/test/ovl_created",
      output: {
        id: "unified-test",
        label: "Unified test",
        purpose: "test" as const,
        scope: "unified" as const,
        moduleId: null,
        overlayId: "default",
        enabled: true,
        keyId: "overlay-key-created",
        url: "http://127.0.0.1:39187/overlay/unified/test/ovl_created",
        copyableUrlStatus: "available" as const
      }
    })),
    regenerateOverlayOutputKey: vi.fn(async () => ({
      keyId: "overlay-key-regenerated",
      url: "http://127.0.0.1:39187/overlay/unified/test/ovl_regenerated",
      output: {
        id: "unified-test",
        label: "Unified test",
        purpose: "test" as const,
        scope: "unified" as const,
        moduleId: null,
        overlayId: "default",
        enabled: true,
        keyId: "overlay-key-regenerated",
        url: "http://127.0.0.1:39187/overlay/unified/test/ovl_regenerated",
        copyableUrlStatus: "available" as const
      }
    })),
    revokeOverlayOutputKey: vi.fn(async () => undefined),
    getPlayback: vi.fn(async () => playback),
    pausePlayback: vi.fn(async () => playback),
    resumePlayback: vi.fn(async () => playback),
    skipPlayback: vi.fn(async () => playback),
    replayRecent: vi.fn(async () => playback),
    mutePlayback: vi.fn(async () => playback),
    unmutePlayback: vi.fn(async () => playback),
    setDoNotDisturb: vi.fn(async () => ({ ...playback, doNotDisturb: true })),
    listTtsProviders: vi.fn(async () => [
      {
        id: "browser-speech",
        label: "Browser Speech",
        capabilities: {
          supportsVoices: false,
          supportsRate: true,
          supportsPitch: true,
          supportsVolume: true,
          playbackMode: "browser-speech" as const
        },
        voices: []
      }
    ]),
    testTts: vi.fn(async (input) => ({
      instruction: {
        mode: "browser-speech" as const,
        text: input.text,
        audioAssetId: null,
        providerPayload: {
          providerId: input.providerId
        }
      },
      moderationActions: []
    })),
    getDiagnostics: vi.fn(async () => ({
      eventLogs: [
        {
          id: "event-log-1",
          eventId: "event-1",
          providerId: "twitch",
          eventType: "follow",
          actorDisplayName: "Viewer",
          status: "processed" as const,
          receivedAt: "2026-05-31T02:00:00.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1",
          errorMessage: null
        }
      ],
      alertMatchLogs: [
        {
          id: "match-log-1",
          sourceEventId: "event-1",
          ruleId: "rule-1",
          variantId: "variant-1",
          matchedAt: "2026-05-31T02:00:01.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1"
        }
      ],
      playbackLogs: [
        {
          id: "playback-log-1",
          queueItemId: "queue-item-1",
          sourceEventId: "event-1",
          alertIds: ["resolved-alert-1"],
          status: "queued" as const,
          occurredAt: "2026-05-31T02:00:02.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1",
          message: null
        }
      ],
      providerErrors: [
        {
          id: "provider-status:twitch",
          providerId: "twitch",
          label: "Twitch EventSub",
          occurredAt: "2026-05-31T02:00:03.000Z",
          message: "Reconnect failed",
          correlationId: null,
          processingId: null
        }
      ],
      runtimeLogging: null
    })),
    exportDiagnostics: vi.fn(async () => ({
      generatedAt: "2026-05-31T02:05:00.000Z",
      debugExport: false as const,
      rawEventLogs: [],
      eventLogs: [
        {
          id: "event-log-1",
          eventId: "event-1",
          providerId: "twitch",
          eventType: "follow",
          actorDisplayName: "Viewer",
          status: "processed" as const,
          receivedAt: "2026-05-31T02:00:00.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1",
          errorMessage: null
        }
      ],
      alertMatchLogs: [
        {
          id: "match-log-1",
          sourceEventId: "event-1",
          ruleId: "rule-1",
          variantId: "variant-1",
          matchedAt: "2026-05-31T02:00:01.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1"
        }
      ],
      playbackLogs: [
        {
          id: "playback-log-1",
          queueItemId: "queue-item-1",
          sourceEventId: "event-1",
          alertIds: ["resolved-alert-1"],
          status: "queued" as const,
          occurredAt: "2026-05-31T02:00:02.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1",
          message: null
        }
      ],
      providerErrors: [
        {
          id: "provider-status:twitch",
          providerId: "twitch",
          label: "Twitch EventSub",
          occurredAt: "2026-05-31T02:00:03.000Z",
          message: "Reconnect failed",
          correlationId: null,
          processingId: null
        }
      ],
      runtimeLogging: null
    })),
    exportDebugDiagnostics: vi.fn(async () => ({
      generatedAt: "2026-05-31T02:05:00.000Z",
      debugExport: true as const,
      rawEventLogs: [],
      eventLogs: [],
      alertMatchLogs: [],
      playbackLogs: [],
      providerErrors: [],
      runtimeLogging: null,
      runtimeLogEntries: [],
      runtimeLogTruncated: false
    })),
    getTwitchStatus: vi.fn(async () => initialTwitchStatus),
    getTwitchEventSubStatus: vi.fn(async () => ({
      state: "connected" as const,
      connectionState: "connected" as const,
      sessionId: "session-1",
      connectedAt: "2026-05-30T11:59:59.000Z",
      lastMessageAt: "2026-05-30T12:00:00.000Z",
      subscriptionTypes: ["channel.follow"],
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      lastErrorAt: null,
      message: null
    })),
    startTwitchAuth: vi.fn(async () => ({
      authorizationUrl: "https://id.twitch.tv/oauth2/authorize?state=state-1",
      state: "state-1",
      scopes: ["bits:read"]
    })),
    refreshTwitchAuth: vi.fn(async () => twitchConnectedStatus),
    disconnectTwitch: vi.fn(async () => twitchDisconnectedStatus)
  };
}

function createAssetApi(): AssetApi {
  return {
    async listAssets(): Promise<readonly AssetRecord[]> {
      return [];
    },
    async importAsset(): Promise<AssetRecord> {
      throw new Error("not called");
    }
  };
}

function createAlertApi() {
  return {
    async listCollections(): Promise<readonly AlertCollection[]> {
      return [];
    },
    async listRules(): Promise<readonly AlertRule[]> {
      return [];
    },
    async createCollection(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async createRule(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async setCollectionEnabled(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async setRuleEnabled(): Promise<AlertRule> {
      throw new Error("not called");
    }
  };
}
