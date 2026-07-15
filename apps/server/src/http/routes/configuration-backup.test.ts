import type {
  ConfigurationBackupArchive,
  ConfigurationRestorePreflight,
  ConfigurationRestoreResult
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createServerApp } from "../../app.js";
import { ConfigurationRestoreBlockedError } from "../../modules/backup/configuration-backup-service.js";

const archive: ConfigurationBackupArchive = {
  manifest: { format: "stream-jams-backup", archiveVersion: 1, appVersion: "0.0.0", schemaVersion: 9, createdAt: "2026-07-15T05:00:00.000Z", configurationChecksum: `sha256:${"a".repeat(64)}`, configurationRecordCount: 0, assetCount: 0, totalAssetBytes: 0 },
  configuration: { appConfig: {}, tables: {}, providerReconnectMetadata: [], overlayOutputs: [] },
  assets: []
};
const preflight: ConfigurationRestorePreflight = {
  state: "valid",
  archiveId: `sha256:${"b".repeat(64)}`,
  appVersion: "0.0.0",
  schemaVersion: 9,
  createdAt: "2026-07-15T05:00:00.000Z",
  impact: { configurationRecords: 0, providers: 0, alertSets: 0, assets: 0, preferences: 1, browserOutputs: 0 },
  runtime: { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
  blockers: [],
  warnings: []
};
const result: ConfigurationRestoreResult = {
  state: "completed",
  safetyBackupPath: "C:/safe/pre-restore.streamjams-backup",
  restored: preflight.impact!,
  regeneratedOutputs: [],
  reconnectProviders: [],
  warnings: []
};

describe("configuration backup routes", () => {
  it("exports, validates, and restores through protected management routes", async () => {
    const service = { exportArchive: vi.fn(async () => archive), preflight: vi.fn(async () => preflight), restore: vi.fn(async () => result) };
    const app = createServerApp({
      metadata: { appName: "stream-jams", version: "0.0.0" },
      configurationBackupService: service,
      managementAuthPreHandler: async () => undefined,
      managementRateLimitPreHandler: async () => undefined
    });

    expect((await app.inject({ method: "GET", url: "/management/settings/backup" })).json()).toEqual(archive);
    expect((await app.inject({ method: "POST", url: "/management/settings/backup/preflight", payload: archive })).json()).toEqual(preflight);
    const restoreResponse = await app.inject({ method: "POST", url: "/management/settings/backup/restore", payload: { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true } });
    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json()).toEqual(result);
    expect(service.restore).toHaveBeenCalledOnce();
    await app.close();
  });

  it("returns actionable restore failures without exposing internal errors", async () => {
    const actionableError = { summary: "Safety backup could not be created", cause: "Disk is read-only", nextStep: "Check storage permissions and try again.", severity: "error" as const, occurredAt: "2026-07-15T05:00:00.000Z", referenceId: "ref-backup-route", correction: { label: "Open Settings", route: "/settings#backup-restore" } };
    const app = createServerApp({
      metadata: { appName: "stream-jams", version: "0.0.0" },
      configurationBackupService: {
        exportArchive: async () => archive,
        preflight: async () => preflight,
        restore: async () => { throw new ConfigurationRestoreBlockedError("SAFETY_BACKUP_FAILED", actionableError); }
      },
      managementAuthPreHandler: async () => undefined,
      managementRateLimitPreHandler: async () => undefined
    });

    const response = await app.inject({ method: "POST", url: "/management/settings/backup/restore", payload: { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "SAFETY_BACKUP_FAILED",
        id: "ref-backup-route",
        message: "Safety backup could not be created Disk is read-only Check storage permissions and try again."
      },
      actionableError
    });
    await app.close();
  });
});
