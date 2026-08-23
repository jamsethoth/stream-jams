import { createHash } from "node:crypto";
import {
  configurationBackupLimits,
  type AppConfig,
  type AppConfigUpdate,
  type AssetRecord,
  type ModerationSettings
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase, currentSchemaVersion, type StreamJamsDatabase } from "../db/database.js";
import { SqliteModerationSettingsRepository } from "../moderation/sqlite-moderation-settings-repository.js";
import {
  ConfigurationBackupService,
  ConfigurationRestoreBlockedError,
  type ConfigurationBackupServiceOptions,
  type ConfigurationSnapshotRepository
} from "./configuration-backup-service.js";
import { SqliteConfigurationSnapshotRepository } from "./sqlite-configuration-snapshot-repository.js";

const pngBytes = Buffer.from("89504e470d0a1a0a", "hex");
const appConfig: AppConfig = {
  server: { host: "127.0.0.1", port: 39187 },
  storage: { dataDirectory: "C:/source/data", assetDirectory: "C:/source/assets" },
  logging: { level: "INFO", rollover: "hourly", retentionHours: 336 },
  playback: { paused: true, muted: true, doNotDisturb: true }
};
const asset: AssetRecord = {
  id: "asset-follow",
  originalFileName: "follow.png",
  mediaType: "image",
  mimeType: "image/png",
  sizeBytes: pngBytes.length,
  checksum: checksum(pngBytes),
  storagePath: "image/asset-follow.png"
};

describe("ConfigurationBackupService", () => {
  it("exports all registered assets and only allowlisted secret-free configuration", async () => {
    const { service } = createService();

    const archive = await service.exportArchive();

    expect(archive.manifest).toMatchObject({
      format: "stream-jams-backup",
      archiveVersion: 2,
      appVersion: "1.2.3",
      schemaVersion: 9,
      assetCount: 1,
      totalAssetBytes: pngBytes.length
    });
    expect(archive.assets[0]).toMatchObject({
      id: asset.id,
      filename: asset.originalFileName,
      checksum: asset.checksum,
      dataBase64: pngBytes.toString("base64")
    });
    expect(JSON.stringify(archive)).not.toMatch(/oauth|accessToken|secret_ref|route_key|key_hash/iu);
    expect(JSON.stringify(archive)).toContain("configured-blocked-term");
    expect(JSON.stringify(archive)).not.toMatch(/preview sample|original viewer text|credentials|route keys|sessions|raw provider payloads|operational logs/iu);
  });

  it("rejects version-one archives because they did not capture variant order", async () => {
    const { service } = createService();
    const archive = await service.exportArchive();
    const legacy = structuredClone(archive) as unknown as { manifest: { archiveVersion: number } };
    legacy.manifest.archiveVersion = 1;

    await expect(service.preflight(legacy)).resolves.toMatchObject({
      state: "invalid",
      blockers: [expect.objectContaining({
        summary: "Backup variant order was not captured",
        nextStep: "Export a new backup from the source installation."
      })]
    });
  });

  it("reports checksum blockers and never enables an invalid archive", async () => {
    const { service } = createService();
    const archive = await service.exportArchive();
    const invalid = structuredClone(archive);
    invalid.assets[0] = { ...invalid.assets[0]!, dataBase64: Buffer.from("changed").toString("base64") };

    const preflight = await service.preflight(invalid);

    expect(preflight.state).toBe("invalid");
    expect(preflight.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ summary: "Backup asset checksum does not match" })
    ]));
  });

  it("returns an actionable invalid summary when export readiness fails", async () => {
    const { service } = createService({ readAsset: vi.fn().mockRejectedValue(new Error("Asset file is missing")) });

    await expect(service.summary()).resolves.toMatchObject({
      state: "invalid",
      blockers: [expect.objectContaining({
        summary: "Configuration backup is not ready",
        cause: "Asset file is missing",
        referenceId: "ref-backup-test"
      })]
    });
  });

  it("rejects an oversized registered asset library before reading asset bytes", async () => {
    const readAsset = vi.fn(async () => pngBytes);
    const { service } = createService({
      assetRecords: [{ ...asset, sizeBytes: configurationBackupLimits.maxTotalAssetBytes }],
      readAsset
    });

    await expect(service.exportArchive()).rejects.toThrow("exceed the supported in-process backup size");
    expect(readAsset).not.toHaveBeenCalled();
  });

  it("returns a valid impact summary and blocks it when live intake is active", async () => {
    const ready = createService();
    const archive = await ready.service.exportArchive();

    await expect(ready.service.preflight(archive)).resolves.toMatchObject({
      state: "valid",
      impact: { configurationRecords: 4, providers: 1, alertSets: 1, assets: 1, preferences: 1, browserOutputs: 1 }
    });

    const live = createService({ runtime: { intakeActive: true, playbackActive: false, queuedPlaybackCount: 0 } });
    await expect(live.service.preflight(archive)).resolves.toMatchObject({
      state: "blocked-live",
      blockers: [expect.objectContaining({ summary: "Restore is blocked while Stream Jams is live" })]
    });
  });

  it("stops before mutation when the safety backup cannot be written", async () => {
    const replace = replacementMock();
    const { service } = createService({
      replace,
      writeSafetyBackup: vi.fn().mockRejectedValue(new Error("Disk is read-only"))
    });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);

    await expect(service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    })).rejects.toMatchObject({
      code: "SAFETY_BACKUP_FAILED"
    } satisfies Partial<ConfigurationRestoreBlockedError>);
    expect(replace).not.toHaveBeenCalled();
  });

  it("restores staged assets, preserves target storage paths, and regenerates outputs", async () => {
    const replace = replacementMock();
    const updateConfig = vi.fn(async (patch: AppConfigUpdate) => {
      void patch;
      return appConfig;
    });
    const regenerateOutput = vi.fn(async (_output, origin: string) => ({ label: "Landscape live", url: `${origin}/new-key` }));
    const { service } = createService({ replace, updateConfig, regenerateOutput });
    const archive = await service.exportArchive();
    archive.configuration.appConfig = {
      ...archive.configuration.appConfig,
      server: { host: "127.0.0.1", port: 40123 },
      storage: { dataDirectory: "D:/other/data", assetDirectory: "D:/other/assets" }
    };
    archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
    const preflight = await service.preflight(archive);

    const result = await service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    });

    expect(replace).toHaveBeenCalledWith(expect.objectContaining({
      assets: [expect.objectContaining({ id: asset.id, storagePath: expect.stringContaining("restore_") })]
    }));
    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      server: { host: "127.0.0.1", port: 40123 },
      logging: appConfig.logging,
      playback: appConfig.playback
    }));
    expect(updateConfig.mock.calls[0]?.[0]).not.toHaveProperty("storage");
    expect(regenerateOutput).toHaveBeenCalledWith(expect.anything(), "http://127.0.0.1:40123");
    expect(result).toMatchObject({
      state: "completed",
      safetyBackupPath: "C:/safe/pre-restore.streamjams-backup",
      regeneratedOutputs: [{ label: "Landscape live", url: "http://127.0.0.1:40123/new-key" }],
      reconnectProviders: ["Twitch"]
    });
  });

  it("reloads runtime moderation only after the database replacement and config update succeed", async () => {
    const steps: string[] = [];
    const { service } = createService({
      replace: () => steps.push("replace"),
      updateConfig: async () => {
        steps.push("config");
        return appConfig;
      },
      reloadRuntimeConfiguration: () => steps.push("reload")
    });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);

    await expect(service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    })).resolves.toMatchObject({ state: "completed" });

    expect(steps).toEqual(["replace", "config", "reload"]);
  });

  const restoreFailureCases = ["replacement", "config update", "runtime reload"] as const;
  it.each(restoreFailureCases)("restores the persisted and active runtime policy when %s fails", async (failure) => {
    const backupPolicy: ModerationSettings = {
      renderedText: { maxLength: 200, blockedTerms: ["backup-rendered"], stripUrls: true },
      ttsText: { maxLength: 160, blockedTerms: ["backup-tts"], stripUrls: false }
    };
    const previousPolicy: ModerationSettings = {
      renderedText: { maxLength: 333, blockedTerms: ["previous-rendered"], stripUrls: false },
      ttsText: { maxLength: 222, blockedTerms: ["previous-tts"], stripUrls: true }
    };
    const source = createRealService({ initialPolicy: backupPolicy });
    const target = createRealService({ initialPolicy: previousPolicy });
    try {
      const archive = await source.service.exportArchive();
      const observedRuntimePolicies: ModerationSettings[] = [];
      let reloadCount = 0;
      const updateConfig = failure === "config update"
        ? async (): Promise<AppConfig> => { throw new Error("config failed"); }
        : async (): Promise<AppConfig> => appConfig;
      target.service = createRealService({
        database: target.database,
        updateConfig,
        reloadRuntimeConfiguration: () => {
          const active = target.moderationSettingsRepository.read();
          if (active === null) throw new Error("Active moderation policy is missing");
          observedRuntimePolicies.push(active);
          reloadCount += 1;
          if (failure === "runtime reload" && reloadCount === 1) throw new Error("reload failed");
        }
      }).service;
      if (failure === "replacement") {
        target.database.connection.exec(`
          CREATE TRIGGER reject_backup_policy
          BEFORE INSERT ON alert_moderation_settings
          WHEN NEW.rendered_max_length = 200
          BEGIN SELECT RAISE(FAIL, 'replace failed'); END;
        `);
      }
      const preflight = await target.service.preflight(archive);

      await expect(target.service.restore({
        archive,
        archiveId: preflight.archiveId!,
        confirmation: "RESTORE",
        regenerateRouteKeys: true
      })).rejects.toMatchObject({ code: "RESTORE_FAILED" });

      expect(target.moderationSettingsRepository.read()).toEqual(previousPolicy);
      expect(observedRuntimePolicies.at(-1)).toEqual(previousPolicy);
      expect(observedRuntimePolicies).toEqual(
        failure === "runtime reload" ? [backupPolicy, previousPolicy] : [previousPolicy]
      );
    } finally {
      source.database.close();
      target.database.close();
    }
  });

  it("blocks an invalid moderation policy in preflight before replacement", async () => {
    const source = createRealService();
    const target = createRealService();
    try {
      const archive = await source.service.exportArchive();
      const [policy] = archive.configuration.tables.alert_moderation_settings ?? [];
      if (policy === undefined) throw new Error("Archived moderation policy is required");
      archive.configuration.tables.alert_moderation_settings = [{ ...policy, rendered_blocked_terms_json: "[1]" }];
      archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
      const replace = vi.spyOn(target.snapshotRepository, "replace");
      const previousPolicy = target.moderationSettingsRepository.read();
      const preflight = await target.service.preflight(archive);

      expect(preflight.state).toBe("invalid");
      await expect(target.service.restore({
        archive,
        archiveId: preflight.archiveId!,
        confirmation: "RESTORE",
        regenerateRouteKeys: true
      })).rejects.toMatchObject({ code: "RESTORE_PREFLIGHT_REQUIRED" });
      expect(replace).not.toHaveBeenCalled();
      expect(target.moderationSettingsRepository.read()).toEqual(previousPolicy);
    } finally {
      source.database.close();
      target.database.close();
    }
  });

  it("restores the complete operational database state when config replacement fails", async () => {
    const restorePoint = { providerSecret: "credential/provider-token", routeKeyHash: "route-hash" };
    const restoreRestorePoint = vi.fn();
    const deleteTokenSecrets = vi.fn(async () => undefined);
    const { service } = createService({
      captureRestorePoint: () => restorePoint,
      restoreRestorePoint,
      findConnectedTwitchAccountId: async () => "old-account",
      deleteTokenSecrets,
      updateConfig: vi.fn().mockRejectedValue(new Error("Config file is locked"))
    });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);

    await expect(service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    })).rejects.toMatchObject({ code: "RESTORE_FAILED" });

    expect(restoreRestorePoint).toHaveBeenCalledWith(restorePoint);
    expect(deleteTokenSecrets).not.toHaveBeenCalled();
  });

  it("reports old-asset cleanup failures without failing a completed restore", async () => {
    const { service } = createService({
      deleteAsset: vi.fn().mockRejectedValue(new Error("File is in use"))
    });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);

    const result = await service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        summary: "Old asset files could not be removed",
        referenceId: "ref-backup-test"
      })
    ]));
  });

  it("removes old Twitch token references after a successful disconnected restore", async () => {
    const deleteTokenSecrets = vi.fn(async () => undefined);
    const { service } = createService({
      findConnectedTwitchAccountId: async () => "old-account",
      deleteTokenSecrets
    });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);

    const result = await service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    });

    expect(deleteTokenSecrets).toHaveBeenCalledExactlyOnceWith("old-account");
    expect(result.state).toBe("completed");
  });

  it("keeps restore completed and warns when an old Twitch secret cannot be removed", async () => {
    const { service } = createService({
      findConnectedTwitchAccountId: async () => "old-account",
      deleteTokenSecrets: vi.fn().mockRejectedValue(new Error("secret unavailable"))
    });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);

    const result = await service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        summary: "Old Twitch credentials could not be removed",
        cause: expect.not.stringContaining("secret unavailable"),
        referenceId: "ref-backup-test"
      })
    ]));
  });
});

function createService(overrides: {
  readonly runtime?: { readonly intakeActive: boolean; readonly playbackActive: boolean; readonly queuedPlaybackCount: number };
  readonly replace?: ConfigurationSnapshotRepository["replace"];
  readonly updateConfig?: ConfigurationBackupServiceOptions["configStore"]["updateConfig"];
  readonly writeSafetyBackup?: ConfigurationBackupServiceOptions["safetyBackupStore"]["write"];
  readonly regenerateOutput?: ConfigurationBackupServiceOptions["regenerateOutput"];
  readonly readAsset?: ConfigurationBackupServiceOptions["assetStore"]["read"];
  readonly deleteAsset?: ConfigurationBackupServiceOptions["assetStore"]["delete"];
  readonly captureRestorePoint?: ConfigurationSnapshotRepository["captureRestorePoint"];
  readonly restoreRestorePoint?: ConfigurationSnapshotRepository["restoreRestorePoint"];
  readonly assetRecords?: readonly AssetRecord[];
  readonly findConnectedTwitchAccountId?: () => Promise<string | null>;
  readonly deleteTokenSecrets?: (accountId: string) => Promise<void>;
  readonly reloadRuntimeConfiguration?: () => void;
  readonly validate?: ConfigurationSnapshotRepository["validate"];
} = {}) {
  const replace = overrides.replace ?? replacementMock();
  const options: ConfigurationBackupServiceOptions = {
    appVersion: "1.2.3",
    schemaVersion: 9,
    now: () => new Date("2026-07-15T05:00:00.000Z"),
    generateReferenceId: () => "ref-backup-test",
    configStore: {
      readConfig: async () => appConfig,
      updateConfig: overrides.updateConfig ?? (async () => appConfig)
    },
    snapshotRepository: {
      snapshot: () => ({
        tables: {
          alert_collections: [{ id: "set-default", name: "Everyday", enabled: 1 }],
          asset_metadata: [{ id: asset.id, original_file_name: asset.originalFileName, media_type: asset.mediaType, mime_type: asset.mimeType, size_bytes: asset.sizeBytes, checksum: asset.checksum }],
          provider_registrations: [{ id: "provider-twitch", name: "Twitch", kind: "twitch", capability: "event-source", non_secret_config_json: "{}", active: 0, connection_state: "disconnected", intake_state: "inactive", validated_at: null, error_json: null, available_voices_json: "[]", tts_safety_json: null, created_at: "2026-07-15T04:00:00.000Z", updated_at: "2026-07-15T04:00:00.000Z" }],
          alert_moderation_settings: [{ id: 1, rendered_max_length: 240, rendered_blocked_terms_json: '["configured-blocked-term"]', rendered_strip_urls: 0, tts_max_length: 180, tts_blocked_terms_json: '["configured-blocked-term"]', tts_strip_urls: 1 }]
        },
        providerReconnectMetadata: [{ id: "provider-twitch", name: "Twitch", kind: "twitch" }],
        overlayOutputs: [{ overlayId: "default", scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" }]
      }),
      validate: overrides.validate ?? (() => []),
      replace,
      captureRestorePoint: overrides.captureRestorePoint ?? (() => ({ marker: "current" })),
      restoreRestorePoint: overrides.restoreRestorePoint ?? (() => undefined)
    },
    assetRepository: { list: async () => overrides.assetRecords ?? [asset] },
    assetStore: {
      read: overrides.readAsset ?? (async () => pngBytes),
      write: async (input) => ({ storagePath: `image/${input.assetId}-${input.storageVersion}.png` }),
      delete: overrides.deleteAsset ?? (async () => undefined)
    },
    assetValidator: {
      validate: () => ({ accepted: true, reason: null, mediaType: "image", normalizedExtension: ".png" })
    },
    getRuntime: async () => overrides.runtime ?? { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 },
    getAvailableBytes: async () => 1_000_000,
    safetyBackupStore: {
      write: overrides.writeSafetyBackup ?? (async () => "C:/safe/pre-restore.streamjams-backup")
    },
    regenerateOutput: overrides.regenerateOutput ?? (async (_output, origin) => ({ label: "Landscape live", url: `${origin}/new-key` })),
    twitchCredentials: {
      findConnectedAccountId: overrides.findConnectedTwitchAccountId ?? (async () => null),
      deleteTokenSecrets: overrides.deleteTokenSecrets ?? (async () => undefined)
    },
    ...(overrides.reloadRuntimeConfiguration === undefined ? {} : { reloadRuntimeConfiguration: overrides.reloadRuntimeConfiguration })
  };
  return { service: new ConfigurationBackupService(options), replace };
}

function createRealService(overrides: {
  readonly database?: StreamJamsDatabase;
  readonly initialPolicy?: ModerationSettings;
  readonly updateConfig?: ConfigurationBackupServiceOptions["configStore"]["updateConfig"];
  readonly reloadRuntimeConfiguration?: () => void;
} = {}) {
  const database = overrides.database ?? createInMemoryStreamJamsDatabase();
  if (overrides.database === undefined) {
    database.connection.prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
      .run("set-default", "Everyday", 1);
  }
  const moderationSettingsRepository = new SqliteModerationSettingsRepository(database.connection);
  if (overrides.initialPolicy !== undefined) {
    moderationSettingsRepository.replace(overrides.initialPolicy);
  }
  const snapshotRepository = new SqliteConfigurationSnapshotRepository(database.connection);
  const options: ConfigurationBackupServiceOptions = {
    appVersion: "1.2.3",
    schemaVersion: currentSchemaVersion,
    now: () => new Date("2026-07-15T05:00:00.000Z"),
    generateReferenceId: () => "ref-backup-test",
    configStore: {
      readConfig: async () => appConfig,
      updateConfig: overrides.updateConfig ?? (async () => appConfig)
    },
    snapshotRepository,
    assetRepository: { list: async () => [] },
    assetStore: {
      read: async () => Buffer.alloc(0),
      write: async (input) => ({ storagePath: `image/${input.assetId}-${input.storageVersion}.png` }),
      delete: async () => undefined
    },
    assetValidator: {
      validate: () => ({ accepted: true, reason: null, mediaType: "image", normalizedExtension: ".png" })
    },
    getRuntime: async () => ({ intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 }),
    getAvailableBytes: async () => 1_000_000,
    safetyBackupStore: { write: async () => "C:/safe/pre-restore.streamjams-backup" },
    regenerateOutput: async (_output, origin) => ({ label: "Landscape live", url: `${origin}/new-key` }),
    ...(overrides.reloadRuntimeConfiguration === undefined ? {} : { reloadRuntimeConfiguration: overrides.reloadRuntimeConfiguration })
  };
  return {
    service: new ConfigurationBackupService(options),
    database,
    moderationSettingsRepository,
    snapshotRepository
  };
}

function checksum(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function replacementMock() {
  return vi.fn((input: Parameters<ConfigurationSnapshotRepository["replace"]>[0]) => {
    void input;
  });
}
