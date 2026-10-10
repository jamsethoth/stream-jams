import { Button, Checkbox, Group, TextInput } from "@mantine/core";
import {
  configurationBackupArchiveSchema,
  configurationBackupLimits,
  type ActionableManagementError,
  type ConfigurationBackupArchive,
  type ConfigurationBackupSummary,
  type ConfigurationRestorePreflight,
  type ConfigurationRestoreResult
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AudioOutputsPanel, type AudioOutputsPanelHandle } from "../audio/AudioOutputsPanel.js";
import { defaultAudioApi, type AudioApi } from "../audio/audio-api.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { formatBytes, formatCount, formatHours } from "../foundation/formatters.js";
import { MaskedValue } from "../foundation/MaskedValue.js";
import { ThemeSwitcher } from "../foundation/ThemeSwitcher.js";
import type { DesktopConfigInput, DesktopConfigView, ManagementApi, ServerConfigView } from "../management-api.js";
import { DesktopSettingsPanel } from "./DesktopSettingsPanel.js";
import { OverlaySurfacesPanel, type OverlaySurfacesPanelHandle } from "./OverlaySurfacesPanel.js";
import type { SurfaceSettingsApi } from "./overlay-surfaces-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import { AutomationSettingsPanel } from "./AutomationSettingsPanel.js";
import { EventReplaySettings, type EventReplaySettingsApi } from "./EventReplaySettings.js";
import type { AutomationSettingsApi } from "./automation-api.js";
import { SectionHeading } from "../foundation/ModulePageLayout.js";
import { FocusFallback } from "../foundation/FocusFallback.js";
import "./settings-panel.css";

type SettingsApi = Pick<
  ManagementApi,
  "getDesktopConfig" | "updateDesktopConfig" | "getServerConfig" | "updateServerConfig" | "getConfigurationBackupSummary" | "exportConfigurationBackup" | "preflightConfigurationRestore" | "restoreConfiguration" | "openDataFolder" | "clearOldLogs" | "getEventBusSettings" | "saveEventBusSettings"
>;

export interface SettingsPanelProps {
  readonly automationApi?: AutomationSettingsApi | undefined;
  readonly audioApi?: AudioApi | undefined;
  readonly surfaceApi?: SurfaceSettingsApi | undefined;
  readonly managementApi: SettingsApi;
}

const defaultServerConfig: ServerConfigView = { host: "127.0.0.1", port: 39187 };
const defaultDesktopDraft: DesktopConfigInput = { closeToTray: true, gpuAcceleration: true };

function desktopDraftOf(config: DesktopConfigView | null): DesktopConfigInput {
  return config === null ? defaultDesktopDraft : { closeToTray: config.closeToTray, gpuAcceleration: config.gpuAcceleration };
}

export function SettingsPanel({ automationApi, audioApi = defaultAudioApi, surfaceApi, managementApi }: SettingsPanelProps) {
  const audioPanelRef = useRef<AudioOutputsPanelHandle>(null);
  const surfacesPanelRef = useRef<OverlaySurfacesPanelHandle>(null);
  const [surfacesDirty, setSurfacesDirty] = useState(false);
  const [savedConfig, setSavedConfig] = useState(defaultServerConfig);
  const [configDraft, setConfigDraft] = useState(defaultServerConfig);
  const [desktopConfig, setDesktopConfig] = useState<DesktopConfigView | null>(null);
  const [desktopDraft, setDesktopDraft] = useState(defaultDesktopDraft);
  // GPU acceleration is fixed when the desktop app starts; the first loaded value stands in for it.
  const [launchGpuAcceleration, setLaunchGpuAcceleration] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<ConfigurationBackupSummary | null>(null);
  const [archive, setArchive] = useState<ConfigurationBackupArchive | null>(null);
  const [archiveName, setArchiveName] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<ConfigurationRestorePreflight | null>(null);
  const [restoreResult, setRestoreResult] = useState<ConfigurationRestoreResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState<"open-data-folder" | "clear-old-logs" | null>(null);
  const [audioDirty, setAudioDirty] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(window.location.hash === "#automation" || new URLSearchParams(window.location.search).has("automationPairing"));
  const [serverOpen, setServerOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(window.location.hash === "#audio-outputs");
  const [surfacesOpen, setSurfacesOpen] = useState(window.location.hash === "#overlay-surfaces");
  const [eventReplayOpen, setEventReplayOpen] = useState(window.location.hash === "#event-replay");
  const [dataOpen, setDataOpen] = useState(window.location.hash === "#backup-restore");
  const [audioSummary, setAudioSummary] = useState<{ readonly count: number; readonly state: "loading" | "ready" | "attention" }>({ count: 0, state: "loading" });
  const [surfaceSummary, setSurfaceSummary] = useState<{ readonly count: number; readonly state: "loading" | "ready" | "attention" }>({ count: 0, state: "loading" });
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const eventReplayApi = useMemo<EventReplaySettingsApi | null>(() => {
    const { getEventBusSettings, saveEventBusSettings } = managementApi;
    return getEventBusSettings === undefined || saveEventBusSettings === undefined
      ? null
      : { getEventBusSettings: () => getEventBusSettings.call(managementApi), saveEventBusSettings: (settings) => saveEventBusSettings.call(managementApi, settings) };
  }, [managementApi]);
  const [error, setError] = useState<ActionableManagementError | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([managementApi.getServerConfig(), managementApi.getConfigurationBackupSummary(), managementApi.getDesktopConfig()])
      .then(([serverConfig, backupSummary, desktop]) => {
        setDesktopConfig(desktop);
        setDesktopDraft(desktopDraftOf(desktop));
        setLaunchGpuAcceleration((current) => current ?? desktop.gpuAcceleration);
        setSavedConfig(serverConfig);
        setConfigDraft(serverConfig);
        if (backupSummary.state === "invalid" || backupSummary.blockers.length > 0) setDataOpen(true);
        setSummary(backupSummary);
        setInitialLoadFailed(false);
      })
      .catch((cause: unknown) => {
        setInitialLoadFailed(true);
        setError(actionable("Settings could not be loaded", cause, "Refresh the page and try again."));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [managementApi]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (audioSummary.state === "attention") setAudioOpen(true); }, [audioSummary.state]);
  useEffect(() => { if (surfaceSummary.state === "attention") setSurfacesOpen(true); }, [surfaceSummary.state]);
  const dataNeedsAttention = summary?.state === "invalid" || (summary?.blockers.length ?? 0) > 0 || (preflight?.blockers.length ?? 0) > 0;
  useEffect(() => { if (dataNeedsAttention) setDataOpen(true); }, [dataNeedsAttention]);

  useEffect(() => {
    if (loading) return;
    const targetId = window.location.hash === "#backup-restore"
      ? "backup-restore"
      : window.location.hash === "#audio-outputs" ? "audio-outputs" : window.location.hash === "#overlay-surfaces" ? "overlay-surfaces" : null;
    if (targetId === "backup-restore") setDataOpen(true);
    if (targetId === "audio-outputs") setAudioOpen(true);
    if (targetId === "overlay-surfaces") setSurfacesOpen(true);
    if (targetId !== null) document.getElementById(targetId)?.scrollIntoView?.({ block: "start" });
  }, [loading]);

  const serverDirty = savedConfig.host !== configDraft.host || savedConfig.port !== configDraft.port;
  const desktopDirty = desktopConfig?.available === true &&
    (desktopConfig.closeToTray !== desktopDraft.closeToTray || desktopConfig.gpuAcceleration !== desktopDraft.gpuAcceleration);

  const gpuRestartPending = desktopConfig !== null && launchGpuAcceleration !== null && desktopConfig.gpuAcceleration !== launchGpuAcceleration;

  const saveDesktop = useCallback(async () => {
    const saved = await managementApi.updateDesktopConfig(desktopDraft);
    setDesktopConfig(saved);
    setDesktopDraft(desktopDraftOf(saved));
  }, [desktopDraft, managementApi]);

  const saveServer = useCallback(async () => {
    const saved = await managementApi.updateServerConfig(configDraft);
    setSavedConfig(saved);
    setConfigDraft(saved);
  }, [configDraft, managementApi]);

  const saveSettings = useCallback(async () => {
    if (serverDirty) await saveServer();
    if (desktopDirty) await saveDesktop();
    if (audioDirty) {
      const result = await audioPanelRef.current?.save();
      if (result !== true) return result ?? { saved: false as const, error: "Audio output changes could not be saved. Resolve the highlighted route and try again." };
    }
    if (surfacesDirty) {
      const result = await surfacesPanelRef.current?.save();
      if (result !== true) return result ?? { saved: false as const, error: "Overlay surface settings could not be saved. Resolve the highlighted settings and try again." };
    }
  }, [audioDirty, desktopDirty, surfacesDirty, saveDesktop, saveServer, serverDirty]);

  const discard = useCallback(() => {
    setDesktopDraft(desktopDraftOf(desktopConfig));
    setConfigDraft(savedConfig);
    setArchive(null);
    setArchiveName(null);
    setPreflight(null);
    setRestoreResult(null);
    setConfirmation("");
    audioPanelRef.current?.discard();
    surfacesPanelRef.current?.discard();
  }, [desktopConfig, savedConfig]);

  useDirtyNavigationSource({
    id: "settings",
    dirty: serverDirty || desktopDirty || audioDirty || surfacesDirty || archive !== null,
    summary: archive === null ? "Settings, audio outputs, or overlay surfaces have unsaved changes." : "A configuration backup is selected for restore.",
    save: archive === null && (serverDirty || desktopDirty || audioDirty || surfacesDirty) ? saveSettings : null,
    discard
  });

  async function submitDesktop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try { await saveDesktop(); setNotice({ tone: "success", message: "Desktop settings saved." }); }
    catch (cause) { setError(actionable("Desktop settings could not be applied", cause, "Check the service and retry. If the preference was saved but not applied, restart the desktop app.")); }
    finally { setBusy(false); }
  }

  async function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveServer();
      setNotice({ tone: "warning", message: "Server settings saved.", detail: "Restart Stream Jams if the port changed." });
    } catch (cause) {
      setServerOpen(true);
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
      setNotice({ tone: "success", message: `Backup exported with ${formatCount(exported.manifest.configurationRecordCount, { one: "configuration record", other: "configuration records" })} and ${formatCount(exported.manifest.assetCount, { one: "asset", other: "assets" })}.` });
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
      setDataOpen(true);
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
      setNotice({ tone: "warning", message: "Configuration restored.", detail: "Complete the follow-up actions before going live." });
      setSummary(await managementApi.getConfigurationBackupSummary());
      const desktop = await managementApi.getDesktopConfig();
      setDesktopConfig(desktop);
      setDesktopDraft(desktopDraftOf(desktop));
    } catch (cause) {
      setError(actionable("Configuration was not restored", cause, "Resolve the reported failure, validate the backup again, and retry."));
    } finally {
      setBusy(false);
    }
  }

  async function openDataFolder() {
    setMaintenanceBusy("open-data-folder");
    setError(null);
    setNotice(null);
    try {
      const result = await managementApi.openDataFolder();
      setNotice({ tone: "success", message: `Data folder opened: ${result.dataDirectory}` });
    } catch (cause) {
      setDataOpen(true);
      setError(actionable(
        "Data folder was not opened",
        cause,
        "Open the configured data folder manually, then check Diagnostics and retry."
      ));
    } finally {
      setMaintenanceBusy(null);
    }
  }

  async function clearOldLogs() {
    setMaintenanceBusy("clear-old-logs");
    setError(null);
    setNotice(null);
    try {
      const result = await managementApi.clearOldLogs();
      setNotice({
        tone: "success",
        message: result.deletedCount === 0
          ? "No expired log files needed clearing."
          : `${formatCount(result.deletedCount, { one: "old log file", other: "old log files" })} cleared.`
      });
    } catch (cause) {
      setError(actionable(
        "Old logs were not cleared",
        cause,
        "Check data-folder permissions and Diagnostics, then retry."
      ));
    } finally {
      setMaintenanceBusy(null);
    }
  }

  if (loading) return <p className="management-empty" role="status">Loading settings...</p>;
  if (initialLoadFailed && error !== null) return <section aria-label="Settings" className="settings-page"><ManagementErrorBanner error={error} /><Button onClick={() => void loadSettings()} type="button">Retry loading settings</Button></section>;

  return (
    <section aria-label="Settings" className="settings-page">
      <header className="settings-page__header">
        {summary === null ? null : <span className="settings-page__version">Stream Jams {summary.appVersion} · Schema {summary.schemaVersion}</span>}
      </header>

      {error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      <section aria-labelledby="appearance-heading" className="settings-page__section">
        <SectionHeading level={3} id="appearance-heading" title="Appearance" description="Choose how the management interface is displayed on this device." />
        <ThemeSwitcher />
      </section>

      <details className="settings-page__disclosure" onToggle={(event) => setServerOpen(event.currentTarget.open)} open={serverOpen}>
        <summary><span className="settings-page__summary-content"><strong>Server settings</strong><small>Local only · port {configDraft.port}{serverDirty ? " · Unsaved" : ""}</small></span></summary>
        <section aria-labelledby="server-heading" className="settings-page__section">
          <SectionHeading level={3} id="server-heading" title="Local server" description="Management and browser-source traffic remains bound to this computer." />
          <form className="settings-page__form" onSubmit={submitServer}>
            <TextInput label="Host" disabled readOnly value={configDraft.host} />
            <TextInput id="settings-server-port" label="Port" min={1} max={65535} onChange={(event) => setConfigDraft({ ...configDraft, port: Number(event.currentTarget.value) })} type="number" value={configDraft.port} />
            {serverDirty ? <Button disabled={busy} type="submit">Save server settings</Button> : null}
            <FocusFallback visible={serverDirty} target={() => document.getElementById("settings-server-port")} />
          </form>
        </section>
      </details>

      {desktopConfig?.available !== true ? null : (
        <section aria-labelledby="desktop-heading" className="settings-page__section">
          <SectionHeading level={3} id="desktop-heading" title="Desktop app" description="Choose what happens when you close the management window and whether the desktop app uses the GPU." />
          <form className="settings-page__form" onSubmit={submitDesktop}>
            <DesktopSettingsPanel
              closeToTray={desktopDraft.closeToTray}
              gpuAcceleration={desktopDraft.gpuAcceleration}
              disabled={busy}
              onCloseToTrayChange={(closeToTray) => setDesktopDraft((draft) => ({ ...draft, closeToTray }))}
              onGpuAccelerationChange={(gpuAcceleration) => setDesktopDraft((draft) => ({ ...draft, gpuAcceleration }))}
            />
            {desktopDirty ? <Button disabled={busy} type="submit">Save desktop settings</Button> : null}
            <FocusFallback visible={desktopDirty} target={() => document.querySelector<HTMLElement>(".desktop-settings input")} />
          </form>
          {gpuRestartPending ? <p className="settings-page__hint" role="status">Restart Stream Jams to apply the GPU acceleration change.</p> : null}
        </section>
      )}

      <details className="settings-page__disclosure" onToggle={(event) => setAudioOpen(event.currentTarget.open)} open={audioOpen}>
        <summary><span className="settings-page__summary-content"><h3 className="settings-page__summary-title">Audio outputs · {summaryText(audioSummary, "configured")}{audioDirty ? " · Unsaved" : ""}</h3></span></summary>
        <AudioOutputsPanel audioApi={audioApi} embedded onDirtyChange={setAudioDirty} onSummaryChange={setAudioSummary} ref={audioPanelRef} />
      </details>
      <details className="settings-page__disclosure" onToggle={(event) => setSurfacesOpen(event.currentTarget.open)} open={surfacesOpen}>
        <summary><span className="settings-page__summary-content"><h3 className="settings-page__summary-title">Overlay surfaces · {summaryText(surfaceSummary, "configured")}{surfacesDirty ? " · Unsaved" : ""}</h3></span></summary>
        <OverlaySurfacesPanel api={surfaceApi} embedded manageNavigation={false} onDirtyChange={setSurfacesDirty} onSummaryChange={setSurfaceSummary} ref={surfacesPanelRef} />
      </details>

      <details className="settings-page__disclosure" id="automation" onToggle={event => setAutomationOpen(event.currentTarget.open)} open={automationOpen}>
        <summary><span className="settings-page__summary-content"><strong>Automation</strong><small>Local client pairing and permissions</small></span></summary>
        {automationOpen ? <AutomationSettingsPanel api={automationApi} /> : null}
      </details>

      {eventReplayApi === null ? null : (
        <details className="settings-page__disclosure" id="event-replay" onToggle={event => setEventReplayOpen(event.currentTarget.open)} open={eventReplayOpen}>
          <summary><span className="settings-page__summary-content"><strong>Event replay</strong><small>Events missed during a restart</small></span></summary>
          {eventReplayOpen && eventReplayApi !== null ? <EventReplaySettings api={eventReplayApi} /> : null}
        </details>
      )}

      <details className="settings-page__disclosure" id="backup-restore" onToggle={(event) => setDataOpen(event.currentTarget.open)} open={dataOpen}>
        <summary><span className="settings-page__summary-content"><strong>Data and backup{dataNeedsAttention ? " · Needs attention" : ""}</strong><small>{summary === null ? "Loading storage details" : `${formatCount(summary.configurationRecordCount, { one: "configuration record", other: "configuration records" })} · ${formatCount(summary.assetCount, { one: "asset", other: "assets" })}`}</small></span></summary>
        {summary === null ? null : (
        <section aria-labelledby="storage-heading" className="settings-page__section settings-page__section--nested">
          <SectionHeading level={3} id="storage-heading" title="Data and diagnostics" description="Current storage locations and bounded log-retention policy." />
          <dl className="settings-page__facts">
            <div><dt>Data folder</dt><dd>{summary.dataDirectory}</dd></div>
            <div><dt>Asset folder</dt><dd>{summary.assetDirectory}</dd></div>
            <div><dt>Log level</dt><dd>{summary.logLevel}</dd></div>
            <div><dt>Log retention</dt><dd>{formatHours(summary.logRetentionHours)}</dd></div>
          </dl>
          <Group wrap="wrap" align="center">
            <div><strong>Local maintenance</strong><p>Open application data or apply the configured retention policy now.</p></div>
            <Button variant="default" disabled={busy || maintenanceBusy !== null} onClick={() => void openDataFolder()} type="button">
              {maintenanceBusy === "open-data-folder" ? "Opening data folder..." : "Open data folder"}
            </Button>
            <Button variant="default" disabled={busy || maintenanceBusy !== null} onClick={() => void clearOldLogs()} type="button">
              {maintenanceBusy === "clear-old-logs" ? "Clearing old logs..." : "Clear old logs now"}
            </Button>
          </Group>
        </section>
      )}

      <section aria-labelledby="backup-heading" className="settings-page__section settings-page__section--nested">
        <SectionHeading level={3} id="backup-heading" title="Backup and restore" description="Move complete local configuration and assets without exporting credentials or route keys." actions={<Button disabled={busy || summary?.state === "invalid"} onClick={() => void exportBackup()} type="button">Export backup</Button>} />
        {summary === null ? null : (
          <div className="settings-page__backup-summary">
            <strong>{formatCount(summary.configurationRecordCount, { one: "configuration record", other: "configuration records" })} · {formatCount(summary.assetCount, { one: "asset", other: "assets" })} · {formatBytes(summary.totalAssetBytes)}</strong>
            <span>Excluded: {summary.secretExclusions.join(", ")}</span>
          </div>
        )}
        {summary?.blockers.map((blocker) => <ManagementErrorBanner error={blocker} key={`${blocker.summary}-${blocker.referenceId ?? "none"}`} />)}

        <div className="settings-page__restore">
          <TextInput className="settings-page__file" label="Backup file" accept=".streamjams-backup,application/json" disabled={busy} onChange={(event) => void chooseArchive(event)} type="file" />
          {archiveName === null ? <p>No backup selected.</p> : <p><strong>{archiveName}</strong>{busy ? " · Validating..." : ""}</p>}

          {preflight?.impact === null || preflight?.impact === undefined ? null : <RestoreImpact impact={preflight.impact} />}
          {preflight?.blockers.map((blocker) => <ManagementErrorBanner error={blocker} key={`${blocker.summary}-${blocker.nextStep}`} />)}
          {preflight?.warnings.map((warning) => <ManagementErrorBanner error={warning} key={`${warning.summary}-${warning.nextStep}`} />)}

          {preflight?.state !== "valid" ? null : <>
            <TextInput className="settings-page__confirmation" label="Type RESTORE to confirm" autoComplete="off" disabled={busy} onChange={(event) => setConfirmation(event.currentTarget.value)} value={confirmation} />
            <Checkbox checked disabled readOnly label="Regenerate overlay route keys and browser-source URLs" />
            <Button color="red" disabled={busy || confirmation !== "RESTORE"} onClick={() => void restoreConfiguration()} type="button">Restore configuration</Button>
          </>}
        </div>
      </section>
      </details>

      {restoreResult === null ? null : <RestoreCompletion result={restoreResult} />}
    </section>
  );
}

function summaryText(summary: { readonly count: number; readonly state: "loading" | "ready" | "attention" }, noun: string): string {
  if (summary.state === "loading") return "Loading status";
  const count = `${summary.count} ${noun}`;
  return summary.state === "attention" ? `${count} · Needs attention` : count;
}


function RestoreImpact({ impact }: { readonly impact: NonNullable<ConfigurationRestorePreflight["impact"]> }) {
  return (
    <section aria-label="Restore impact" className="settings-page__impact">
      <h4>Restore impact</h4>
      <ul>
        <li>{formatCount(impact.alertSets, { one: "alert set", other: "alert sets" })}</li>
        <li>{formatCount(impact.providers, { one: "provider", other: "providers" })}</li>
        <li>{formatCount(impact.assets, { one: "asset", other: "assets" })}</li>
        <li>{formatCount(impact.browserOutputs, { one: "browser output", other: "browser outputs" })}</li>
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
