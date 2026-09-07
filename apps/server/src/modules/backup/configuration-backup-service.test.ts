import { createHash } from "node:crypto";
import {
  appConfigSchema,
  configurationBackupLimits,
  type AlertEditorDocument,
  type AlertRule,
  type AppConfig,
  type AppConfigUpdate,
  type AssetRecord,
  type ModerationSettings
} from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryStreamJamsDatabase, currentSchemaVersion, type StreamJamsDatabase } from "../db/database.js";
import { SqliteAlertRepository } from "../alerts/sqlite-alert-repository.js";
import { SqliteAlertEditorDocumentRepository } from "../alerts/sqlite-alert-editor-document-repository.js";
import { SqliteAudioOutputRouteRepository } from "../audio/sqlite-audio-output-route-repository.js";
import { SqliteModerationSettingsRepository } from "../moderation/sqlite-moderation-settings-repository.js";
import {
  ConfigurationBackupService,
  ConfigurationRestoreBlockedError,
  type ConfigurationBackupServiceOptions,
  type ConfigurationSnapshotRepository
} from "./configuration-backup-service.js";
import { SqliteConfigurationSnapshotRepository } from "./sqlite-configuration-snapshot-repository.js";
import { RuntimeMaintenanceGate, RuntimeMaintenanceUnavailableError } from "./runtime-maintenance-gate.js";

const pngBytes = Buffer.from("89504e470d0a1a0a", "hex");
const appConfig: AppConfig = {
  desktop: { closeToTray: true },
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
  it("identifies local device bindings as excluded from portable backups", async () => {
    const { service } = createService();

    const summary = await service.summary();

    expect(summary.secretExclusions).toEqual(expect.arrayContaining([
      expect.stringMatching(/local audio device IDs and labels/i)
    ]));
  });

  it("round-trips route identities and assignments while naming every route requiring rebinding", async () => {
    const source = createRealService();
    const target = createRealService();
    try {
      await seedRoutedAlerts(source.database);
      const archive = await source.service.exportArchive();
      const preflight = await target.service.preflight(archive);

      expect(preflight.state).toBe("valid");
      expect(archive.configuration.tables.audio_output_routes).toEqual([
        { id: "route-headphones", name: "Headphones", device_id: null, device_label: null },
        { id: "route-stream", name: "Stream mix", device_id: null, device_label: null }
      ]);
      expect(JSON.stringify(archive)).not.toMatch(/source-endpoint|Source headset|Source mixer/);
      const rebindWarnings = ["Headphones", "Stream mix"].map((name) => expect.objectContaining({
        summary: expect.stringContaining(name),
        nextStep: expect.stringMatching(/bind/i),
        correction: { label: "Open Audio outputs", route: "/manage/settings#audio-outputs" }
      }));
      expect(preflight.warnings).toEqual(expect.arrayContaining(rebindWarnings));

      const result = await target.service.restore({
        archive,
        archiveId: preflight.archiveId!,
        confirmation: "RESTORE",
        regenerateRouteKeys: true
      });

      expect(result.warnings).toEqual(expect.arrayContaining(rebindWarnings));
      expect(new SqliteAudioOutputRouteRepository(target.database.connection).list()).toEqual([
        { id: "route-headphones", name: "Headphones", deviceId: null, deviceLabel: null },
        { id: "route-stream", name: "Stream mix", deviceId: null, deviceLabel: null }
      ]);
      const documents = new SqliteAlertEditorDocumentRepository(target.database.connection);
      await expect(documents.find("rule-routed")).resolves.toMatchObject({
        outputs: { browserSource: false, deviceRouteIds: ["route-headphones"] }
      });
      await expect(documents.find("rule-routed-default")).resolves.toMatchObject({
        outputs: { browserSource: true, deviceRouteIds: ["route-stream", "route-headphones"] }
      });
      expect(new SqliteAudioOutputRouteRepository(source.database.connection).findById("route-headphones"))
        .toMatchObject({ deviceId: "source-endpoint-headphones", deviceLabel: "Source headset" });
    } finally {
      source.database.close();
      target.database.close();
    }
  });

  it("rejects orphaned route assignments in preflight before changing the target database", async () => {
    const source = createRealService();
    const target = createRealService();
    try {
      await seedRoutedAlerts(source.database);
      const archive = await source.service.exportArchive();
      archive.configuration.tables.audio_output_routes = [];
      archive.manifest.configurationRecordCount -= 2;
      archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
      const previous = target.snapshotRepository.captureRestorePoint();

      const preflight = await target.service.preflight(archive);

      expect(preflight.state).toBe("invalid");
      expect(preflight.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ cause: expect.stringMatching(/missing audio route/i), nextStep: expect.stringMatching(/export/i) })
      ]));
      await expect(target.service.restore({
        archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true
      })).rejects.toMatchObject({ code: "RESTORE_PREFLIGHT_REQUIRED" });
      expect(target.snapshotRepository.captureRestorePoint()).toEqual(previous);
    } finally {
      source.database.close();
      target.database.close();
    }
  });

  it("explicitly rejects an older database schema even when the archive format is supported", async () => {
    const target = createRealService();
    try {
      const archive = await target.service.exportArchive();
      archive.manifest.schemaVersion = currentSchemaVersion - 1;
      delete archive.configuration.tables.audio_output_routes;
      archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
      const previous = target.snapshotRepository.captureRestorePoint();

      const preflight = await target.service.preflight(archive);

      expect(preflight.state).toBe("invalid");
      expect(preflight.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ summary: "Backup schema is not supported", cause: expect.stringContaining(`schema ${currentSchemaVersion - 1}`) })
      ]));
      await expect(target.service.restore({
        archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true
      })).rejects.toMatchObject({ code: "RESTORE_PREFLIGHT_REQUIRED" });
      expect(target.snapshotRepository.captureRestorePoint()).toEqual(previous);
    } finally {
      target.database.close();
    }
  });

  it("rolls back replaced route definitions, local bindings, and default/variation assignments together", async () => {
    const source = createRealService();
    const target = createRealService();
    try {
      await seedRoutedAlerts(source.database);
      await seedRoutedAlerts(target.database);
      const routes = new SqliteAudioOutputRouteRepository(target.database.connection);
      routes.save({ id: "route-headphones", name: "Previous headphones", deviceId: "target-endpoint", deviceLabel: "Target headset" });
      const documents = new SqliteAlertEditorDocumentRepository(target.database.connection);
      for (const id of ["rule-routed", "rule-routed-default"]) {
        const document = await documents.find(id);
        if (document === null) throw new Error("Routed fixture document is required");
        await documents.save({ ...document, outputs: { browserSource: false, deviceRouteIds: ["route-stream"] } });
      }
      const previous = target.snapshotRepository.captureRestorePoint();
      let replacedRoute: ReturnType<SqliteAudioOutputRouteRepository["findById"]> = null;
      let replacedDocument: AlertEditorDocument | null = null;
      target.service = createRealService({
        database: target.database,
        updateConfig: async () => {
          replacedRoute = routes.findById("route-headphones");
          replacedDocument = await documents.find("rule-routed");
          throw new Error("Target config is locked");
        }
      }).service;
      const archive = await source.service.exportArchive();
      const preflight = await target.service.preflight(archive);

      await expect(target.service.restore({
        archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true
      })).rejects.toMatchObject({ code: "RESTORE_FAILED" });

      expect(replacedRoute).toEqual({ id: "route-headphones", name: "Headphones", deviceId: null, deviceLabel: null });
      expect(replacedDocument).toMatchObject({ outputs: { browserSource: false, deviceRouteIds: ["route-headphones"] } });
      expect(target.snapshotRepository.captureRestorePoint()).toEqual(previous);
      expect(routes.findById("route-headphones")).toEqual({
        id: "route-headphones", name: "Previous headphones", deviceId: "target-endpoint", deviceLabel: "Target headset"
      });
      for (const id of ["rule-routed", "rule-routed-default"]) {
        await expect(documents.find(id)).resolves.toMatchObject({ outputs: { browserSource: false, deviceRouteIds: ["route-stream"] } });
      }
    } finally {
      source.database.close();
      target.database.close();
    }
  });

  it("holds the maintenance gate across asynchronous backup work so route mutations cannot race restore", async () => {
    const gate = new RuntimeMaintenanceGate();
    const target = createRealService();
    let markBackupStarted!: () => void;
    let releaseBackup!: () => void;
    const backupStarted = new Promise<void>((resolve) => { markBackupStarted = resolve; });
    const backupReleased = new Promise<void>((resolve) => { releaseBackup = resolve; });
    try {
      await seedRoutedAlerts(target.database);
      target.service = createRealService({
        database: target.database,
        runExclusive: (work) => gate.runMaintenance(work),
        writeSafetyBackup: async () => {
          markBackupStarted();
          await backupReleased;
          return "C:/safe/pre-restore.streamjams-backup";
        }
      }).service;
      const archive = await target.service.exportArchive();
      const preflight = await target.service.preflight(archive);
      const restoring = target.service.restore({
        archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true
      });
      try {
        await backupStarted;
        expect(() => gate.runConfigurationMutation(() => target.database.connection.prepare(
          "UPDATE audio_output_routes SET name = 'Racing edit' WHERE id = 'route-headphones'"
        ).run())).toThrow(RuntimeMaintenanceUnavailableError);
        await expect(gate.runIntake(async () => undefined)).rejects.toBeInstanceOf(RuntimeMaintenanceUnavailableError);
      } finally {
        releaseBackup();
        await restoring;
      }
      expect(new SqliteAudioOutputRouteRepository(target.database.connection).findById("route-headphones"))
        .toEqual({ id: "route-headphones", name: "Headphones", deviceId: null, deviceLabel: null });
      expect(() => gate.runConfigurationMutation(() => undefined)).not.toThrow();
    } finally {
      target.database.close();
    }
  });

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

  it("preserves reward membership arrays and legacy exact conditions through export, preflight, and restore", async () => {
    const source = createRealService();
    const target = createRealService();
    const sharedRule = createRewardRule("rule-shared", {
      field: "channelPointReward",
      operator: "oneOf",
      value: ["reward-third", "reward-first", "reward-second"]
    });
    const legacyRule = createRewardRule("rule-legacy", {
      field: "channelPointReward",
      operator: "equals",
      value: "reward-legacy"
    });

    try {
      const sourceAlerts = new SqliteAlertRepository(source.database.connection);
      await sourceAlerts.saveRule(sharedRule);
      await sourceAlerts.saveRule(legacyRule);

      const archive = await source.service.exportArchive();
      const preflight = await target.service.preflight(archive);
      expect(preflight.state).toBe("valid");

      await target.service.restore({
        archive,
        archiveId: preflight.archiveId!,
        confirmation: "RESTORE",
        regenerateRouteKeys: true
      });

      const restoredAlerts = new SqliteAlertRepository(target.database.connection);
      await expect(restoredAlerts.findRuleById(sharedRule.id)).resolves.toEqual(sharedRule);
      await expect(restoredAlerts.findRuleById(legacyRule.id)).resolves.toEqual(legacyRule);
    } finally {
      source.database.close();
      target.database.close();
    }
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

  it("rechecks playback that starts after preflight before creating a safety backup or replacing data", async () => {
    const runtime = { intakeActive: false, playbackActive: false, queuedPlaybackCount: 0 };
    const writeSafetyBackup = vi.fn(async () => "C:/safe/pre-restore.streamjams-backup");
    const { service, replace } = createService({ runtime, writeSafetyBackup });
    const archive = await service.exportArchive();
    const preflight = await service.preflight(archive);
    expect(preflight.state).toBe("valid");
    runtime.playbackActive = true;

    await expect(service.restore({
      archive, archiveId: preflight.archiveId!, confirmation: "RESTORE", regenerateRouteKeys: true
    })).rejects.toMatchObject({ code: "RESTORE_LIVE_BLOCKED" });

    expect(writeSafetyBackup).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
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
      storage: { dataDirectory: "D:/other/data", assetDirectory: "D:/other/assets" },
      desktop: { closeToTray: false }
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
      playback: appConfig.playback,
      desktop: { closeToTray: false }
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
      reloadRuntimeConfiguration: () => { steps.push("reload"); }
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

  it("restores the previous app config when runtime reload fails after the restored config is written", async () => {
    let persistedConfig = appConfig;
    const updateConfig = vi.fn(async (patch: AppConfigUpdate): Promise<AppConfig> => {
      persistedConfig = appConfigSchema.parse({
        desktop: { ...persistedConfig.desktop, ...patch.desktop },
        server: { ...persistedConfig.server, ...patch.server },
        storage: { ...persistedConfig.storage, ...patch.storage },
        logging: { ...persistedConfig.logging, ...patch.logging },
        playback: { ...persistedConfig.playback, ...patch.playback }
      });
      return persistedConfig;
    });
    let reloadCount = 0;
    const { service } = createService({
      updateConfig,
      reloadRuntimeConfiguration: () => {
        reloadCount += 1;
        if (reloadCount === 1) throw new Error("reload failed");
      }
    });
    const archive = await service.exportArchive();
    const archivedConfig = appConfigSchema.parse(archive.configuration.appConfig);
    archive.configuration.appConfig = {
      ...archivedConfig,
      desktop: { closeToTray: false },
      server: { ...archivedConfig.server, port: 40123 }
    };
    archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
    const preflight = await service.preflight(archive);

    await expect(service.restore({
      archive,
      archiveId: preflight.archiveId!,
      confirmation: "RESTORE",
      regenerateRouteKeys: true
    })).rejects.toMatchObject({ code: "RESTORE_FAILED" });

    expect(updateConfig).toHaveBeenCalledTimes(2);
    expect(updateConfig.mock.calls[0]?.[0].desktop).toEqual({ closeToTray: false });
    expect(updateConfig.mock.calls[1]?.[0].desktop).toEqual({ closeToTray: true });
    expect(persistedConfig).toEqual(appConfig);
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

  it("canonicalizes blocked terms while restoring a validated moderation policy", async () => {
    const source = createRealService();
    const target = createRealService();
    try {
      const archive = await source.service.exportArchive();
      const [policy] = archive.configuration.tables.alert_moderation_settings ?? [];
      if (policy === undefined) throw new Error("Archived moderation policy is required");
      archive.configuration.tables.alert_moderation_settings = [{
        ...policy,
        rendered_blocked_terms_json: '["  Alpha  ","alpha","BETA"," beta "]',
        tts_blocked_terms_json: '["  TTS alpha  ","tts ALPHA"]'
      }];
      archive.manifest.configurationChecksum = ConfigurationBackupService.configurationChecksum(archive.configuration);
      const preflight = await target.service.preflight(archive);

      expect(preflight.state).toBe("valid");
      await expect(target.service.restore({
        archive,
        archiveId: preflight.archiveId!,
        confirmation: "RESTORE",
        regenerateRouteKeys: true
      })).resolves.toMatchObject({ state: "completed" });

      expect(target.moderationSettingsRepository.read()).toEqual({
        renderedText: { maxLength: 240, blockedTerms: ["Alpha", "BETA"], stripUrls: false },
        ttsText: { maxLength: 180, blockedTerms: ["TTS alpha"], stripUrls: true }
      });
      expect(target.database.connection.prepare(
        "SELECT rendered_blocked_terms_json, tts_blocked_terms_json FROM alert_moderation_settings WHERE id = 1"
      ).get()).toEqual({
        rendered_blocked_terms_json: '["Alpha","BETA"]',
        tts_blocked_terms_json: '["TTS alpha"]'
      });
      const rebackup = await target.service.exportArchive();
      expect(rebackup.configuration.tables.alert_moderation_settings).toEqual([{
        id: 1,
        rendered_max_length: 240,
        rendered_blocked_terms_json: '["Alpha","BETA"]',
        rendered_strip_urls: 0,
        tts_max_length: 180,
        tts_blocked_terms_json: '["TTS alpha"]',
        tts_strip_urls: 1
      }]);
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
  readonly runExclusive?: ConfigurationBackupServiceOptions["runExclusive"];
  readonly writeSafetyBackup?: ConfigurationBackupServiceOptions["safetyBackupStore"]["write"];
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
    safetyBackupStore: { write: overrides.writeSafetyBackup ?? (async () => "C:/safe/pre-restore.streamjams-backup") },
    regenerateOutput: async (_output, origin) => ({ label: "Landscape live", url: `${origin}/new-key` }),
    ...(overrides.reloadRuntimeConfiguration === undefined ? {} : { reloadRuntimeConfiguration: overrides.reloadRuntimeConfiguration }),
    ...(overrides.runExclusive === undefined ? {} : { runExclusive: overrides.runExclusive })
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

function createRewardRule(id: string, condition: AlertRule["conditions"][number]): AlertRule {
  return {
    id,
    name: id === "rule-shared" ? "Shared rewards" : "Legacy reward",
    eventType: "channel_point_redemption",
    enabled: false,
    collectionIds: ["set-default"],
    conditions: [condition],
    variants: [{
      id: `${id}-default`,
      name: "Default",
      enabled: false,
      weight: 1,
      visualAssetId: null,
      audioAssetId: null,
      textTemplate: "{userName} redeemed {rewardTitle}!",
      ttsConfig: null,
      durationMs: 5_000,
      layout: { x: 640, y: 760, width: 640, height: 180, zIndex: 10 }
    }],
    cooldownSeconds: 0,
    priority: 0
  };
}

async function seedRoutedAlerts(database: StreamJamsDatabase): Promise<void> {
  const routes = new SqliteAudioOutputRouteRepository(database.connection);
  routes.save({ id: "route-headphones", name: "Headphones", deviceId: "source-endpoint-headphones", deviceLabel: "Source headset" });
  routes.save({ id: "route-stream", name: "Stream mix", deviceId: "source-endpoint-stream", deviceLabel: "Source mixer" });
  await new SqliteAlertRepository(database.connection).saveRule(createRewardRule("rule-routed", {
    field: "channelPointReward", operator: "equals", value: "reward-routed"
  }));
  const documents = new SqliteAlertEditorDocumentRepository(database.connection);
  const document: AlertEditorDocument = {
    id: "rule-routed", setId: "set-default", providerKind: "twitch", eventType: "channel_point_redemption",
    kind: "default", parentAlertId: null, name: "Routed reward", enabled: false,
    conditions: [], variantConditions: [], weight: 1, priority: null,
    cooldownSeconds: 0, rulePriority: 0, durationMs: 5_000,
    outputs: { browserSource: false, deviceRouteIds: ["route-headphones"] }, layers: [],
    targetProfiles: [
      { id: "landscape", enabled: false, reviewState: "needs-review", layerLayouts: [] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  };
  await documents.save(document);
  await documents.save({
    ...document, id: "rule-routed-default", kind: "variation", parentAlertId: document.id,
    outputs: { browserSource: true, deviceRouteIds: ["route-stream", "route-headphones"] }
  });
}
