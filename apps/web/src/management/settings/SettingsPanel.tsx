import {
  configurationBackupArchiveSchema,
  configurationBackupLimits,
  type ActionableManagementError,
  type ConfigurationBackupArchive,
  type ConfigurationBackupSummary,
  type ConfigurationRestorePreflight,
  type ConfigurationRestoreResult
} from "@stream-jams/core";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { MaskedValue } from "../foundation/MaskedValue.js";
import { ThemeSwitcher } from "../foundation/ThemeSwitcher.js";
import type { ManagementApi, ServerConfigView } from "../management-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import "./settings-panel.css";

type SettingsApi = Pick<
  ManagementApi,
  "getServerConfig" | "updateServerConfig" | "getConfigurationBackupSummary" | "exportConfigurationBackup" | "preflightConfigurationRestore" | "restoreConfiguration"
>;

export interface SettingsPanelProps {
  readonly managementApi: SettingsApi;
}

const defaultServerConfig: ServerConfigView = { host: "127.0.0.1", port: 39187 };

export function SettingsPanel({ managementApi }: SettingsPanelProps) {
  const [savedConfig, setSavedConfig] = useState(defaultServerConfig);
  const [configDraft, setConfigDraft] = useState(defaultServerConfig);
  const [summary, setSummary] = useState<ConfigurationBackupSummary | null>(null);
  const [archive, setArchive] = useState<ConfigurationBackupArchive | null>(null);
  const [archiveName, setArchiveName] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<ConfigurationRestorePreflight | null>(null);
  const [restoreResult, setRestoreResult] = useState<ConfigurationRestoreResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ActionableManagementError | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([managementApi.getServerConfig(), managementApi.getConfigurationBackupSummary()])
      .then(([serverConfig, backupSummary]) => {
        if (!active) return;
        setSavedConfig(serverConfig);
        setConfigDraft(serverConfig);
        setSummary(backupSummary);
      })
      .catch((cause: unknown) => {
        if (active) setError(actionable("Settings could not be loaded", cause, "Refresh the page and try again."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [managementApi]);

  useEffect(() => {
    if (loading || window.location.hash !== "#backup-restore") return;
    document.getElementById("backup-restore")?.scrollIntoView({ block: "start" });
  }, [loading]);

  const serverDirty = savedConfig.host !== configDraft.host || savedConfig.port !== configDraft.port;

  const saveServer = useCallback(async () => {
    const saved = await managementApi.updateServerConfig(configDraft);
    setSavedConfig(saved);
    setConfigDraft(saved);
  }, [configDraft, managementApi]);

  const discard = useCallback(() => {
    setConfigDraft(savedConfig);
    setArchive(null);
    setArchiveName(null);
    setPreflight(null);
    setRestoreResult(null);
    setConfirmation("");
  }, [savedConfig]);

  useDirtyNavigationSource({
    id: "settings",
    dirty: serverDirty || archive !== null,
    summary: archive === null ? "Server settings have unsaved changes." : "A configuration backup is selected for restore.",
    save: archive === null && serverDirty ? saveServer : null,
    discard
  });

  async function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveServer();
      setNotice("Server settings saved. Restart Stream Jams if the port changed.");
    } catch (cause) {
      setError(actionable("Server settings were not saved", cause, "Check the port and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function exportBackup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const exported = await managementApi.exportConfigurationBackup();
      downloadArchive(exported);
      setNotice(`Backup exported with ${exported.manifest.configurationRecordCount} configuration records and ${exported.manifest.assetCount} assets.`);
    } catch (cause) {
      setError(actionable("Backup was not exported", cause, "Check Diagnostics and storage health, then try again."));
    } finally {
      setBusy(false);
    }
  }

  async function chooseArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setArchive(null);
    setArchiveName(file?.name ?? null);
    setPreflight(null);
    setRestoreResult(null);
    setConfirmation("");
    setNotice(null);
    setError(null);
    if (file === undefined) return;
    if (file.size > configurationBackupLimits.maxArchiveBytes) {
      setError(actionable(
        "Backup file is too large",
        `The selected file exceeds the ${formatBytes(configurationBackupLimits.maxArchiveBytes)} restore limit.`,
        "Remove unused assets in the source installation, export a smaller backup, and try again."
      ));
      return;
    }

    setBusy(true);
    try {
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const parsedArchive = configurationBackupArchiveSchema.safeParse(parsedJson);
      if (!parsedArchive.success) {
        setError(actionable("Backup file is invalid", parsedArchive.error.issues[0]?.message ?? "The archive structure is not supported.", "Choose an unmodified .streamjams-backup file."));
        return;
      }
      setArchive(parsedArchive.data);
      setPreflight(await managementApi.preflightConfigurationRestore(parsedArchive.data));
    } catch (cause) {
      setError(actionable("Backup file could not be read", cause, "Choose an unmodified .streamjams-backup file and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function restoreConfiguration() {
    if (archive === null || preflight?.state !== "valid" || preflight.archiveId === null || confirmation !== "RESTORE") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await managementApi.restoreConfiguration({
        archive,
        archiveId: preflight.archiveId,
        confirmation: "RESTORE",
        regenerateRouteKeys: true
      });
      setRestoreResult(result);
      setArchive(null);
      setArchiveName(null);
      setPreflight(null);
      setConfirmation("");
      setNotice("Configuration restored. Complete the follow-up actions before going live.");
      setSummary(await managementApi.getConfigurationBackupSummary());
    } catch (cause) {
      setError(actionable("Configuration was not restored", cause, "Resolve the reported failure, validate the backup again, and retry."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="management-empty" role="status">Loading settings...</p>;

  return (
    <section aria-labelledby="settings-title" className="settings-page">
      <header className="settings-page__header">
        <div><h2 id="settings-title">Settings</h2><p>Local application preferences, storage, diagnostics retention, and configuration recovery.</p></div>
        {summary === null ? null : <span className="settings-page__version">Stream Jams {summary.appVersion} · Schema {summary.schemaVersion}</span>}
      </header>

      {error === null ? null : <ManagementErrorBanner error={error} />}
      {notice === null ? null : <p className="settings-page__notice" role="status">{notice}</p>}

      <section aria-labelledby="appearance-heading" className="settings-page__section">
        <div className="settings-page__section-heading"><div><h3 id="appearance-heading">Appearance</h3><p>Choose how the management interface is displayed on this device.</p></div></div>
        <ThemeSwitcher />
      </section>

      <section aria-labelledby="server-heading" className="settings-page__section">
        <div className="settings-page__section-heading"><div><h3 id="server-heading">Local server</h3><p>Management and browser-source traffic remains bound to this computer.</p></div></div>
        <form className="settings-page__form" onSubmit={submitServer}>
          <label><span>Host</span><input disabled readOnly value={configDraft.host} /></label>
          <label><span>Port</span><input min={1} max={65535} onChange={(event) => setConfigDraft({ ...configDraft, port: Number(event.currentTarget.value) })} type="number" value={configDraft.port} /></label>
          <button disabled={busy || !serverDirty} type="submit">Save server settings</button>
        </form>
      </section>

      {summary === null ? null : (
        <section aria-labelledby="storage-heading" className="settings-page__section">
          <div className="settings-page__section-heading"><div><h3 id="storage-heading">Data and diagnostics</h3><p>Current storage locations and bounded log-retention policy.</p></div></div>
          <dl className="settings-page__facts">
            <div><dt>Data folder</dt><dd>{summary.dataDirectory}</dd></div>
            <div><dt>Asset folder</dt><dd>{summary.assetDirectory}</dd></div>
            <div><dt>Log level</dt><dd>{summary.logLevel}</dd></div>
            <div><dt>Log retention</dt><dd>{formatHours(summary.logRetentionHours)}</dd></div>
          </dl>
        </section>
      )}

      <section aria-labelledby="backup-heading" className="settings-page__section" id="backup-restore">
        <div className="settings-page__section-heading settings-page__section-heading--action">
          <div><h3 id="backup-heading">Backup and restore</h3><p>Move complete local configuration and assets without exporting credentials or route keys.</p></div>
          <button disabled={busy || summary?.state === "invalid"} onClick={() => void exportBackup()} type="button">Export backup</button>
        </div>
        {summary === null ? null : (
          <div className="settings-page__backup-summary">
            <strong>{summary.configurationRecordCount} configuration records · {summary.assetCount} assets · {formatBytes(summary.totalAssetBytes)}</strong>
            <span>Excluded: {summary.secretExclusions.join(", ")}</span>
          </div>
        )}
        {summary?.blockers.map((blocker) => <ManagementErrorBanner error={blocker} key={`${blocker.summary}-${blocker.referenceId ?? "none"}`} />)}

        <div className="settings-page__restore">
          <label className="settings-page__file"><span>Backup file</span><input accept=".streamjams-backup,application/json" disabled={busy} onChange={(event) => void chooseArchive(event)} type="file" /></label>
          {archiveName === null ? <p>No backup selected.</p> : <p><strong>{archiveName}</strong>{busy ? " · Validating..." : ""}</p>}

          {preflight?.impact === null || preflight?.impact === undefined ? null : <RestoreImpact impact={preflight.impact} />}
          {preflight?.blockers.map((blocker) => <ManagementErrorBanner error={blocker} key={`${blocker.summary}-${blocker.nextStep}`} />)}
          {preflight?.warnings.map((warning) => <ManagementErrorBanner error={warning} key={`${warning.summary}-${warning.nextStep}`} />)}

          <label className="settings-page__confirmation"><span>Type RESTORE to confirm</span><input autoComplete="off" disabled={preflight?.state !== "valid" || busy} onChange={(event) => setConfirmation(event.currentTarget.value)} value={confirmation} /></label>
          <label className="settings-page__route-key-option"><input checked disabled readOnly type="checkbox" /> Regenerate overlay route keys and browser-source URLs</label>
          <button className="button button--danger" disabled={busy || preflight?.state !== "valid" || confirmation !== "RESTORE"} onClick={() => void restoreConfiguration()} type="button">Restore configuration</button>
        </div>
      </section>

      {restoreResult === null ? null : <RestoreCompletion result={restoreResult} />}
    </section>
  );
}

function RestoreImpact({ impact }: { readonly impact: NonNullable<ConfigurationRestorePreflight["impact"]> }) {
  return (
    <section aria-label="Restore impact" className="settings-page__impact">
      <h4>Restore impact</h4>
      <ul>
        <li>{countLabel(impact.alertSets, "alert set")}</li>
        <li>{countLabel(impact.providers, "provider")}</li>
        <li>{countLabel(impact.assets, "asset")}</li>
        <li>{countLabel(impact.browserOutputs, "browser output")}</li>
      </ul>
    </section>
  );
}

function RestoreCompletion({ result }: { readonly result: ConfigurationRestoreResult }) {
  return (
    <section aria-labelledby="restore-complete-heading" className="settings-page__completion">
      <h3 id="restore-complete-heading">Restore complete</h3>
      <p>Safety backup: <code>{result.safetyBackupPath}</code></p>
      {result.regeneratedOutputs.length === 0 ? null : (
        <div><h4>Update browser-source URLs</h4>{result.regeneratedOutputs.map((output) => <MaskedValue key={output.label} label={`${output.label} browser-source URL`} value={output.url} />)}</div>
      )}
      {result.reconnectProviders.length === 0 ? null : (
        <div><h4>Reconnect providers</h4><ul>{result.reconnectProviders.map((provider) => <li key={provider}>Reconnect {provider}</li>)}</ul></div>
      )}
      {result.warnings.map((warning) => <ManagementErrorBanner error={warning} key={`${warning.summary}-${warning.referenceId ?? "none"}`} />)}
    </section>
  );
}

function downloadArchive(archive: ConfigurationBackupArchive): void {
  if (typeof URL.createObjectURL !== "function") throw new Error("This browser cannot create local downloads.");
  const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stream-jams-${archive.manifest.createdAt.slice(0, 10)}.streamjams-backup`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function actionable(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  return {
    summary,
    cause: cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "The operation did not complete.",
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId: readReferenceId(cause),
    correction: null
  };
}

function readReferenceId(cause: unknown): string | null {
  if (!(cause instanceof Error)) return null;
  return /\b(?:ref|err)_[A-Za-z0-9_-]+\b/u.exec(cause.message)?.[0] ?? null;
}

function formatHours(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
