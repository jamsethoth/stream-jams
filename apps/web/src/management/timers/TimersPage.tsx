import { actionableError } from "../foundation/actionable-error.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import type { ActionableManagementError } from "@stream-jams/core";
import { BrowserSourcesPanel } from "../foundation/BrowserSourcesPanel.js";
import { formatTimerRemaining, timerDefinitionInputSchema, timersOverlayModuleConfigSchema, type TimerDefinition, type TimerDefinitionInput, type TimerRunState, type TimersOverlayModuleConfig } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import { AssetPicker } from "../assets/AssetPicker.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { TimerStackEditor } from "./TimerStackEditor.js";
import { TimerAdjustmentControls } from "./TimerAdjustmentControls.js";
import { TimerEventRulesEditor } from "./TimerEventRulesEditor.js";
import { defaultTimersApi, type TimerAutomationCredentialStatus, type TimerBrowserSource, type TimerCommand, type TimersApi } from "./timers-api.js";
import "./timers.css";

type AssetRole = "iconAssetId" | "startAudioAssetId" | "endAudioAssetId";
const emptyDraft: TimerDefinitionInput = { label: "", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
  outputs: { browserSource: true, deviceRouteIds: [] } };
const profileDimensions = { landscape: { width: 1920, height: 1080 }, vertical: { width: 1080, height: 1920 } } as const;

export function TimersPage({ assetApi, audioApi, managementApi, api = defaultTimersApi, ownerId }: {
  readonly ownerId?: string | undefined;
  readonly assetApi: AssetApi; readonly audioApi: AudioApi; readonly managementApi: AssetLibraryManagementApi; readonly api?: TimersApi;
}) {
  const [definitions, setDefinitions] = useState<readonly TimerDefinition[]>([]); const [states, setStates] = useState<readonly TimerRunState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [draft, setDraft] = useState<TimerDefinitionInput>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false); const [routes, setRoutes] = useState<readonly { id: string; name: string }[]>([]);
  const [layout, setLayout] = useState<TimersOverlayModuleConfig | null>(null); const [enabled, setEnabled] = useState(false);
  const [credential, setCredential] = useState<TimerAutomationCredentialStatus | null>(null); const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [pickerRole, setPickerRole] = useState<AssetRole | null>(null); const [browserSources, setBrowserSources] = useState<readonly TimerBrowserSource[]>([]);
  const [sourcesExpanded, setSourcesExpanded] = useState(false); const [revealedSourceIds, setRevealedSourceIds] = useState<ReadonlySet<string>>(new Set());
  const [regenerateSource, setRegenerateSource] = useState<TimerBrowserSource | null>(null);
  const [moduleConfirmation, setModuleConfirmation] = useState<boolean | null>(null);
  const [rotateConfirmation, setRotateConfirmation] = useState(false);
  const [refreshError, setRefreshError] = useState<ActionableManagementError | null>(null);
  const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const openedOwnerRef = useRef<string | undefined>(undefined);
  const stateRevisionRef = useRef(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<ManagementToastNotice | null>(null); const [error, setError] = useState<ActionableManagementError | null>(null);
  const selected = definitions.find(item => item.id === selectedId) ?? null; const active = states.find(state => state.definitionId === selectedId) ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDefinitions, nextStates, moduleConfig, credentialStatus, audioStatus, nextBrowserSources] = await Promise.all([
        api.list(), api.listStates(), api.getModuleConfig(), api.getAutomationCredential(), audioApi.getStatus(), api.listBrowserSources()
      ]);
      setDefinitions(nextDefinitions); setStates(nextStates); setLayout(moduleConfig.config); setEnabled(moduleConfig.enabled); setCredential(credentialStatus);
      setRoutes(audioStatus.routes.map(({ route }) => ({ id: route.id, name: route.name }))); setBrowserSources(nextBrowserSources); setError(null);
    } catch (reason) { setError(actionableError(reason, "Timers could not be loaded", "Reopen Timers to retry. Last loaded configuration is retained.")); } finally { setLoading(false); }
  }, [api, audioApi]);
  useEffect(() => { void load(); return () => setIssuedToken(null); }, [load]);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const interval = setInterval(() => {
      if (pending || document.hidden) return;
      pending = true;
      const revision = stateRevisionRef.current;
      void Promise.all([api.listStates(), api.listBrowserSources()]).then(([nextStates, nextSources]) => {
        if (!disposed && revision === stateRevisionRef.current) { setStates(nextStates); setBrowserSources(nextSources); setRefreshError(null); }
      }).catch((reason: unknown) => {
        if (!disposed && revision === stateRevisionRef.current) setRefreshError(actionableError(reason, "Timer status is stale", "Showing the last known timer and browser-source state. Check the local service; refresh retries every five seconds."));
      }).finally(() => { pending = false; });
    }, 5_000);
    return () => { disposed = true; clearInterval(interval); };
  }, [api]);
  useEffect(() => {
    if (ownerId !== openedOwnerRef.current && ownerId !== undefined && definitions.some(item => item.id === ownerId)) {
      openedOwnerRef.current = ownerId;
      setSelectedId(ownerId); setDraft(toInput(definitions.find(item => item.id === ownerId)!)); setEditorOpen(true);
    }
  }, [ownerId, definitions]);
  const stateById = useMemo(() => new Map(states.map(state => [state.definitionId, state])), [states]);

  function clearFeedback() { setNotice(null); setActionError(null); }
  function showNotice(message: string, tone: ManagementToastNotice["tone"] = "success") {
    setActionError(null);
    setNotice({ tone, message });
  }
  function showError(reason: unknown) {
    setNotice(null);
    setActionError(actionableError(reason, "Timer action failed", "Review the timer configuration and local service, then retry the action."));
  }

  function openCreate() { clearFeedback(); setSelectedId(null); setDraft(emptyDraft); setDefinitionError(null); setEditorOpen(true); }
  function openEdit(id: string) { clearFeedback(); const item = definitions.find(item => item.id === id); if (item === undefined) return; setSelectedId(id); setDraft(toInput(item)); setDefinitionError(null); setEditorOpen(true); }
  function closeEditor() { clearFeedback(); setEditorOpen(false); setPickerRole(null); }
  async function save(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    const parsed = timerDefinitionInputSchema.safeParse(draft);
    if (!parsed.success) { setDefinitionError(parsed.error.issues[0]?.message ?? "Correct the timer definition before saving."); return; }
    setDefinitionError(null);
    setBusy(true); clearFeedback();
    try {
      const input = parsed.data; const creating = selected === null;
      await (creating ? api.create(input) : api.update(selected.id, input));
      setEditorOpen(false); setSelectedId(null); await load(); showNotice(creating ? "Timer created." : "Timer saved. Changes apply to the next run.");
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function command(commandName: TimerCommand, id = selectedId) {
    if (id === null) return; setBusy(true); clearFeedback();
    stateRevisionRef.current += 1;
    try { const result = await api.command(id, commandName); const nextStates = await api.listStates(); stateRevisionRef.current += 1; setStates(nextStates); setRefreshError(null); showNotice(result.changed ? `Timer ${commandName}ed.` : "Timer state did not change."); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function adjust(input: import("@stream-jams/core").TimerAdjustment) {
    if (selectedId === null) return;
    setBusy(true); clearFeedback(); stateRevisionRef.current += 1;
    try { await api.adjust(selectedId, input); const next = await api.listStates(); stateRevisionRef.current += 1; setStates(next); setRefreshError(null); showNotice("Timer adjusted."); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function remove() {
    if (selectedId === null || active !== null) return; setBusy(true); clearFeedback();
    try { await api.remove(selectedId); setEditorOpen(false); setSelectedId(null); await load(); showNotice("Timer deleted."); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function saveLayout() {
    if (layout === null) return;
    const parsed = timersOverlayModuleConfigSchema.safeParse(layout);
    if (!parsed.success) { setLayoutError(parsed.error.issues[0]?.message ?? "Correct the overlay layout before saving."); return; }
    setLayoutError(null);
    setBusy(true); clearFeedback();
    try { const saved = await api.saveModuleConfig(enabled, parsed.data); setLayout(saved.config); showNotice("Timer overlay layout saved."); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function confirmModuleEnablement() {
    if (moduleConfirmation === null) return; setBusy(true); clearFeedback();
    try {
      const nextEnabled = await api.setModuleEnabled(moduleConfirmation); setEnabled(nextEnabled);
      showNotice(`Timers module is now ${nextEnabled ? "enabled" : "disabled"}.`); setModuleConfirmation(null);
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function createBrowserSource(source: TimerBrowserSource) {
    setBusy(true); clearFeedback();
    try { await api.createBrowserSource(source); setBrowserSources(await api.listBrowserSources()); showNotice(`${profileLabel(source.targetProfileId)} URL created.`); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function confirmRegenerateSource() {
    if (regenerateSource === null) return; setBusy(true); clearFeedback();
    try {
      await api.regenerateBrowserSource(regenerateSource); setBrowserSources(await api.listBrowserSources());
      showNotice(`${profileLabel(regenerateSource.targetProfileId)} URL regenerated. Update OBS with the new URL.`, "warning"); setRegenerateSource(null);
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function copyBrowserSource(source: TimerBrowserSource) {
    if (source.url === null) return;
    try { await navigator.clipboard.writeText(source.url); showNotice(`${profileLabel(source.targetProfileId)} URL copied.`); }
    catch (reason) { showError(reason); }
  }
  async function rotateCredential() {
    setBusy(true); clearFeedback(); try { const issued = await api.rotateAutomationCredential(); setCredential(issued); setIssuedToken(issued.token); setRotateConfirmation(false); showNotice("Automation credential created. Copy it now; it will not be shown again.", "warning"); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function revokeCredential() {
    if (!window.confirm("Revoke the timer automation credential? Existing Stream Deck actions will stop working.")) return;
    setBusy(true); clearFeedback(); try { await api.revokeAutomationCredential(); setCredential({ configured: false, createdAt: null, rotatedAt: null }); setIssuedToken(null); showNotice("Automation credential revoked."); }
    catch (reason) { showError(reason); } finally { setBusy(false); }
  }

  const feedback = <>
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
    {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
  </>;
  const feedbackOwner = editorOpen ? "editor" : rotateConfirmation ? "rotate" : regenerateSource !== null ? "source" : moduleConfirmation !== null ? "module" : "page";

  if (loading && layout === null) return <p className="management-empty" role="status">Loading timers…</p>;
  return <div className="timers-page">
    {refreshError === null ? null : <ManagementErrorBanner error={refreshError} />}
    {error === null ? null : <ManagementErrorBanner error={error} />}
    {feedbackOwner === "page" ? feedback : null}
    <BrowserSources busy={busy} expanded={sourcesExpanded} onCopy={source => void copyBrowserSource(source)} onCreate={source => void createBrowserSource(source)}
      onRegenerate={source => { clearFeedback(); setRegenerateSource(source); }} onToggle={() => setSourcesExpanded(value => !value)} onToggleReveal={source => setRevealedSourceIds(current => {
        const next = new Set(current); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next;
      })} revealedSourceIds={revealedSourceIds} sources={browserSources} />
    <section className="timers-inventory" aria-labelledby="timer-inventory-heading"><div className="timer-section-heading"><div><h2 id="timer-inventory-heading">Timers</h2><p>Create reusable countdowns and control their active runs.</p><StatusBadge label={enabled ? "Module enabled" : "Module disabled"} tone={enabled ? "positive" : "neutral"} /></div><div className="timer-row__actions"><button className="button button--secondary" disabled={busy} onClick={() => { clearFeedback(); setModuleConfirmation(!enabled); }} type="button">{enabled ? "Disable Timers module" : "Enable Timers module"}</button><button className="button button--primary" onClick={openCreate} type="button">New timer</button></div></div>
      {definitions.length === 0 ? <div className="timers-empty"><h3>No timers yet</h3><p>Create one for a recurring stream activity.</p><button onClick={openCreate} type="button">Create timer</button></div> : <div className="timers-list">{definitions.map(item => { const state = stateById.get(item.id); return <article aria-label={`${item.label} timer`} className="timer-row" key={item.id}><button className="timer-row__identity" onClick={() => openEdit(item.id)} type="button"><strong>{item.label}</strong><span>{formatTimerRemaining(item.durationMs)}</span></button><StatusBadge label={state?.status ?? "Idle"} tone={state?.status === "running" ? "positive" : state?.status === "completed" ? "warning" : "neutral"} /><div className="timer-row__actions"><button className="button button--secondary button--compact" onClick={() => openEdit(item.id)} type="button">Edit</button><button className="button button--compact" disabled={busy} onClick={() => void command(state?.status === "paused" ? "resume" : "start", item.id)} type="button">{state?.status === "paused" ? "Resume" : "Start"}</button></div></article>; })}</div>}
    </section>
    {layout === null ? null : <section className="timer-presentation" aria-labelledby="timer-presentation-heading"><div className="timer-section-heading"><div><h2 id="timer-presentation-heading">Overlay layout</h2><p>Position the timer stack independently for each output profile.</p></div></div><TimerStackEditor assetApi={assetApi} definitions={definitions} value={layout} onChange={setLayout} /><div className="timer-layout-save">{layoutError === null ? null : <p role="alert">{layoutError}</p>}<button disabled={busy} onClick={() => void saveLayout()} type="button">Save overlay layout</button></div></section>}
    <section className="timer-credential" aria-labelledby="timer-credential-heading"><div><p className="management-eyebrow">Stream Deck HTTP</p><h2 id="timer-credential-heading">Automation credential</h2><p>{credential?.configured ? "Configured. Rotating invalidates the previous credential immediately." : "Not configured."}</p></div>{issuedToken === null ? null : <div className="timer-token"><label>Copy this credential now<input readOnly value={issuedToken} /></label><button onClick={() => void navigator.clipboard?.writeText(issuedToken)} type="button">Copy</button><button className="button button--secondary" onClick={() => setIssuedToken(null)} type="button">Dismiss</button></div>}<div className="timer-credential__actions"><button disabled={busy} onClick={() => { clearFeedback(); if (credential?.configured) setRotateConfirmation(true); else void rotateCredential(); }} type="button">{credential?.configured ? "Rotate credential" : "Create credential"}</button><button className="button button--danger-quiet" disabled={busy || !credential?.configured} onClick={() => void revokeCredential()} type="button">Revoke</button></div></section>
    <ModalSurface labelledBy="timer-rotate-title" onCancel={() => { clearFeedback(); setRotateConfirmation(false); }} open={rotateConfirmation}><div className="timer-confirmation">{feedbackOwner === "rotate" ? feedback : null}<ManagementModalTitle>Rotate timer automation credential?</ManagementModalTitle><p>The current credential stops working immediately. Existing Stream Deck actions will stop working until you update them with the new credential. The old credential cannot be recovered.</p><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => { clearFeedback(); setRotateConfirmation(false); }} type="button">Cancel</button><button className="button button--danger" disabled={busy} onClick={() => void rotateCredential()} type="button">Confirm rotation</button></div></div></ModalSurface>
    <ModalSurface labelledBy="timer-editor-title" onCancel={closeEditor} open={editorOpen}><form className="timer-editor" onSubmit={save}>{feedbackOwner === "editor" ? feedback : null}<div className="timer-section-heading"><div><p className="management-eyebrow">Definition</p><ManagementModalTitle>{selected === null ? "Create timer" : `Edit ${selected.label}`}</ManagementModalTitle></div>{active === null ? null : <StatusBadge label={active.status} tone={active.status === "running" ? "positive" : "warning"} />}</div>
      {active === null ? null : <p className="timer-editor__notice">This run keeps its current name, duration, assets, and outputs. Saved edits apply next time.</p>}
      {definitionError === null ? null : <p role="alert">{definitionError}</p>}
      <label>Name<input required maxLength={120} value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} /></label>
      <label>Duration (seconds)<input required min="1" type="number" value={draft.durationMs / 1000} onChange={event => setDraft({ ...draft, durationMs: Math.round(Number(event.currentTarget.value) * 1000) })} /></label>
      <TimerEventRulesEditor rules={draft.eventRules ?? []} onChange={eventRules => setDraft({ ...draft, eventRules })} />
      {selectedId === null ? null : <TimerAdjustmentControls disabled={busy} onApply={adjust} />}
      <fieldset><legend>Assets</legend>{(["iconAssetId", "startAudioAssetId", "endAudioAssetId"] as const).map(role => <div className="timer-asset-row" key={role}><span>{role === "iconAssetId" ? "Icon" : role === "startAudioAssetId" ? "Start sound" : "End sound"}</span><code>{draft[role] ?? "None"}</code><button className="button button--secondary button--compact" onClick={() => setPickerRole(role)} type="button">Choose</button>{draft[role] === null ? null : <button className="button button--secondary button--compact" onClick={() => setDraft({ ...draft, [role]: null })} type="button">Clear</button>}</div>)}</fieldset>
      <fieldset className="timer-output-options"><legend>Audio outputs</legend><label className="timer-output-option"><input checked={draft.outputs.browserSource} onChange={event => setDraft({ ...draft, outputs: { ...draft.outputs, browserSource: event.currentTarget.checked } })} type="checkbox" /> Browser Source</label>{routes.map(route => <label className="timer-output-option" key={route.id}><input checked={draft.outputs.deviceRouteIds.includes(route.id)} onChange={() => setDraft({ ...draft, outputs: { ...draft.outputs, deviceRouteIds: draft.outputs.deviceRouteIds.includes(route.id) ? draft.outputs.deviceRouteIds.filter(id => id !== route.id) : [...draft.outputs.deviceRouteIds, route.id] } })} type="checkbox" /> {route.name}</label>)}</fieldset>
      <div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={closeEditor} type="button">Cancel</button>{selected === null ? null : <><button className="button button--secondary" disabled={busy || active?.status !== "running"} onClick={() => void command("pause")} type="button">Pause</button><button className="button button--secondary" disabled={busy || active?.status !== "paused"} onClick={() => void command("resume")} type="button">Resume</button><button className="button button--secondary" disabled={busy || active === null} onClick={() => void command("stop")} type="button">Stop</button><button className="button button--secondary" disabled={busy} onClick={() => void command("restart")} type="button">Restart</button><button className="button button--danger-quiet" disabled={busy || active !== null} onClick={() => void remove()} type="button">Delete</button></>}<button disabled={busy} type="submit">{selected === null ? "Create timer" : "Save timer"}</button></div>
    </form></ModalSurface>
    <ModalSurface labelledBy="timer-regenerate-title" onCancel={() => { clearFeedback(); setRegenerateSource(null); }} open={regenerateSource !== null}><div className="timer-confirmation">{feedbackOwner === "source" ? feedback : null}<ManagementModalTitle>Regenerate {regenerateSource === null ? "" : profileLabel(regenerateSource.targetProfileId)} URL?</ManagementModalTitle><p>The current URL will stop working immediately. Update the Browser Source in OBS after regeneration.</p><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => { clearFeedback(); setRegenerateSource(null); }} type="button">Cancel</button><button className="button button--danger" disabled={busy} onClick={() => void confirmRegenerateSource()} type="button">Regenerate URL</button></div></div></ModalSurface>
    <ModalSurface labelledBy="timer-module-confirm-title" onCancel={() => { clearFeedback(); setModuleConfirmation(null); }} open={moduleConfirmation !== null}>{moduleConfirmation === null ? null : <div className="timer-confirmation">{feedbackOwner === "module" ? feedback : null}<ManagementModalTitle>{moduleConfirmation ? "Enable" : "Disable"} Timers module?</ManagementModalTitle><p>{moduleConfirmation ? "Timer runs can appear in enabled browser and desktop overlay surfaces." : "Timer definitions and active runs remain available, but Timers stop rendering until the module is enabled again."}</p><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => { clearFeedback(); setModuleConfirmation(null); }} type="button">Cancel</button><button className="button button--primary" disabled={busy} onClick={() => void confirmModuleEnablement()} type="button">Confirm change</button></div></div>}</ModalSurface>
    <AssetPicker assetApi={assetApi} compatibleMediaTypes={pickerRole === "iconAssetId" ? ["image", "gif"] : ["audio"]} managementApi={managementApi} onCancel={() => setPickerRole(null)} onSelect={assetId => { if (pickerRole !== null) setDraft(current => ({ ...current, [pickerRole]: assetId })); setPickerRole(null); }} open={pickerRole !== null} selectedAssetId={pickerRole === null ? null : draft[pickerRole]} />
  </div>;
}

function BrowserSources({ busy, expanded, onCopy, onCreate, onRegenerate, onToggle, onToggleReveal, revealedSourceIds, sources }: {
  readonly busy: boolean; readonly expanded: boolean; readonly onCopy: (source: TimerBrowserSource) => void; readonly onCreate: (source: TimerBrowserSource) => void;
  readonly onRegenerate: (source: TimerBrowserSource) => void; readonly onToggle: () => void; readonly onToggleReveal: (source: TimerBrowserSource) => void;
  readonly revealedSourceIds: ReadonlySet<string>; readonly sources: readonly TimerBrowserSource[];
}) {
  const ready = sources.filter(source => source.status === "available").length; const needsSetup = sources.length - ready;
  return <BrowserSourcesPanel detailsId="timer-browser-source-details" expanded={expanded} onToggle={onToggle} readyCount={ready} needsSetupCount={needsSetup}>
    <div className="timer-browser-sources__list">{sources.map(source => { const label = profileLabel(source.targetProfileId); const dimensions = profileDimensions[source.targetProfileId]; const revealed = revealedSourceIds.has(source.id); return <article aria-label={`${label} browser source`} className="timer-browser-source" key={source.id}><div className="timer-browser-source__heading"><strong>{label}</strong><StatusBadge label={source.status === "available" ? "Ready" : "Needs setup"} tone={source.status === "available" ? "positive" : "warning"} /></div><p className="timer-browser-source__telemetry">{source.connectionState === "connected" ? "Listening now" : source.lastConnectedAt === null ? "Not listening. No connection recorded." : `Not listening. Last seen ${formatDateTime(source.lastConnectedAt)}`}</p><p className="timer-browser-source__dimensions"><strong>{dimensions.width} x {dimensions.height}</strong></p><p className="timer-browser-source__guidance">Add a Browser Source in OBS at {dimensions.width} x {dimensions.height}, then paste this URL.</p>{source.url === null ? <p className="timer-browser-source__missing">Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source URL`} readOnly value={source.url} /> : <code className="timer-browser-source__masked">{maskRouteKey(source.url)}</code>}<div className="timer-row__actions">{source.status === "create-required" ? <button disabled={busy} onClick={() => onCreate(source)} type="button">Create {label} URL</button> : null}{source.url === null ? null : <><button aria-label={`${revealed ? "Hide" : "Reveal"} ${label} URL`} className="button button--secondary" onClick={() => onToggleReveal(source)} type="button">{revealed ? "Hide" : "Reveal"}</button><button aria-label={`Copy ${label} URL`} className="button button--secondary" onClick={() => onCopy(source)} type="button">Copy</button></>}{source.status !== "create-required" ? <button aria-label={`Regenerate ${label} URL`} className="button button--danger" disabled={busy} onClick={() => onRegenerate(source)} type="button">Regenerate</button> : null}</div></article>; })}</div>
  </BrowserSourcesPanel>;
}

function toInput(definition: TimerDefinition): TimerDefinitionInput { return { label: definition.label, durationMs: definition.durationMs, iconAssetId: definition.iconAssetId,
  startAudioAssetId: definition.startAudioAssetId, endAudioAssetId: definition.endAudioAssetId, outputs: definition.outputs, ...(definition.eventRules === undefined ? {} : { eventRules: definition.eventRules }) }; }
function profileLabel(profile: "landscape" | "vertical") { return profile === "landscape" ? "Landscape" : "Vertical"; }
function maskRouteKey(url: string) { return url.replace(/(\/live\/)[^?]+/u, "$1********"); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
