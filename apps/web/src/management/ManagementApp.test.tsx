import type { AlertCollection, AlertRule } from "./modules/alerts/alert-api.js";
import type { AssetRecord } from "./assets/asset-api.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagnosticsWorkspaceView } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagementApp } from "./ManagementApp.js";
import type { AssetApi } from "./assets/AssetManager.js";
import type { ManagementApi } from "./management-api.js";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("ManagementApp", () => {
  it("uses stable sidebar links and nested Modules navigation", async () => {
    const user = userEvent.setup();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("link", { name: "Modules" }));

    expect(window.location.pathname).toBe("/modules/alerts");
    expect(screen.getByRole("link", { name: "Modules" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Alerts" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("ModulesAlerts");
  });

  it("uses the focused editor route and restores the management shell on recovery", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/modules/alerts/editor/alert-follow?set=set-default&profile=vertical");
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(await screen.findByText("The alert editor could not be opened")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to alerts" }));

    expect(window.location.pathname).toBe("/modules/alerts");
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Alerts" })).toBeInTheDocument();
  });

  it("guards dirty settings when navigating and allows discard", async () => {
    const user = userEvent.setup();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    await user.click(screen.getByRole("link", { name: "Settings" }));
    const host = await screen.findByLabelText("Host");
    await user.clear(host);
    await user.type(host, "localhost");
    await user.click(screen.getByRole("link", { name: "Assets" }));

    expect(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/settings");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.location.pathname).toBe("/assets");
  });

  it("renders setup-focused Home and keeps legacy copyable overlay URLs reachable", async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWrite
      }
    });
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(await screen.findByRole("heading", { name: "Setup readiness" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add event source" })).toHaveAttribute("href", "/event-sources?setup=add");
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(screen.queryByText("Last provider request failed")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Overlay outputs" }));
    const overlayPanel = screen.getByRole("region", { name: "Overlay outputs content" });
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

    await user.click(screen.getByRole("link", { name: "Module setup" }));
    const modulesPanel = screen.getByRole("region", { name: "Module setup content" });
    expect(await within(modulesPanel).findByRole("heading", { name: "Overlay Modules" })).toBeInTheDocument();
    expect(within(modulesPanel).getByText("Alerts")).toBeInTheDocument();
    expect(within(modulesPanel).getByLabelText("Alerts enabled")).toBeChecked();
    expect(within(modulesPanel).getByText("Canvas width")).toBeInTheDocument();
    expect(within(modulesPanel).getByText("Canvas height")).toBeInTheDocument();
    expect(within(modulesPanel).queryByText("Collections")).not.toBeInTheDocument();
    expect(within(modulesPanel).queryByText("Alert rules")).not.toBeInTheDocument();
    expect(within(modulesPanel).queryByText("Variants")).not.toBeInTheDocument();

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

    await user.click(screen.getByRole("link", { name: "Settings" }));
    const settingsPanel = screen.getByRole("region", { name: "Settings content" });
    await user.clear(within(settingsPanel).getByLabelText("Port"));
    await user.type(within(settingsPanel).getByLabelText("Port"), "40123");
    await user.click(within(settingsPanel).getByRole("button", { name: "Save server settings" }));

    expect(managementApi.updateServerConfig).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 40123
    });

    await user.click(screen.getByRole("link", { name: "Playback controls" }));
    const playbackPanel = screen.getByRole("region", { name: "Playback controls content" });
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

  it("shows registered TTS safety controls and runs the fixed safe voice test", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "TTS providers" }));
    const ttsPanel = screen.getByRole("region", { name: "TTS providers content" });
    expect(await within(ttsPanel).findByRole("heading", { name: "TTS providers" })).toBeInTheDocument();
    expect((await within(ttsPanel).findAllByText("Browser Speech")).length).toBeGreaterThan(0);
    expect(within(ttsPanel).getByRole("heading", { name: "Safety defaults" })).toBeInTheDocument();
    expect(within(ttsPanel).getByLabelText("Default voice")).toBeInTheDocument();

    await user.click(within(ttsPanel).getByRole("button", { name: "Test voice" }));

    expect(managementApi.testProviderVoice).toHaveBeenCalledWith("provider-browser-speech");
    expect(await within(ttsPanel).findByText("Voice test delivered.")).toBeInTheDocument();
  });
  it("shows the diagnostics workspace and delegates bounded redacted exports", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Diagnostics" }));
    const diagnosticsPanel = screen.getByRole("region", { name: "Diagnostics content" });
    expect(await within(diagnosticsPanel).findByRole("heading", { name: "Diagnostics workspace" })).toBeInTheDocument();
    expect(within(diagnosticsPanel).getByRole("button", { name: /Event source disconnected/ })).toBeInTheDocument();
    await user.type(within(diagnosticsPanel).getByPlaceholderText("Reference ID or message"), "ref-provider-1");
    expect(within(diagnosticsPanel).getByRole("link", { name: "Open event sources" })).toHaveAttribute(
      "href",
      "/event-sources?diagnostic=ref-provider-1"
    );

    await user.clear(within(diagnosticsPanel).getByPlaceholderText("Reference ID or message"));
    await user.click(within(diagnosticsPanel).getByRole("tab", { name: /Events/ }));
    expect(within(diagnosticsPanel).getByRole("button", { name: "follow" })).toBeInTheDocument();
    await user.click(within(diagnosticsPanel).getByRole("button", { name: "Export support bundle" }));

    expect(managementApi.getDiagnosticsWorkspace).toHaveBeenCalledOnce();
    expect(managementApi.exportDiagnostics).toHaveBeenCalledWith({ limit: 200 });
    expect(await within(diagnosticsPanel).findByText("Sanitized support bundle ready")).toBeInTheDocument();
  });

  it("shows connection and intake separately and registers only after validation", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Event sources" }));
    const twitchPanel = screen.getByRole("region", { name: "Event sources content" });
    expect(await within(twitchPanel).findByRole("heading", { name: "Event sources" })).toBeInTheDocument();
    expect((await within(twitchPanel).findAllByText("Main Twitch")).length).toBeGreaterThan(0);
    expect(within(twitchPanel).getByRole("columnheader", { name: "Connection" })).toBeInTheDocument();
    expect(within(twitchPanel).getByRole("columnheader", { name: "Intake" })).toBeInTheDocument();

    await user.click(within(twitchPanel).getByRole("button", { name: "Add event source" }));
    const dialog = screen.getByRole("dialog", { name: "Add event source" });
    expect(within(dialog).getByRole("button", { name: "Register provider" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Test connection" }));
    expect(await within(dialog).findByText("Connection test passed.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Register provider" }));

    expect(managementApi.validateProvider).toHaveBeenCalledOnce();
    expect(managementApi.registerProvider).toHaveBeenCalledOnce();
  });

  it("activates an inactive event source after showing its impact", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi({ twitchConnected: true });
    render(<ManagementApp alertApi={createAlertApi()} assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Event sources" }));
    const twitchPanel = screen.getByRole("region", { name: "Event sources content" });
    await user.click(await within(twitchPanel).findByRole("button", { name: "View Studio Streamer.bot" }));
    expect(await within(twitchPanel).findByRole("heading", { name: "Activation impact" })).toBeInTheDocument();
    await user.click(within(twitchPanel).getByRole("button", { name: "Set active" }));

    expect(managementApi.activateProvider).toHaveBeenCalledWith("provider-streamerbot", false);
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
  const eventProviders = [
    {
      id: "provider-twitch",
      name: "Main Twitch",
      kind: "twitch" as const,
      capability: "event-source" as const,
      active: true,
      connectionState: "connected" as const,
      intakeState: "active" as const,
      validatedAt: "2026-07-15T05:00:00.000Z",
      error: null,
      usedByAlertCount: 6
    },
    {
      id: "provider-streamerbot",
      name: "Studio Streamer.bot",
      kind: "streamerbot" as const,
      capability: "event-source" as const,
      active: false,
      connectionState: "connected" as const,
      intakeState: "inactive" as const,
      validatedAt: "2026-07-15T05:00:00.000Z",
      error: null,
      usedByAlertCount: 0
    }
  ];
  const ttsProvider = {
    id: "provider-browser-speech",
    name: "Browser Speech",
    kind: "browser-speech" as const,
    capability: "tts" as const,
    active: true,
    connectionState: "connected" as const,
    intakeState: null,
    validatedAt: "2026-07-15T05:00:00.000Z",
    error: null,
    usedByAlertCount: 2
  };
  const ttsSafety = {
    defaultVoiceId: null,
    volume: 1,
    minimumRate: 0.5,
    maximumRate: 2,
    maximumTextLength: 240
  };

  return {
    getHomeSetupSummary: vi.fn(async () => ({
      readiness: [
        {
          id: "event-source",
          label: "Event source",
          state: "action-required" as const,
          actionLabel: "Add event source",
          actionRoute: "/event-sources?setup=add"
        }
      ],
      activeAlertSet: null,
      actionableProblems: []
    })),
    listRegisteredProviders: vi.fn(async (capability) => capability === "event-source" ? eventProviders : [ttsProvider]),
    validateProvider: vi.fn(async (input) => ({
      valid: true,
      connectionState: "connected" as const,
      intakeState: input.kind === "twitch" || input.kind === "streamerbot" ? "inactive" as const : null,
      validatedAt: "2026-07-15T05:00:00.000Z",
      availableVoices: [],
      error: null
    })),
    registerProvider: vi.fn(async (input) => ({
      status: "registered" as const,
      provider: {
        provider: {
          id: "provider-registered",
          name: input.name,
          kind: input.kind,
          capability: input.kind === "twitch" || input.kind === "streamerbot" ? "event-source" as const : "tts" as const,
          active: false,
          connectionState: "connected" as const,
          intakeState: input.kind === "twitch" || input.kind === "streamerbot" ? "inactive" as const : null,
          validatedAt: "2026-07-15T05:00:00.000Z",
          error: null,
          usedByAlertCount: 0
        },
        configuration: input.configuration,
        availableVoices: [],
        ttsSafety: input.kind === "speakerbot" || input.kind === "browser-speech" ? ttsSafety : null
      },
      validation: {
        valid: true,
        connectionState: "connected" as const,
        intakeState: input.kind === "twitch" || input.kind === "streamerbot" ? "inactive" as const : null,
        validatedAt: "2026-07-15T05:00:00.000Z",
        availableVoices: [],
        error: null
      }
    })),
    getProvider: vi.fn(async (providerId) => {
      if (providerId === ttsProvider.id) {
        return { provider: ttsProvider, configuration: {}, availableVoices: [], ttsSafety };
      }
      const provider = eventProviders.find((candidate) => candidate.id === providerId) ?? eventProviders[0]!;
      return {
        provider,
        configuration: provider.kind === "streamerbot"
          ? { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
          : {},
        availableVoices: [],
        ttsSafety: null
      };
    }),
    activateProvider: vi.fn(async (providerId) => ({
      provider: { ...(eventProviders.find((provider) => provider.id === providerId) ?? eventProviders[0]!), active: true },
      replacedProviderId: "provider-twitch",
      impact: { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] }
    })),
    getProviderActivationImpact: vi.fn(async () => ({
      matchedAlertCount: 0,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: []
    })),
    getTtsProviderSafetySettings: vi.fn(async () => ({
      ...ttsSafety
    })),
    updateTtsSafety: vi.fn(async (_providerId, input) => input),
    testProviderVoice: vi.fn(async () => ({ delivered: true, error: null })),
    listAlertSets: vi.fn(async () => []),
    getAlertSet: vi.fn(async () => {
      throw new Error("not called");
    }),
    createAlertSet: vi.fn(async () => {
      throw new Error("not called");
    }),
    renameAlertSet: vi.fn(async () => {
      throw new Error("not called");
    }),
    duplicateAlertSet: vi.fn(async () => {
      throw new Error("not called");
    }),
    getAlertSetActivationImpact: vi.fn(async () => ({
      currentActiveSetId: null,
      replacingActiveSetName: null,
      enabledAlertCount: 0,
      affectedTargetProfileIds: [],
      affectedEventTypes: [],
      blockers: [],
      warnings: []
    })),
    activateAlertSet: vi.fn(async () => {
      throw new Error("not called");
    }),
    markStarterAlertSetReviewComplete: vi.fn(async () => {
      throw new Error("not called");
    }),
    setManagedAlertEnabled: vi.fn(async () => {
      throw new Error("not called");
    }),
    deleteAlertSet: vi.fn(async () => undefined),
    getAlertEditorDocument: vi.fn(async () => {
      throw new Error("not called");
    }),
    saveAlertEditorDocument: vi.fn(async (_alertId, document) => document),
    sendAlertEditorTest: vi.fn(async (_alertId, request) => ({
      status: "queued" as const,
      targetProfileId: request.targetProfileId,
      referenceId: "ref-test",
      test: true as const
    })),
    listAssetLibraryItems: vi.fn(async () => []),
    updateAssetMetadata: vi.fn(async () => {
      throw new Error("not called");
    }),
    getAssetChangeImpact: vi.fn(async () => {
      throw new Error("not called");
    }),
    deleteAsset: vi.fn(async () => undefined),
    getDiagnosticsWorkspace: vi.fn(async () => diagnosticsWorkspace()),
    getConfigurationBackupSummary: vi.fn(async () => ({
      state: "ready" as const,
      appVersion: "0.0.0",
      schemaVersion: 4,
      configurationRecordCount: 0,
      assetCount: 0,
      totalAssetBytes: 0,
      secretExclusions: ["Provider credentials", "Overlay route keys"],
      blockers: []
    })),
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
    },
    async getAssetFile(): Promise<Blob> {
      throw new Error("not called");
    },
    async replaceAsset(): Promise<AssetRecord> {
      throw new Error("not called");
    }
  };
}

function diagnosticsWorkspace(): DiagnosticsWorkspaceView {
  return {
    problems: [
      {
        id: "problem-provider",
        area: "providers",
        summary: "Event source disconnected",
        cause: "Twitch EventSub disconnected.",
        nextStep: "Reconnect the active event source.",
        severity: "error",
        occurredAt: "2026-05-31T02:00:00.000Z",
        referenceId: "ref-provider-1",
        correction: { label: "Open event sources", route: "/event-sources?diagnostic=ref-provider-1" }
      }
    ],
    events: [
      {
        id: "event-1",
        providerId: "twitch",
        providerKind: "twitch",
        eventType: "follow",
        occurredAt: "2026-05-31T01:59:59.000Z",
        outcome: "processed",
        test: false,
        referenceId: "ref-event-1",
        processingId: "processing-1",
        actorDisplayName: "Viewer",
        alertIds: ["alert-follow"],
        matchedRuleIds: ["rule-1"],
        playbackStatus: "completed",
        errorMessage: null,
        sanitizedPayload: { userName: "Viewer" },
        correction: { label: "Open alert", route: "/modules/alerts/editor/alert-follow?diagnostic=ref-event-1" }
      }
    ],
    rawLogs: []
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
    async updateCollection(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async deleteCollection(): Promise<void> {
      throw new Error("not called");
    },
    async createRule(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async updateRule(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async deleteRule(): Promise<void> {
      throw new Error("not called");
    },
    async deleteVariant(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async setCollectionEnabled(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async setRuleEnabled(): Promise<AlertRule> {
      throw new Error("not called");
    },
    async testAlert() {
      throw new Error("not called");
    }
  };
}
