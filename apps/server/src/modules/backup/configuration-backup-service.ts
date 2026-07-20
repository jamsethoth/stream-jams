import { createHash } from "node:crypto";
import {
  appConfigSchema,
  configurationBackupLimits,
  configurationBackupArchiveSchema,
  currentConfigurationBackupArchiveVersion,
  configurationRestoreRequestSchema,
  legacyConfigurationBackupArchiveEnvelopeSchema,
  type ActionableManagementError,
  type AppConfig,
  type AppConfigUpdate,
  type AssetRecord,
  type AssetStorageWrite,
  type AssetValidationInput,
  type AssetValidationResult,
  type ConfigurationBackupArchive,
  type ConfigurationBackupOutput,
  type ConfigurationRestoreImpact,
  type ConfigurationRestorePreflight,
  type ConfigurationRestoreRequest,
  type ConfigurationRestoreResult
} from "@stream-jams/core";
import { RuntimeMaintenanceUnavailableError } from "./runtime-maintenance-gate.js";

type BackupConfiguration = ConfigurationBackupArchive["configuration"];
type SnapshotConfiguration = Omit<BackupConfiguration, "appConfig">;

export interface ConfigurationSnapshotRepository {
  snapshot(): SnapshotConfiguration;
  captureRestorePoint(): unknown;
  restoreRestorePoint(restorePoint: unknown): void;
  validate(configuration: BackupConfiguration): readonly string[];
  replace(input: {
    readonly tables: BackupConfiguration["tables"];
    readonly assets: readonly AssetRecord[];
  }): void;
}

export interface ConfigurationBackupServiceOptions {
  readonly appVersion: string;
  readonly schemaVersion: number;
  readonly now?: () => Date;
  readonly generateReferenceId: () => string;
  readonly configStore: {
    readConfig(): Promise<AppConfig>;
    updateConfig(patch: AppConfigUpdate): Promise<AppConfig>;
  };
  readonly snapshotRepository: ConfigurationSnapshotRepository;
  readonly assetRepository: { list(): Promise<readonly AssetRecord[]> };
  readonly assetStore: {
    read(storagePath: string): Promise<Buffer>;
    write(input: AssetStorageWrite): Promise<{ readonly storagePath: string }>;
    delete(storagePath: string): Promise<void>;
  };
  readonly assetValidator: { validate(input: AssetValidationInput): AssetValidationResult };
  readonly getRuntime: () => Promise<{
    readonly intakeActive: boolean;
    readonly playbackActive: boolean;
    readonly queuedPlaybackCount: number;
  }>;
  readonly getAvailableBytes: () => Promise<number>;
  readonly safetyBackupStore: { write(archive: ConfigurationBackupArchive): Promise<string> };
  readonly regenerateOutput: (output: ConfigurationBackupOutput, origin: string) => Promise<{ readonly label: string; readonly url: string }>;
  readonly twitchCredentials?: {
    findConnectedAccountId(): Promise<string | null>;
    deleteTokenSecrets(accountId: string): Promise<void>;
  };
  readonly runExclusive?: <T>(work: () => Promise<T>) => Promise<T>;
}

export class ConfigurationRestoreBlockedError extends Error {
  constructor(
    readonly code: "RESTORE_PREFLIGHT_REQUIRED" | "RESTORE_CHANGED" | "RESTORE_LIVE_BLOCKED" | "SAFETY_BACKUP_FAILED" | "RESTORE_FAILED",
    readonly actionableError: ActionableManagementError,
    options: ErrorOptions = {}
  ) {
    super(actionableError.summary, options);
    this.name = "ConfigurationRestoreBlockedError";
  }
}

export class ConfigurationBackupService {
  readonly #options: ConfigurationBackupServiceOptions;
  readonly #now: () => Date;

  constructor(options: ConfigurationBackupServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  static configurationChecksum(configuration: BackupConfiguration): string {
    return checksum(canonicalJson(configuration));
  }

  async summary() {
    const runtime = await this.#options.getRuntime();
    const live = runtime.intakeActive || runtime.playbackActive || runtime.queuedPlaybackCount > 0;
    const appConfig = await this.#options.configStore.readConfig();
    const common = {
      appVersion: this.#options.appVersion,
      schemaVersion: this.#options.schemaVersion,
      dataDirectory: appConfig.storage.dataDirectory,
      assetDirectory: appConfig.storage.assetDirectory,
      logLevel: appConfig.logging.level,
      logRetentionHours: appConfig.logging.retentionHours,
      secretExclusions: ["Provider credentials and tokens", "Overlay route keys and hashes", "Runtime logs and sessions"]
    };
    try {
      const archive = await this.exportArchive();
      return {
        ...common,
        state: live ? "blocked-live" as const : "ready" as const,
        configurationRecordCount: archive.manifest.configurationRecordCount,
        assetCount: archive.manifest.assetCount,
        totalAssetBytes: archive.manifest.totalAssetBytes,
        blockers: live ? [liveBlocker(runtime)] : []
      };
    } catch (cause) {
      return {
        ...common,
        state: "invalid" as const,
        configurationRecordCount: 0,
        assetCount: 0,
        totalAssetBytes: 0,
        blockers: [{
          summary: "Configuration backup is not ready",
          cause: cause instanceof Error ? cause.message : "Configuration or asset validation failed.",
          nextStep: "Open Diagnostics, repair missing or invalid configuration and assets, then try export again.",
          severity: "error" as const,
          occurredAt: this.#now().toISOString(),
          referenceId: this.#options.generateReferenceId(),
          correction: { label: "Open Diagnostics", route: "/manage/diagnostics" }
        }]
      };
    }
  }

  async exportArchive(): Promise<ConfigurationBackupArchive> {
    const [appConfig, snapshot, records] = await Promise.all([
      this.#options.configStore.readConfig(),
      Promise.resolve(this.#options.snapshotRepository.snapshot()),
      this.#options.assetRepository.list()
    ]);
    const registeredAssetBytes = records.reduce((total, record) => total + record.sizeBytes, 0);
    const minimumEncodedArchiveBytes = Math.ceil(registeredAssetBytes / 3) * 4 + Buffer.byteLength(JSON.stringify({
      appConfig,
      snapshot,
      assetMetadata: records.map((record) => ({
        id: record.id,
        originalFileName: record.originalFileName,
        mediaType: record.mediaType,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        checksum: record.checksum
      }))
    }), "utf8");
    if (
      records.length > configurationBackupLimits.maxAssetCount ||
      registeredAssetBytes > configurationBackupLimits.maxTotalAssetBytes ||
      minimumEncodedArchiveBytes > configurationBackupLimits.maxArchiveBytes
    ) {
      throw new Error("Registered assets exceed the supported in-process backup size. Remove unused assets, then try export again.");
    }
    const assets = await mapWithConcurrency(records, 4, async (record) => {
      const bytes = await this.#options.assetStore.read(record.storagePath);
      const actualChecksum = checksum(bytes);
      if (bytes.byteLength !== record.sizeBytes || actualChecksum !== record.checksum) {
        throw new Error(`Registered asset "${record.id}" does not match its metadata`);
      }
      const validation = this.#options.assetValidator.validate({
        originalFileName: record.originalFileName,
        mimeType: record.mimeType,
        sizeBytes: bytes.byteLength,
        bytes
      });
      if (!validation.accepted || validation.mediaType !== record.mediaType) {
        throw new Error(`Registered asset "${record.id}" is invalid: ${validation.reason ?? "media type mismatch"}`);
      }
      return {
        id: record.id,
        filename: record.originalFileName,
        mediaType: record.mediaType,
        mimeType: record.mimeType,
        sizeBytes: bytes.byteLength,
        checksum: actualChecksum,
        dataBase64: bytes.toString("base64")
      };
    });
    const totalAssetBytes = assets.reduce((total, item) => total + item.sizeBytes, 0);
    if (assets.length > configurationBackupLimits.maxAssetCount || totalAssetBytes > configurationBackupLimits.maxTotalAssetBytes) {
      throw new Error("Registered assets exceed the supported in-process backup size. Remove unused assets, then try export again.");
    }
    const configuration: BackupConfiguration = {
      appConfig: { ...appConfig },
      tables: snapshot.tables,
      providerReconnectMetadata: snapshot.providerReconnectMetadata,
      overlayOutputs: snapshot.overlayOutputs
    };
    const configurationErrors = this.#options.snapshotRepository.validate(configuration);
    if (configurationErrors.length > 0) {
      throw new Error(`Configuration cannot be exported: ${configurationErrors.join(" ")}`);
    }
    const archive = {
      manifest: {
        format: "stream-jams-backup" as const,
        archiveVersion: currentConfigurationBackupArchiveVersion,
        appVersion: this.#options.appVersion,
        schemaVersion: this.#options.schemaVersion,
        createdAt: this.#now().toISOString(),
        configurationChecksum: ConfigurationBackupService.configurationChecksum(configuration),
        configurationRecordCount: countConfigurationRecords(configuration.tables),
        assetCount: assets.length,
        totalAssetBytes
      },
      configuration,
      assets
    };
    const parsedArchive = configurationBackupArchiveSchema.parse(archive);
    if (Buffer.byteLength(JSON.stringify(parsedArchive), "utf8") > configurationBackupLimits.maxArchiveBytes) {
      throw new Error("The encoded backup exceeds the supported in-process archive size. Remove unused assets, then try export again.");
    }
    return parsedArchive;
  }

  async preflight(input: unknown): Promise<ConfigurationRestorePreflight> {
    const runtime = await this.#options.getRuntime();
    const parsed = configurationBackupArchiveSchema.safeParse(input);
    if (!parsed.success) {
      if (legacyConfigurationBackupArchiveEnvelopeSchema.safeParse(input).success) {
        return {
          state: "invalid",
          archiveId: null,
          appVersion: null,
          schemaVersion: null,
          createdAt: null,
          impact: null,
          runtime,
          blockers: [blocker(
            "Backup variant order was not captured",
            "Archive version 1 did not preserve saved alert variant order and cannot be restored safely.",
            "Export a new backup from the source installation."
          )],
          warnings: []
        };
      }
      return {
        state: "invalid",
        archiveId: null,
        appVersion: null,
        schemaVersion: null,
        createdAt: null,
        impact: null,
        runtime,
        blockers: parsed.error.issues.map((issue) => blocker(
          "Backup archive is invalid",
          issue.message,
          "Choose an unmodified .streamjams-backup file exported by a supported Stream Jams version."
        )),
        warnings: []
      };
    }

    const archive = parsed.data;
    const blockers: ActionableManagementError[] = [];
    const warnings: ActionableManagementError[] = [];
    if (archive.manifest.schemaVersion !== this.#options.schemaVersion) {
      blockers.push(blocker(
        "Backup schema is not supported",
        `This backup uses schema ${archive.manifest.schemaVersion}; this app requires schema ${this.#options.schemaVersion}.`,
        "Open the backup with a compatible Stream Jams version, then export it again."
      ));
    }
    if (!appConfigSchema.safeParse(archive.configuration.appConfig).success) {
      blockers.push(blocker("Backup preferences are invalid", "The application preferences do not match the supported schema.", "Export a new backup from the source installation."));
    }
    if (ConfigurationBackupService.configurationChecksum(archive.configuration) !== archive.manifest.configurationChecksum) {
      blockers.push(blocker("Backup configuration checksum does not match", "The configuration content was changed or damaged after export.", "Export the backup again and do not edit its contents."));
    }
    if (countConfigurationRecords(archive.configuration.tables) !== archive.manifest.configurationRecordCount) {
      blockers.push(blocker("Backup configuration count does not match", "The manifest does not describe the configuration records in the archive.", "Export the backup again."));
    }
    blockers.push(...this.#options.snapshotRepository.validate(archive.configuration).map((cause) =>
      blocker("Backup configuration record is invalid", cause, "Export a new backup from a supported Stream Jams version.")
    ));

    const assetIds = new Set<string>();
    const assetMetadata = new Map(
      (archive.configuration.tables.asset_metadata ?? []).map((row) => [String(row.id), row])
    );
    let totalAssetBytes = 0;
    for (const asset of archive.assets) {
      if (assetIds.has(asset.id)) {
        blockers.push(blocker("Backup contains duplicate assets", `Asset ID "${asset.id}" appears more than once.`, "Export the backup again."));
        continue;
      }
      assetIds.add(asset.id);
      const metadata = assetMetadata.get(asset.id);
      if (
        metadata === undefined ||
        metadata.original_file_name !== asset.filename ||
        metadata.media_type !== asset.mediaType ||
        metadata.mime_type !== asset.mimeType ||
        Number(metadata.size_bytes) !== asset.sizeBytes ||
        metadata.checksum !== asset.checksum
      ) {
        blockers.push(blocker("Backup asset metadata does not match", `Asset "${asset.filename}" does not match its configuration record.`, "Export the backup again."));
      }
      const bytes = Buffer.from(asset.dataBase64, "base64");
      totalAssetBytes += bytes.byteLength;
      if (bytes.byteLength !== asset.sizeBytes || checksum(bytes) !== asset.checksum) {
        blockers.push(blocker("Backup asset checksum does not match", `Asset "${asset.filename}" is missing bytes or was changed after export.`, "Export the backup again and do not modify the archive."));
        continue;
      }
      const validation = this.#options.assetValidator.validate({
        originalFileName: asset.filename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        bytes
      });
      if (!validation.accepted || validation.mediaType !== asset.mediaType) {
        blockers.push(blocker("Backup asset is invalid", `Asset "${asset.filename}" failed validation: ${validation.reason ?? "media type mismatch"}.`, "Replace the source asset and export the backup again."));
      }
    }
    if (archive.assets.length !== archive.manifest.assetCount || totalAssetBytes !== archive.manifest.totalAssetBytes) {
      blockers.push(blocker("Backup asset totals do not match", "The manifest does not describe the asset content in the archive.", "Export the backup again."));
    }
    if (assetMetadata.size !== archive.assets.length) {
      blockers.push(blocker("Backup asset records are incomplete", "The configuration and archive contain different asset sets.", "Export the backup again."));
    }
    const availableBytes = await this.#options.getAvailableBytes();
    if (archive.manifest.totalAssetBytes > availableBytes) {
      blockers.push(blocker("Not enough storage space", `Restore needs ${archive.manifest.totalAssetBytes} bytes but only ${availableBytes} bytes are available.`, "Free storage space or move the Stream Jams asset folder, then validate again."));
    }
    if (archive.manifest.appVersion !== this.#options.appVersion) {
      warnings.push(warning("Backup came from another app version", `The backup was exported by Stream Jams ${archive.manifest.appVersion}.`, "Review the restore summary before continuing."));
    }
    if (archive.configuration.providerReconnectMetadata.length > 0) {
      warnings.push(warning("Providers must reconnect after restore", "Credentials and tokens are intentionally excluded from backups.", "Reconnect each listed provider after restore."));
    }
    if (archive.configuration.overlayOutputs.length > 0) {
      warnings.push(warning("Browser-source URLs will change", "Overlay route keys are intentionally excluded and will be regenerated.", "Update the affected browser-source URLs in OBS after restore."));
    }
    warnings.push(warning("Restart Stream Jams after restore", "Server and logging preferences are written to local configuration while the current process remains active.", "Restart Stream Jams after completing provider and browser-source follow-up."));

    const impact = restoreImpact(archive);
    const archiveId = checksum(canonicalJson(archive));
    if (blockers.length > 0) {
      return { state: "invalid", archiveId, appVersion: archive.manifest.appVersion, schemaVersion: archive.manifest.schemaVersion, createdAt: archive.manifest.createdAt, impact, runtime, blockers, warnings };
    }
    if (runtime.intakeActive || runtime.playbackActive || runtime.queuedPlaybackCount > 0) {
      return { state: "blocked-live", archiveId, appVersion: archive.manifest.appVersion, schemaVersion: archive.manifest.schemaVersion, createdAt: archive.manifest.createdAt, impact, runtime, blockers: [liveBlocker(runtime)], warnings };
    }
    return { state: "valid", archiveId, appVersion: archive.manifest.appVersion, schemaVersion: archive.manifest.schemaVersion, createdAt: archive.manifest.createdAt, impact, runtime, blockers: [], warnings };
  }

  async restore(requestInput: ConfigurationRestoreRequest): Promise<ConfigurationRestoreResult> {
    const request = configurationRestoreRequestSchema.parse(requestInput);
    const runExclusive = this.#options.runExclusive ?? (async <T>(work: () => Promise<T>) => work());
    try {
      return await runExclusive(() => this.#restore(request));
    } catch (error) {
      if (error instanceof RuntimeMaintenanceUnavailableError) {
        throw this.#restoreError("RESTORE_LIVE_BLOCKED", "Restore is blocked while an event is being processed", error.message, "Wait for event processing to finish, then validate the backup again.", error);
      }
      throw error;
    }
  }

  async #restore(request: ConfigurationRestoreRequest): Promise<ConfigurationRestoreResult> {
    const preflight = await this.preflight(request.archive);
    if (preflight.archiveId !== request.archiveId) {
      throw this.#restoreError("RESTORE_CHANGED", "The selected backup changed after validation", "Its content no longer matches the validated archive.", "Validate the backup again before restoring.");
    }
    if (preflight.state === "blocked-live") {
      throw new ConfigurationRestoreBlockedError("RESTORE_LIVE_BLOCKED", preflight.blockers[0] ?? liveBlocker(preflight.runtime));
    }
    if (preflight.state !== "valid" || preflight.impact === null) {
      throw this.#restoreError("RESTORE_PREFLIGHT_REQUIRED", "Backup restore is not ready", "The backup has not passed validation.", "Resolve every validation blocker, then validate again.");
    }

    const runtime = await this.#options.getRuntime();
    if (runtime.intakeActive || runtime.playbackActive || runtime.queuedPlaybackCount > 0) {
      throw new ConfigurationRestoreBlockedError("RESTORE_LIVE_BLOCKED", liveBlocker(runtime));
    }

    const connectedTwitchAccountId = await this.#options.twitchCredentials?.findConnectedAccountId() ?? null;
    const restorePoint = this.#options.snapshotRepository.captureRestorePoint();
    const currentAssets = await this.#options.assetRepository.list();
    let safetyBackupPath: string;
    try {
      safetyBackupPath = await this.#options.safetyBackupStore.write(await this.exportArchive());
    } catch (cause) {
      throw this.#restoreError("SAFETY_BACKUP_FAILED", "Safety backup could not be created", cause instanceof Error ? cause.message : "The backup location could not be written.", "Check storage permissions and free space, then try restore again.", cause);
    }

    const stagedAssets: AssetRecord[] = [];
    const restoredConfig = appConfigSchema.parse(request.archive.configuration.appConfig);
    try {
      for (const asset of request.archive.assets) {
        const bytes = Buffer.from(asset.dataBase64, "base64");
        const validation = this.#options.assetValidator.validate({
          originalFileName: asset.filename,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          bytes
        });
        if (!validation.accepted || validation.mediaType === null || validation.normalizedExtension === null) {
          throw new Error(`Asset "${asset.filename}" failed staging validation`);
        }
        const stored = await this.#options.assetStore.write({
          assetId: asset.id,
          originalFileName: asset.filename,
          mediaType: validation.mediaType,
          normalizedExtension: validation.normalizedExtension,
          storageVersion: `restore_${request.archiveId.slice(7, 19)}`,
          bytes
        });
        stagedAssets.push({
          id: asset.id,
          originalFileName: asset.filename,
          mediaType: asset.mediaType,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          checksum: asset.checksum,
          storagePath: stored.storagePath
        });
      }

      this.#options.snapshotRepository.replace({ tables: request.archive.configuration.tables, assets: stagedAssets });
      await this.#options.configStore.updateConfig({ server: restoredConfig.server, logging: restoredConfig.logging });
    } catch (cause) {
      let rollbackFailure: unknown;
      try {
        this.#options.snapshotRepository.restoreRestorePoint(restorePoint);
      } catch (error) {
        rollbackFailure = error;
      }
      const cleanupFailures = settledFailures(
        await Promise.allSettled(stagedAssets.map((record) => this.#options.assetStore.delete(record.storagePath)))
      );
      const failureDetails = [
        cause instanceof Error ? cause.message : "Configuration replacement did not complete.",
        ...(rollbackFailure === undefined ? [] : [`Operational database rollback also failed: ${errorMessage(rollbackFailure)}`]),
        ...(cleanupFailures.length === 0 ? [] : [`${cleanupFailures.length} staged asset file(s) could not be removed.`])
      ];
      throw this.#restoreError(
        "RESTORE_FAILED",
        "Configuration restore failed",
        failureDetails.join(" "),
        rollbackFailure === undefined
          ? `The previous database state was restored. Resolve the reported cause, then validate and retry. Safety backup: ${safetyBackupPath}.`
          : `Stop Stream Jams and preserve its data directory. Use the reference ID with Diagnostics before attempting manual recovery from ${safetyBackupPath}.`,
        cause
      );
    }

    const regeneratedOutputs: { label: string; url: string }[] = [];
    const warnings = [...preflight.warnings];
    const oldAssetCleanupFailures = settledFailures(await Promise.allSettled(
      currentAssets
        .filter((current) => !stagedAssets.some((staged) => staged.storagePath === current.storagePath))
        .map((record) => this.#options.assetStore.delete(record.storagePath))
    ));
    if (oldAssetCleanupFailures.length > 0) {
      warnings.push({
        ...warning(
          "Old asset files could not be removed",
          `${oldAssetCleanupFailures.length} superseded asset file(s) remain in local storage.`,
          "Open Diagnostics with the reference ID, close any app using the files, then remove the reported orphaned files."
        ),
        referenceId: this.#options.generateReferenceId(),
        correction: { label: "Open Diagnostics", route: "/manage/diagnostics" }
      });
    }
    if (connectedTwitchAccountId !== null && this.#options.twitchCredentials !== undefined) {
      try {
        await this.#options.twitchCredentials.deleteTokenSecrets(connectedTwitchAccountId);
      } catch {
        warnings.push({
          ...warning(
            "Old Twitch credentials could not be removed",
            "The restored configuration is disconnected, but an orphaned local Twitch credential may remain.",
            "Open Diagnostics with the reference ID, then reconnect Twitch."
          ),
          referenceId: this.#options.generateReferenceId(),
          correction: { label: "Open Diagnostics", route: "/manage/diagnostics" }
        });
      }
    }
    const restoredOrigin = `http://${restoredConfig.server.host}:${restoredConfig.server.port}`;
    for (const output of request.archive.configuration.overlayOutputs) {
      try {
        regeneratedOutputs.push(await this.#options.regenerateOutput(output, restoredOrigin));
      } catch (cause) {
        warnings.push({
          ...warning("A browser-source URL was not regenerated", cause instanceof Error ? cause.message : "Route-key creation failed.", "Open Alert sets, regenerate the affected browser-source URL, and update OBS."),
          referenceId: this.#options.generateReferenceId(),
          correction: { label: "Open browser sources", route: "/manage/modules/alerts#browser-sources" }
        });
      }
    }

    return {
      state: "completed",
      safetyBackupPath,
      restored: preflight.impact,
      regeneratedOutputs,
      reconnectProviders: request.archive.configuration.providerReconnectMetadata.map((provider) => provider.name),
      warnings
    };
  }

  #restoreError(
    code: ConfigurationRestoreBlockedError["code"],
    summary: string,
    cause: string,
    nextStep: string,
    errorCause?: unknown
  ): ConfigurationRestoreBlockedError {
    return new ConfigurationRestoreBlockedError(code, {
      summary,
      cause,
      nextStep,
      severity: "error",
      occurredAt: this.#now().toISOString(),
      referenceId: this.#options.generateReferenceId(),
      correction: { label: "Open Settings", route: "/manage/settings#backup-restore" }
    }, errorCause === undefined ? {} : { cause: errorCause });
  }
}

function settledFailures(results: readonly PromiseSettledResult<unknown>[]): readonly unknown[] {
  return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  map: (item: T) => Promise<R>
): Promise<readonly R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function restoreImpact(archive: ConfigurationBackupArchive): ConfigurationRestoreImpact {
  return {
    configurationRecords: archive.manifest.configurationRecordCount,
    providers: archive.configuration.providerReconnectMetadata.length,
    alertSets: archive.configuration.tables.alert_collections?.length ?? 0,
    assets: archive.manifest.assetCount,
    preferences: 1,
    browserOutputs: archive.configuration.overlayOutputs.length
  };
}

function countConfigurationRecords(tables: BackupConfiguration["tables"]): number {
  return Object.values(tables).reduce((total, rows) => total + rows.length, 0);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortJson(nested)]));
}

function checksum(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function blocker(summary: string, cause: string, nextStep: string): ActionableManagementError {
  return { summary, cause, nextStep, severity: "error", occurredAt: null, referenceId: null, correction: null };
}

function warning(summary: string, cause: string, nextStep: string): ActionableManagementError {
  return { summary, cause, nextStep, severity: "warning", occurredAt: null, referenceId: null, correction: null };
}

function liveBlocker(runtime: { readonly intakeActive: boolean; readonly playbackActive: boolean; readonly queuedPlaybackCount: number }): ActionableManagementError {
  const active = [runtime.intakeActive ? "event intake" : null, runtime.playbackActive ? "current playback" : null, runtime.queuedPlaybackCount > 0 ? `${runtime.queuedPlaybackCount} queued playback item${runtime.queuedPlaybackCount === 1 ? "" : "s"}` : null].filter((item): item is string => item !== null);
  return blocker("Restore is blocked while Stream Jams is live", `Active runtime state: ${active.join(", ")}.`, "Stop live event intake and wait for current and queued playback to finish, then validate again.");
}
