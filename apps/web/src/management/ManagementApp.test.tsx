import type { AssetRecord } from "./assets/asset-api.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssetLibraryItem, DiagnosticsWorkspaceView } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagementApp } from "./ManagementApp.js";
import type { AssetApi } from "./assets/AssetManager.js";
import type { ManagementApi } from "./management-api.js";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/manage");
});

describe("ManagementApp", () => {
  it("uses stable sidebar links and nested Modules navigation", async () => {
    const user = userEvent.setup();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("navigation", { name: "Legacy tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Module setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Playback controls" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modules" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Alerts" }));

    expect(window.location.pathname).toBe("/manage/modules/alerts");
    expect(screen.getByRole("link", { name: "Alerts" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("ModulesAlerts");
  });

  it("returns former legacy routes to Home", async () => {
    window.history.replaceState(null, "", "/legacy/playback");
    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(await screen.findByRole("heading", { name: "Setup readiness" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  it("uses the focused editor route and restores the management shell on recovery", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/manage/modules/alerts/editor/alert-follow?set=set-default&profile=vertical");
    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(await screen.findByText("The alert editor could not be opened")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to alerts" }));

    expect(`${window.location.pathname}${window.location.search}`).toBe("/manage/modules/alerts?set=set-default");
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Alerts" })).toBeInTheDocument();
  });

  it("guards dirty settings when navigating and allows discard", async () => {
    const user = userEvent.setup();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    await user.click(screen.getByRole("link", { name: "Settings" }));
    const port = await screen.findByLabelText("Port");
    await user.clear(port);
    await user.type(port, "7161");
    await user.click(screen.getByRole("link", { name: "Assets" }));

    expect(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/manage/settings");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.location.pathname).toBe("/manage/assets");
  });

  it("guards unsaved TTS safety settings when navigating", async () => {
    const user = userEvent.setup();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    await user.click(screen.getByRole("link", { name: "TTS providers" }));
    const ttsPanel = screen.getByRole("region", { name: "TTS providers content" });
    const volume = await within(ttsPanel).findByLabelText("Volume");
    await user.clear(volume);
    await user.type(volume, "0.5");
    await user.click(screen.getByRole("link", { name: "Assets" }));

    expect(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).toHaveTextContent(
      "TTS safety settings have unsaved changes."
    );
    expect(window.location.pathname).toBe("/manage/tts-providers");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.location.pathname).toBe("/manage/assets");
  });

  it("guards unsaved asset metadata when navigating", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    vi.mocked(managementApi.listAssetLibraryItems).mockResolvedValue([assetLibraryItem]);
    vi.mocked(managementApi.updateAssetMetadata).mockImplementation(async (_assetId, input) => ({
      ...assetLibraryItem,
      displayName: input.displayName,
      tags: input.tags
    }));
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Assets" }));
    const details = await screen.findByRole("region", { name: "Follower burst details" });
    const displayName = within(details).getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Updated follower burst");
    await user.click(screen.getByRole("link", { name: "Home" }));

    expect(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).toHaveTextContent(
      "Asset details have unsaved changes."
    );
    expect(window.location.pathname).toBe("/manage/assets");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.location.pathname).toBe("/manage");
  });

  it("guards unsaved asset metadata when following an internal usage link", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    vi.mocked(managementApi.listAssetLibraryItems).mockResolvedValue([assetLibraryItemWithUsage]);
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Assets" }));
    const details = await screen.findByRole("region", { name: "Follower burst details" });
    const displayName = within(details).getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Updated follower burst");
    await user.click(within(details).getByRole("link", { name: "Follower alert" }));

    expect(screen.getByRole("dialog", { name: "Leave with unsaved changes?" })).toHaveTextContent(
      "Asset details have unsaved changes."
    );
    expect(window.location.pathname).toBe("/manage/assets");
  });

  it.each([
    ["modified click", { ctrlKey: true }, {}],
    ["new window", {}, { target: "_blank" }],
    ["download", {}, { download: "asset.txt" }],
    ["external origin", {}, { href: "https://example.com/manage" }]
  ])("preserves native behavior for a raw internal link: %s", async (_label, eventInit, attributes) => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    vi.mocked(managementApi.listAssetLibraryItems).mockResolvedValue([assetLibraryItemWithUsage]);
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Assets" }));
    const details = await screen.findByRole("region", { name: "Follower burst details" });
    const displayName = within(details).getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Updated follower burst");
    const link = within(details).getByRole("link", { name: "Follower alert" });
    Object.entries(attributes).forEach(([name, value]) => link.setAttribute(name, value));
    link.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(link, eventInit);

    expect(screen.queryByRole("dialog", { name: "Leave with unsaved changes?" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/manage/assets");
  });

  it("prefills diagnostics from route context", async () => {
    window.history.replaceState(null, "", "/manage/diagnostics?reference=ref-provider-1");
    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(await screen.findByPlaceholderText("Reference ID or message")).toHaveValue("ref-provider-1");
  });

  it.each([
    "/manage/event-sources?diagnostic=ref-alerts",
    "/manage/tts-providers?diagnostic=ref-alerts",
    "/manage/modules/alerts?diagnostic=ref-alerts",
    "/manage/modules/alerts/editor/alert-follow?diagnostic=ref-alerts",
    "/manage/assets?diagnostic=ref-alerts",
    "/manage/settings?diagnostic=ref-alerts"
  ])("shows diagnostic reference context on correction route %s", (route) => {
    window.history.replaceState(null, "", route);

    render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

    expect(screen.getByRole("status", { name: "Diagnostics context" })).toHaveTextContent("ref-alerts");
  });

  it("updates server settings without exposing runtime playback controls", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Settings" }));
    const settingsPanel = screen.getByRole("region", { name: "Settings content" });
    await user.clear(within(settingsPanel).getByLabelText("Port"));
    await user.type(within(settingsPanel).getByLabelText("Port"), "40123");
    await user.click(within(settingsPanel).getByRole("button", { name: "Save server settings" }));

    expect(managementApi.updateServerConfig).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 40123
    });
    expect(screen.queryByRole("link", { name: "Playback controls" })).not.toBeInTheDocument();
  });

  it("shows registered TTS safety controls and runs the fixed safe voice test", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "TTS providers" }));
    const ttsPanel = screen.getByRole("region", { name: "TTS providers content" });
    expect((await within(ttsPanel).findAllByText("Browser Speech")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "TTS providers" })).toHaveLength(1);
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
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Diagnostics" }));
    const diagnosticsPanel = screen.getByRole("region", { name: "Diagnostics content" });
    expect(await within(diagnosticsPanel).findByText(/Failures remain visible with plain-language next steps/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Diagnostics" })).toHaveLength(1);
    expect(within(diagnosticsPanel).getByRole("button", { name: /Event source disconnected/ })).toBeInTheDocument();
    await user.type(within(diagnosticsPanel).getByPlaceholderText("Reference ID or message"), "ref-provider-1");
    expect(within(diagnosticsPanel).getByRole("link", { name: "Open event sources" })).toHaveAttribute(
      "href",
      "/manage/event-sources?diagnostic=ref-provider-1"
    );

    await user.clear(within(diagnosticsPanel).getByPlaceholderText("Reference ID or message"));
    await user.click(within(diagnosticsPanel).getByRole("tab", { name: /Events/ }));
    expect(within(diagnosticsPanel).getByRole("button", { name: "follow" })).toBeInTheDocument();
    await user.click(within(diagnosticsPanel).getByRole("button", { name: "Export support bundle" }));

    expect(managementApi.getDiagnosticsWorkspace).toHaveBeenCalledOnce();
    expect(managementApi.exportDiagnostics).toHaveBeenCalledWith({ limit: 200 });
    expect(await within(diagnosticsPanel).findByText("Sanitized support bundle ready")).toBeInTheDocument();
  });

  it("shows usage and live status separately and registers only after validation", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Event sources" }));
    const twitchPanel = screen.getByRole("region", { name: "Event sources content" });
    expect((await within(twitchPanel).findAllByText("Main Twitch")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Event sources" })).toHaveLength(1);
    expect(within(twitchPanel).getByRole("columnheader", { name: "Usage" })).toBeInTheDocument();
    expect(within(twitchPanel).getByRole("columnheader", { name: "Live status" })).toBeInTheDocument();

    await user.click(within(twitchPanel).getByRole("button", { name: "Add event source" }));
    const dialog = screen.getByRole("dialog", { name: "Add event source" });
    await user.selectOptions(within(dialog).getByLabelText("Provider type"), "streamerbot");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(within(dialog).queryByRole("button", { name: "Register event source" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Test connection" }));
    expect(await within(dialog).findByText("Connection test passed.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Register event source" }));

    expect(managementApi.validateProvider).toHaveBeenCalledOnce();
    expect(managementApi.registerProvider).toHaveBeenCalledOnce();
  });

  it("activates an inactive event source after showing its impact", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    render(<ManagementApp assetApi={createAssetApi()} managementApi={managementApi} />);

    await user.click(screen.getByRole("link", { name: "Event sources" }));
    const twitchPanel = screen.getByRole("region", { name: "Event sources content" });
    await user.click(await within(twitchPanel).findByRole("button", { name: "Activate Studio Streamer.bot" }));
    const dialog = await within(twitchPanel).findByRole("dialog", { name: "Activate Studio Streamer.bot?" });
    await user.click(within(dialog).getByRole("button", { name: "Activate event source" }));

    expect(managementApi.activateProvider).toHaveBeenCalledWith("provider-streamerbot", true);
  });

});

function createManagementApi(): ManagementApi {
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
          actionRoute: "/manage/event-sources?setup=add"
        }
      ],
      activeAlertSet: null,
      actionableProblems: []
    })),
    getTwitchStatus: vi.fn(async () => ({ connected: false as const, authorizationState: "disconnected" as const, missingScopes: [], account: null })),
    startTwitchAuth: vi.fn(async () => {
      throw new Error("not called");
    }),
    pollTwitchAuth: vi.fn(async () => {
      throw new Error("not called");
    }),
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
    deactivateProvider: vi.fn(async (providerId) => ({
      ...(eventProviders.find((provider) => provider.id === providerId) ?? eventProviders[0]!),
      active: false,
      intakeState: "inactive" as const
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
    createAlert: vi.fn(async () => {
      throw new Error("not called");
    }),
    createAlertVariation: vi.fn(async () => {
      throw new Error("not called");
    }),
    duplicateManagedAlert: vi.fn(async () => {
      throw new Error("not called");
    }),
    resetManagedAlert: vi.fn(async () => {
      throw new Error("not called");
    }),
    deleteManagedAlert: vi.fn(async () => undefined),
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
      dataDirectory: "C:/Users/James/.stream-jams/data",
      assetDirectory: "C:/Users/James/.stream-jams/assets",
      logLevel: "INFO" as const,
      logRetentionHours: 48,
      secretExclusions: ["Provider credentials", "Overlay route keys"],
      blockers: []
    })),
    exportConfigurationBackup: vi.fn(async () => { throw new Error("not called"); }),
    preflightConfigurationRestore: vi.fn(async () => { throw new Error("not called"); }),
    restoreConfiguration: vi.fn(async () => { throw new Error("not called"); }),
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
    openDataFolder: vi.fn(async () => ({ dataDirectory: "C:/Users/James/.stream-jams/data" })),
    clearOldLogs: vi.fn(async () => ({ deletedCount: 0 })),
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
    }))
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
      return new Blob([new Uint8Array([0])], { type: "image/png" });
    },
    async replaceAsset(): Promise<AssetRecord> {
      throw new Error("not called");
    }
  };
}

const assetLibraryItem: AssetLibraryItem = {
  id: "asset-image",
  displayName: "Follower burst",
  originalFileName: "follow.png",
  mediaType: "image",
  mimeType: "image/png",
  sizeBytes: 1024,
  width: 640,
  height: 360,
  durationMs: null,
  health: "available",
  tags: ["seasonal"],
  createdAt: "2026-07-15T08:00:00.000Z",
  updatedAt: "2026-07-15T08:00:00.000Z",
  usage: { assetId: "asset-image", totalUsageCount: 0, usages: [] }
};

const assetLibraryItemWithUsage: AssetLibraryItem = {
  ...assetLibraryItem,
  usage: {
    assetId: assetLibraryItem.id,
    totalUsageCount: 1,
    usages: [{
      setId: "set-default",
      setName: "General Alerts",
      eventType: "follow",
      alertId: "alert-follow",
      alertName: "Follower alert",
      targetProfileIds: ["landscape"]
    }]
  }
};

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
        correction: { label: "Open event sources", route: "/manage/event-sources?diagnostic=ref-provider-1" }
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
        correction: { label: "Open alert", route: "/manage/modules/alerts/editor/alert-follow?diagnostic=ref-event-1" }
      }
    ],
    rawLogs: []
  };
}
