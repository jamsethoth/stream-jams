import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  configurationBackupLimits,
  type ConfigurationBackupArchive,
  type ConfigurationRestorePreflight
} from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagementApi } from "../management-api.js";
import { SettingsPanel } from "./SettingsPanel.js";

describe("SettingsPanel", () => {
  afterEach(() => cleanup());

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
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
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
  "getServerConfig" | "updateServerConfig" | "getConfigurationBackupSummary" | "exportConfigurationBackup" | "preflightConfigurationRestore" | "restoreConfiguration" | "openDataFolder" | "clearOldLogs"
>;

function createManagementApi(overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
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
