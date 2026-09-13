import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  configurationBackupLimits,
  type ConfigurationBackupArchive,
  type ConfigurationRestorePreflight
} from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioApi } from "../audio/audio-api.js";
import type { ManagementApi } from "../management-api.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../navigation/dirty-navigation.js";
import { SettingsPanel } from "./SettingsPanel.js";
import type { SurfaceSettingsApi } from "./overlay-surfaces-api.js";

vi.mock("./overlay-surfaces-api.js", () => ({ defaultSurfaceSettingsApi: {
  load: async () => ({ surfaces: [], desktop: { available: false, displays: [], state: "unavailable", message: null } }),
  save: vi.fn(), retry: vi.fn()
} }));

describe("SettingsPanel", () => {
  afterEach(() => cleanup());

  it("saves both server and surface drafts through the shared navigation guard", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    const value = { surfaces: [{ id: "unified-browser:default", kind: "unified-browser" as const, overlayId: "default", layers: [{ moduleId: "alerts", visible: true }] }], desktop: { available: false, displays: [], state: "unavailable" as const, message: null } };
    const surfaceApi: SurfaceSettingsApi = { load: async () => value, save: vi.fn(async surface => ({ ...value, surfaces: [surface] })), retry: vi.fn() };
    window.history.replaceState(null, "", "/manage/settings");
    render(<DirtyNavigationProvider><SettingsNavigationHarness audioApi={createAudioApi()} managementApi={managementApi} surfaceApi={surfaceApi} /></DirtyNavigationProvider>);
    await user.click(await screen.findByRole("checkbox", { name: "Show alerts on Unified browser: default" }));
    const port = screen.getByLabelText("Port");
    await user.clear(port); await user.type(port, "40123");
    await user.click(screen.getByRole("button", { name: "Go home" }));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));
    await waitFor(() => expect(window.location.pathname).toBe("/manage"));
    expect(managementApi.updateServerConfig).toHaveBeenCalledWith({ host: "127.0.0.1", port: 40123 });
    expect(surfaceApi.save).toHaveBeenCalledWith(expect.objectContaining({ layers: [{ moduleId: "alerts", visible: false }] }));
  });

  it("saves the desktop opt-out explicitly and does not show it in CLI mode", async () => {
    const managementApi = createManagementApi({ getDesktopConfig: async () => ({ available: true, closeToTray: true }) });
    const view = render(<SettingsPanel managementApi={managementApi} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Close window to tray" }));
    expect(managementApi.updateDesktopConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save desktop settings" }));
    expect(await screen.findByText("Desktop settings saved.")).toBeVisible();
    expect(managementApi.updateDesktopConfig).toHaveBeenCalledWith({ closeToTray: false });
    expect(screen.getByRole("checkbox", { name: "Close window to tray" })).not.toBeChecked();
    view.unmount();
    render(<SettingsPanel managementApi={createManagementApi()} />);
    await screen.findByLabelText("Port");
    expect(screen.queryByRole("checkbox", { name: "Close window to tray" })).not.toBeInTheDocument();
  });

  it("keeps the desktop draft recoverable when saving fails", async () => {
    render(<SettingsPanel managementApi={createManagementApi({
      getDesktopConfig: async () => ({ available: true, closeToTray: true }),
      updateDesktopConfig: async () => { throw new Error("Disk is read-only"); }
    })} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Close window to tray" }));
    await userEvent.click(screen.getByRole("button", { name: "Save desktop settings" }));
    expect(await screen.findByText("Disk is read-only")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save desktop settings" })).toBeEnabled();
  });

  it("shows global preferences, storage, logging, and compatibility information", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();

    render(<SettingsPanel managementApi={managementApi} />);

    const panel = await screen.findByRole("region", { name: "Settings" });
    expect(await within(panel).findByText("C:/Users/James/.stream-jams/data")).toBeVisible();
    expect(within(panel).getByText(/Schema 9/)).toBeVisible();
    expect(within(panel).getByRole("group", { name: "Theme" })).toBeVisible();
    expect(within(panel).queryByText("Moderation")).not.toBeInTheDocument();

    const port = within(panel).getByLabelText("Port");
    await user.clear(port);
    await user.type(port, "40123");
    await user.click(within(panel).getByRole("button", { name: "Save server settings" }));
    expect(managementApi.updateServerConfig).toHaveBeenCalledWith({ host: "127.0.0.1", port: 40123 });
  });

  it("shows only retry when the initial settings load fails", async () => {
    const user = userEvent.setup();
    const getServerConfig = vi.fn()
      .mockRejectedValueOnce(new Error("Local service unavailable"))
      .mockResolvedValue({ host: "127.0.0.1", port: 39187 });
    const managementApi = createManagementApi({ getServerConfig });

    render(<SettingsPanel managementApi={managementApi} />);

    expect(await screen.findByText("Settings could not be loaded")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry loading settings" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save server settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export backup" })).not.toBeInTheDocument();
    expect(screen.queryByText("No backup selected.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading settings" }));
    expect(await screen.findByRole("button", { name: "Save server settings" })).toBeInTheDocument();
    expect(getServerConfig).toHaveBeenCalledTimes(2);
  });

  it("opens the data folder and clears retained logs with visible completion", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();

    render(<SettingsPanel managementApi={managementApi} />);

    await user.click(await screen.findByRole("button", { name: "Open data folder" }));
    expect(managementApi.openDataFolder).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveClass("management-toast--success");
    expect(screen.getByRole("status")).toHaveTextContent("Data folder opened");

    await user.click(screen.getByRole("button", { name: "Clear old logs now" }));
    expect(managementApi.clearOldLogs).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("3 old log files cleared");
  });

  it("disables maintenance actions and explains work while cleanup is busy", async () => {
    const user = userEvent.setup();
    let finishCleanup: ((result: { readonly deletedCount: number }) => void) | undefined;
    const managementApi = createManagementApi({
      clearOldLogs: vi.fn(() => new Promise<{ readonly deletedCount: number }>((resolve) => {
        finishCleanup = resolve;
      }))
    });

    render(<SettingsPanel managementApi={managementApi} />);
    await user.click(await screen.findByRole("button", { name: "Clear old logs now" }));

    expect(screen.getByRole("button", { name: "Clearing old logs..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open data folder" })).toBeDisabled();
    finishCleanup?.({ deletedCount: 0 });
    expect(await screen.findByText("No expired log files needed clearing.")).toBeVisible();
  });

  it("shows a human-readable maintenance failure with next step and reference ID", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi({
      openDataFolder: vi.fn(async () => {
        throw new Error("A server error occurred. Use the error ID to find details in backend logs. (INTERNAL_SERVER_ERROR, err_open_folder)");
      })
    });

    render(<SettingsPanel managementApi={managementApi} />);
    await user.click(await screen.findByRole("button", { name: "Open data folder" }));

    expect(await screen.findByText("Data folder was not opened")).toBeVisible();
    expect(screen.getByText("Open the configured data folder manually, then check Diagnostics and retry.")).toBeVisible();
    expect(screen.getByText("err_open_folder")).toBeVisible();
  });

  it("restores the backup and restore hash target after async settings load", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    window.history.replaceState(null, "", "/manage/settings#backup-restore");

    render(<SettingsPanel managementApi={createManagementApi()} />);

    expect(await screen.findByRole("heading", { name: "Backup and restore" })).toBeVisible();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
  });

  it("integrates named audio outputs and restores the audio deep-link target", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    window.history.replaceState(null, "", "/manage/settings#audio-outputs");

    render(<SettingsPanel audioApi={createAudioApi()} managementApi={createManagementApi()} />);

    expect(await screen.findByText("Headphones")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Audio outputs" })).toBeVisible();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
  });

  it("guards route drafts on navigation and saves them before leaving", async () => {
    const user = userEvent.setup();
    const audioApi = createAudioApi();
    window.history.replaceState(null, "", "/manage/settings");
    render(
      <DirtyNavigationProvider>
        <SettingsNavigationHarness audioApi={audioApi} managementApi={createManagementApi()} />
      </DirtyNavigationProvider>
    );

    const name = await screen.findByLabelText("Output name");
    await user.clear(name);
    await user.type(name, "Private headphones");
    await user.click(screen.getByRole("button", { name: "Go home" }));
    expect(await screen.findByRole("dialog", { name: "Leave with unsaved changes?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save and leave" }));
    await waitFor(() => expect(audioApi.updateRoute).toHaveBeenCalledWith("route-a", {
      name: "Private headphones", confirmLiveImpact: false
    }));
    await waitFor(() => expect(window.location.pathname).toBe("/manage"));
  });

  it("guards and discards an unfinished new output on navigation", async () => {
    const user = userEvent.setup();
    const audioApi = createAudioApi();
    window.history.replaceState(null, "", "/manage/settings");
    render(<DirtyNavigationProvider><SettingsNavigationHarness audioApi={audioApi} managementApi={createManagementApi()} /></DirtyNavigationProvider>);

    await user.type(await screen.findByLabelText("New output name"), "Draft speakers");
    await user.click(screen.getByRole("button", { name: "Go home" }));
    expect(await screen.findByRole("dialog", { name: "Leave with unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(window.location.pathname).toBe("/manage"));
    expect(audioApi.createRoute).not.toHaveBeenCalled();
  });

  it("keeps an unnamed device draft and blocks Save and leave with an inline error", async () => {
    const user = userEvent.setup();
    const audioApi = createAudioApi();
    window.history.replaceState(null, "", "/manage/settings");
    render(<DirtyNavigationProvider><SettingsNavigationHarness audioApi={audioApi} managementApi={createManagementApi()} /></DirtyNavigationProvider>);

    await user.selectOptions(await screen.findByLabelText("New output device"), "endpoint-a");
    await user.click(screen.getByRole("button", { name: "Go home" }));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));

    expect(await screen.findByText("Audio output needs a name")).toBeVisible();
    expect(screen.getByLabelText("New output device")).toHaveValue("endpoint-a");
    expect(window.location.pathname).toBe("/manage/settings");
    expect(audioApi.createRoute).not.toHaveBeenCalled();
  });

  it("downloads a versioned backup and reports completion", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    const createObjectURL = vi.fn(() => "blob:backup");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL }
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<SettingsPanel managementApi={managementApi} />);
    await user.click(await screen.findByRole("button", { name: "Export backup" }));

    expect(await screen.findByRole("status")).toHaveClass("management-toast--success");
    expect(screen.getByRole("status")).toHaveTextContent("Backup exported");
    expect(managementApi.exportConfigurationBackup).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it("shows every validation blocker and keeps restore disabled", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi({
      preflightConfigurationRestore: vi.fn(async () => ({
        ...validPreflight(),
        state: "invalid" as const,
        blockers: [actionable("Backup asset checksum does not match", "Export the backup again.")]
      }))
    });

    render(<SettingsPanel managementApi={managementApi} />);
    await user.upload(await screen.findByLabelText("Backup file"), backupFile());

    expect(await screen.findByText("Backup asset checksum does not match")).toBeVisible();
    expect(screen.getByRole("button", { name: "Restore configuration" })).toBeDisabled();
  });

  it("rejects an oversized archive before reading or sending it", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();
    const file = backupFile();
    Object.defineProperty(file, "size", { value: configurationBackupLimits.maxArchiveBytes + 1 });

    render(<SettingsPanel managementApi={managementApi} />);
    await user.upload(await screen.findByLabelText("Backup file"), file);

    expect(await screen.findByText("Backup file is too large")).toBeVisible();
    expect(managementApi.preflightConfigurationRestore).not.toHaveBeenCalled();
  });

  it("requires typed confirmation and shows regenerated URLs plus provider reconnect steps", async () => {
    const user = userEvent.setup();
    const managementApi = createManagementApi();

    render(<SettingsPanel managementApi={managementApi} />);
    await user.upload(await screen.findByLabelText("Backup file"), backupFile());

    expect(await screen.findByText("1 alert set")).toBeVisible();
    const restore = screen.getByRole("button", { name: "Restore configuration" });
    expect(restore).toBeDisabled();
    await user.type(screen.getByLabelText("Type RESTORE to confirm"), "RESTORE");
    expect(restore).toBeEnabled();
    await user.click(restore);

    expect(managementApi.restoreConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    }));
    expect((await screen.findByText("Configuration restored.")).closest(".management-toast")).toHaveClass("management-toast--warning");
    expect(await screen.findByText("Update browser-source URLs")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reveal Landscape live browser-source URL" }));
    expect(screen.getByLabelText("Landscape live browser-source URL")).toHaveTextContent("http://127.0.0.1:39187/overlay/new-key");
    expect(screen.getByText("Reconnect Twitch")).toBeVisible();
  });
});

type SettingsApi = Pick<
  ManagementApi,
  "getDesktopConfig" | "updateDesktopConfig" | "getServerConfig" | "updateServerConfig" | "getConfigurationBackupSummary" | "exportConfigurationBackup" | "preflightConfigurationRestore" | "restoreConfiguration" | "openDataFolder" | "clearOldLogs"
>;

function createManagementApi(overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
    getDesktopConfig: vi.fn(async () => ({ available: false, closeToTray: true })),
    updateDesktopConfig: vi.fn(async (input) => ({ ...input, available: true })),
    getServerConfig: vi.fn(async () => ({ host: "127.0.0.1", port: 39187 })),
    updateServerConfig: vi.fn(async (input) => input),
    getConfigurationBackupSummary: vi.fn(async () => ({
      state: "ready" as const,
      appVersion: "0.0.0",
      schemaVersion: 9,
      configurationRecordCount: 12,
      assetCount: 3,
      totalAssetBytes: 2048,
      dataDirectory: "C:/Users/James/.stream-jams/data",
      assetDirectory: "C:/Users/James/.stream-jams/assets",
      logLevel: "INFO" as const,
      logRetentionHours: 48,
      secretExclusions: ["Provider credentials and tokens", "Overlay route keys and hashes"],
      blockers: []
    })),
    exportConfigurationBackup: vi.fn(async () => backupArchive()),
    preflightConfigurationRestore: vi.fn(async () => validPreflight()),
    restoreConfiguration: vi.fn(async () => ({
      state: "completed" as const,
      safetyBackupPath: "C:/Users/James/.stream-jams/backups/pre-restore.streamjams-backup",
      restored: validPreflight().impact!,
      regeneratedOutputs: [{ label: "Landscape live", url: "http://127.0.0.1:39187/overlay/new-key" }],
      reconnectProviders: ["Twitch"],
      warnings: []
    })),
    openDataFolder: vi.fn(async () => ({ dataDirectory: "C:/Users/James/.stream-jams/data" })),
    clearOldLogs: vi.fn(async () => ({ deletedCount: 3 })),
    ...overrides
  };
}

function createAudioApi(): AudioApi {
  return {
    getStatus: vi.fn(async () => ({
      capability: { available: true, devices: [{ deviceId: "endpoint-a", label: "USB headphones" }], reason: null, nextStep: null },
      muted: false,
      routes: [{ route: { id: "route-a", name: "Headphones", deviceId: "endpoint-a", deviceLabel: "USB headphones" }, state: "ready" as const }]
    })),
    createRoute: vi.fn(),
    updateRoute: vi.fn(async (id, input) => ({
      id,
      name: input.name ?? "Headphones",
      deviceId: input.deviceId === undefined ? "endpoint-a" : input.deviceId,
      deviceLabel: input.deviceId === null ? null : "USB headphones"
    })),
    deleteRoute: vi.fn(async () => undefined),
    testRoute: vi.fn(async (routeId) => ({ routeId, muted: false })),
    retry: vi.fn(async () => undefined)
  };
}

function SettingsNavigationHarness({ audioApi, managementApi, surfaceApi }: { readonly audioApi: AudioApi; readonly managementApi: SettingsApi; readonly surfaceApi?: SurfaceSettingsApi }) {
  const navigation = useManagementNavigation();
  return <><button onClick={() => navigation.requestNavigation({ id: "home" })} type="button">Go home</button><SettingsPanel audioApi={audioApi} surfaceApi={surfaceApi} managementApi={managementApi} />{navigation.guard}</>;
}

function backupArchive(): ConfigurationBackupArchive {
  return {
    manifest: { format: "stream-jams-backup", archiveVersion: 2, appVersion: "0.0.0", schemaVersion: 9, createdAt: "2026-07-15T05:00:00.000Z", configurationChecksum: `sha256:${"a".repeat(64)}`, configurationRecordCount: 0, assetCount: 0, totalAssetBytes: 0 },
    configuration: { appConfig: {}, tables: {}, providerReconnectMetadata: [], overlayOutputs: [] },
    assets: []
  };
}

function validPreflight(): ConfigurationRestorePreflight {
  return {
    state: "valid",
    archiveId: `sha256:${"b".repeat(64)}`,
    appVersion: "0.0.0",
    schemaVersion: 9,
    createdAt: "2026-07-15T05:00:00.000Z",
    impact: { configurationRecords: 12, providers: 1, alertSets: 1, assets: 3, preferences: 1, browserOutputs: 1 },
    runtime: { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
    blockers: [],
    warnings: [actionable("Browser-source URLs will change", "Update OBS after restore.")]
  };
}

function actionable(summary: string, nextStep: string) {
  return { summary, cause: null, nextStep, severity: "warning" as const, occurredAt: null, referenceId: null, correction: null };
}

function backupFile(): File {
  return new File([JSON.stringify(backupArchive())], "configuration.streamjams-backup", { type: "application/json" });
}
