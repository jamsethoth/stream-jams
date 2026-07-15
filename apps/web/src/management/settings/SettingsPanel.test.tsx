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

    expect(await screen.findByRole("status")).toHaveTextContent("Backup exported");
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
    expect(await screen.findByText("Update browser-source URLs")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reveal Landscape live browser-source URL" }));
    expect(screen.getByLabelText("Landscape live browser-source URL")).toHaveTextContent("http://127.0.0.1:39187/overlay/new-key");
    expect(screen.getByText("Reconnect Twitch")).toBeVisible();
  });
});

type SettingsApi = Pick<
  ManagementApi,
  "getServerConfig" | "updateServerConfig" | "getConfigurationBackupSummary" | "exportConfigurationBackup" | "preflightConfigurationRestore" | "restoreConfiguration"
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
    ...overrides
  };
}

function backupArchive(): ConfigurationBackupArchive {
  return {
    manifest: { format: "stream-jams-backup", archiveVersion: 1, appVersion: "0.0.0", schemaVersion: 9, createdAt: "2026-07-15T05:00:00.000Z", configurationChecksum: `sha256:${"a".repeat(64)}`, configurationRecordCount: 0, assetCount: 0, totalAssetBytes: 0 },
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
