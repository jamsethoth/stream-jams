import { Button, Checkbox, TextInput } from "@mantine/core";
import { BrowserSourceRow } from "../foundation/BrowserSourceRow.js";
import { ModulePageLayout, ModuleControls, ModuleSection } from "../foundation/ModulePageLayout.js";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
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
  const [revokeConfirmation, setRevokeConfirmation] = useState(false);
  const [confirmationError, setConfirmationError] = useState<ActionableManagementError | null>(null);
  const mutationRef = useRef(false);
  const fallbackRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    function correction() { if (window.location.hash === "#browser-sources") { setSourcesExpanded(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#browser-sources button[aria-expanded]")?.focus()); } else if (["#timer-presentation", "#timer-credential"].includes(window.location.hash)) { document.getElementById(window.location.hash.slice(1))?.querySelector<HTMLElement>("button, input")?.focus(); } }
    if (!loading) correction(); window.addEventListener("hashchange", correction); return () => window.removeEventListener("hashchange", correction);
  }, [loading]);
  const stateById = useMemo(() => new Map(states.map(state => [state.definitionId, state])), [states]);

  function reviewConfirmation() { if (mutationRef.current) return false; clearFeedback(); setConfirmationError(null); return true; }
  function closeConfirmation() { if (mutationRef.current) return; clearFeedback(); setConfirmationError(null); setRotateConfirmation(false); setRevokeConfirmation(false); setRegenerateSource(null); setModuleConfirmation(null); }
  function failConfirmation(reason: unknown) { setConfirmationError(actionableError(reason, "Timer action failed", "Review the timer configuration and local service, then retry the action.")); }
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
  function closeEditor() { if (mutationRef.current) return; clearFeedback(); setEditorOpen(false); setPickerRole(null); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (mutationRef.current) return;
    clearFeedback();
    const parsed = timerDefinitionInputSchema.safeParse(draft);
    if (!parsed.success) { setDefinitionError(parsed.error.issues[0]?.message ?? "Correct the timer definition before saving."); return; }
    setDefinitionError(null);
    mutationRef.current = true; setBusy(true); clearFeedback();
    try {
      const input = parsed.data; const creating = selected === null;
      await (creating ? api.create(input) : api.update(selected.id, input));
      setEditorOpen(false); setSelectedId(null); await load(); showNotice(creating ? "Timer created." : "Timer saved. Changes apply to the next run.");
    } catch (reason) { showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function command(commandName: TimerCommand, id = selectedId) {
    if (id === null || mutationRef.current) return; mutationRef.current = true; setBusy(true); clearFeedback();
    stateRevisionRef.current += 1;
    try { const result = await api.command(id, commandName); const nextStates = await api.listStates(); stateRevisionRef.current += 1; setStates(nextStates); setRefreshError(null); showNotice(result.changed ? `Timer ${commandName}ed.` : "Timer state did not change."); }
    catch (reason) { showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function adjust(input: import("@stream-jams/core").TimerAdjustment) {
    if (selectedId === null || mutationRef.current) return;
    mutationRef.current = true; setBusy(true); clearFeedback(); stateRevisionRef.current += 1;
    try { await api.adjust(selectedId, input); const next = await api.listStates(); stateRevisionRef.current += 1; setStates(next); setRefreshError(null); showNotice("Timer adjusted."); }
    catch (reason) { showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function remove() {
    if (selectedId === null || active !== null || mutationRef.current) return; mutationRef.current = true; setBusy(true); clearFeedback();
    try { await api.remove(selectedId); setEditorOpen(false); setSelectedId(null); await load(); showNotice("Timer deleted."); }
    catch (reason) { showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function saveLayout() {
    if (layout === null || mutationRef.current) return;
    const parsed = timersOverlayModuleConfigSchema.safeParse(layout);
    if (!parsed.success) { setLayoutError(parsed.error.issues[0]?.message ?? "Correct the overlay layout before saving."); return; }
    setLayoutError(null);
    mutationRef.current = true; setBusy(true); clearFeedback();
    try { const saved = await api.saveModuleConfig(enabled, parsed.data); setLayout(saved.config); showNotice("Timer overlay layout saved."); }
    catch (reason) { showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function confirmModuleEnablement() {
    if (moduleConfirmation === null || mutationRef.current) return; mutationRef.current = true; setBusy(true); clearFeedback();
    try {
      const nextEnabled = await api.setModuleEnabled(moduleConfirmation); setEnabled(nextEnabled);
      showNotice(`Timers module is now ${nextEnabled ? "enabled" : "disabled"}.`); setModuleConfirmation(null);
    } catch (reason) { failConfirmation(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function createBrowserSource(source: TimerBrowserSource) {
    if (mutationRef.current) return;
    mutationRef.current = true; setBusy(true); clearFeedback();
    try { await api.createBrowserSource(source); setBrowserSources(await api.listBrowserSources()); showNotice(`${profileLabel(source.targetProfileId)} URL created.`); }
    catch (reason) { showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function confirmRegenerateSource() {
    if (regenerateSource === null || mutationRef.current) return; mutationRef.current = true; setBusy(true); clearFeedback();
    try {
      await api.regenerateBrowserSource(regenerateSource); setBrowserSources(await api.listBrowserSources());
      showNotice(`${profileLabel(regenerateSource.targetProfileId)} URL regenerated. Update OBS with the new URL.`, "warning"); setRegenerateSource(null);
    } catch (reason) { failConfirmation(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function copyBrowserSource(source: TimerBrowserSource) {
    if (source.url === null) return;
    try { await navigator.clipboard.writeText(source.url); showNotice(`${profileLabel(source.targetProfileId)} URL copied.`); }
    catch (reason) { showError(reason); }
  }
  async function rotateCredential() {
    if (mutationRef.current) return;
    mutationRef.current = true; setBusy(true); clearFeedback(); try { const issued = await api.rotateAutomationCredential(); setCredential(issued); setIssuedToken(issued.token); setRotateConfirmation(false); showNotice("Automation credential created. Copy it now; it will not be shown again.", "warning"); }
    catch (reason) { if (rotateConfirmation) failConfirmation(reason); else showError(reason); } finally { mutationRef.current = false; setBusy(false); }
  }
  async function revokeCredential() {
    if (mutationRef.current) return;
    mutationRef.current = true; setBusy(true); clearFeedback(); try { await api.revokeAutomationCredential(); setCredential({ configured: false, createdAt: null, rotatedAt: null }); setIssuedToken(null); setRevokeConfirmation(false); showNotice("Automation credential revoked."); }
    catch (reason) { failConfirmation(reason); } finally { mutationRef.current = false; setBusy(false); }
  }

  const feedback = <>
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
    {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
  </>;
  const feedbackOwner = editorOpen ? "editor" : "page";

  if (loading && layout === null) return <p className="management-empty" role="status">Loading timers…</p>;
  return <>
    <ModulePageLayout className="timers-page" feedback={<>
    {refreshError === null ? null : <ManagementErrorBanner error={refreshError} />}
    {error === null ? null : <ManagementErrorBanner error={error} />}
    {feedbackOwner === "page" ? feedback : null}
    </>} controls={<ModuleControls status={<StatusBadge label={enabled ? "Module enabled" : "Module disabled"} tone={enabled ? "positive" : "neutral"} />} description="Create reusable countdowns and control their active runs."><Button ref={fallbackRef} variant="default" disabled={busy} onClick={() => { if (reviewConfirmation()) setModuleConfirmation(!enabled); }}>{enabled ? "Disable Timers module" : "Enable Timers module"}</Button></ModuleControls>} outputs={<BrowserSources busy={busy} expanded={sourcesExpanded} onCopy={source => void copyBrowserSource(source)} onCreate={source => void createBrowserSource(source)}
      onRegenerate={source => { if (reviewConfirmation()) setRegenerateSource(source); }} onToggle={() => setSourcesExpanded(value => !value)} onToggleReveal={source => setRevealedSourceIds(current => {
        const next = new Set(current); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next;
      })} revealedSourceIds={revealedSourceIds} sources={browserSources} refreshFailed={refreshError !== null} />} >
    <ModuleSection title="Timer definitions" label="Timer definitions" actions={<Button disabled={busy} onClick={openCreate}>New timer</Button>}>
      {definitions.length === 0 ? <div className="timers-empty"><h3>No timers yet</h3><p>Create one for a recurring stream activity.</p><Button onClick={openCreate} type="button">Create timer</Button></div> : <div className="timers-list">{definitions.map(item => { const state = stateById.get(item.id); return <article aria-label={`${item.label} timer`} className="timer-row" key={item.id}><Button variant="subtle" className="timer-row__identity" onClick={() => openEdit(item.id)} type="button"><span className="timer-row__identity-label"><strong>{item.label}</strong><span>{formatTimerRemaining(item.durationMs)}</span></span></Button><StatusBadge label={state?.status ?? "Idle"} tone={state?.status === "running" ? "positive" : state?.status === "completed" ? "warning" : "neutral"} /><div className="timer-row__actions"><Button variant="default" onClick={() => openEdit(item.id)} type="button">Edit</Button><Button variant="default" disabled={busy} onClick={() => void command(state?.status === "paused" ? "resume" : "start", item.id)} type="button">{state?.status === "paused" ? "Resume" : "Start"}</Button></div></article>; })}</div>}
    </ModuleSection>
    {layout === null ? null : <ModuleSection title="Overlay layout" label="Overlay layout" id="timer-presentation" description="Position the timer stack independently for each output profile."><TimerStackEditor assetApi={assetApi} definitions={definitions} value={layout} onChange={setLayout} /><div className="timer-layout-save">{layoutError === null ? null : <p role="alert">{layoutError}</p>}<Button disabled={busy} onClick={() => void saveLayout()} type="button">Save overlay layout</Button></div></ModuleSection>}
    <ModuleSection title="Automation credential" label="Automation credential" id="timer-credential" description={credential?.configured ? "Configured. Rotating invalidates the previous credential immediately." : "Not configured."}>{issuedToken === null ? null : <div className="timer-token"><label>Copy this credential now<input readOnly value={issuedToken} /></label><Button onClick={() => void navigator.clipboard?.writeText(issuedToken)} type="button">Copy</Button><Button variant="default" onClick={() => setIssuedToken(null)} type="button">Dismiss</Button></div>}<div className="timer-credential__actions"><Button disabled={busy} onClick={() => { if (!reviewConfirmation()) return; if (credential?.configured) setRotateConfirmation(true); else void rotateCredential(); }} type="button">{credential?.configured ? "Rotate credential" : "Create credential"}</Button><Button color="red" variant="subtle" disabled={busy || !credential?.configured} onClick={() => { if (reviewConfirmation()) setRevokeConfirmation(true); }} type="button">Revoke</Button></div></ModuleSection>
    </ModulePageLayout>
    <ModalSurface labelledBy="timer-editor-title" onCancel={closeEditor} open={editorOpen} pending={busy} restoreFocusFallbackRef={fallbackRef}><form className="timer-editor" onSubmit={save}>{feedbackOwner === "editor" ? feedback : null}<div className="timer-section-heading"><div><p className="management-eyebrow">Definition</p><ManagementModalTitle>{selected === null ? "Create timer" : `Edit ${selected.label}`}</ManagementModalTitle></div>{active === null ? null : <StatusBadge label={active.status} tone={active.status === "running" ? "positive" : "warning"} />}</div>
      {active === null ? null : <p className="timer-editor__notice">This run keeps its current name, duration, assets, and outputs. Saved edits apply next time.</p>}
      {definitionError === null ? null : <p role="alert">{definitionError}</p>}
      <TextInput label="Name" required withAsterisk={false} maxLength={120} value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} />
      <TextInput label="Duration (seconds)" required min="1" type="number" value={draft.durationMs / 1000} onChange={event => setDraft({ ...draft, durationMs: Math.round(Number(event.currentTarget.value) * 1000) })} withAsterisk={false} />
      <TimerEventRulesEditor rules={draft.eventRules ?? []} onChange={eventRules => setDraft({ ...draft, eventRules })} />
      {selectedId === null ? null : <TimerAdjustmentControls disabled={busy} onApply={adjust} />}
      <fieldset><legend>Assets</legend>{(["iconAssetId", "startAudioAssetId", "endAudioAssetId"] as const).map(role => <div className="timer-asset-row" key={role}><span>{role === "iconAssetId" ? "Icon" : role === "startAudioAssetId" ? "Start sound" : "End sound"}</span><code>{draft[role] ?? "None"}</code><Button variant="default" onClick={() => setPickerRole(role)} type="button">Choose</Button>{draft[role] === null ? null : <Button variant="default" onClick={() => setDraft({ ...draft, [role]: null })} type="button">Clear</Button>}</div>)}</fieldset>
      <fieldset className="timer-output-options"><legend>Audio outputs</legend><Checkbox label="Browser Source" checked={draft.outputs.browserSource} onChange={event => setDraft({ ...draft, outputs: { ...draft.outputs, browserSource: event.currentTarget.checked } })} />{routes.map(route => <Checkbox key={route.id} label={route.name} checked={draft.outputs.deviceRouteIds.includes(route.id)} onChange={() => setDraft({ ...draft, outputs: { ...draft.outputs, deviceRouteIds: draft.outputs.deviceRouteIds.includes(route.id) ? draft.outputs.deviceRouteIds.filter(id => id !== route.id) : [...draft.outputs.deviceRouteIds, route.id] } })} />)}</fieldset>
      <div className="management-modal__actions"><Button variant="default" disabled={busy} onClick={closeEditor} type="button">Cancel</Button>{selected === null ? null : <><Button variant="default" disabled={busy || active?.status !== "running"} onClick={() => void command("pause")} type="button">Pause</Button><Button variant="default" disabled={busy || active?.status !== "paused"} onClick={() => void command("resume")} type="button">Resume</Button><Button variant="default" disabled={busy || active === null} onClick={() => void command("stop")} type="button">Stop</Button><Button variant="default" disabled={busy} onClick={() => void command("restart")} type="button">Restart</Button><Button color="red" variant="subtle" disabled={busy || active !== null} onClick={() => void remove()} type="button">Delete</Button></>}<Button disabled={busy} type="submit">{selected === null ? "Create timer" : "Save timer"}</Button></div>
    </form></ModalSurface>
    <DestructiveConfirmationDialog open={rotateConfirmation} title="Rotate timer automation credential?" scope="Timer automation credential" consequences="The current credential stops working immediately. Existing Stream Deck actions will stop working until you update them with the new credential. The old credential cannot be recovered." recovery={null} actionLabel="Confirm rotation" targetId="timer-credential:rotate" pending={busy} error={confirmationError} restoreFocusFallbackRef={fallbackRef} onCancel={closeConfirmation} onConfirm={rotateCredential} />
    <DestructiveConfirmationDialog open={revokeConfirmation} title="Revoke the timer automation credential?" scope="Timer automation credential" consequences="Existing Stream Deck actions will stop working." recovery={null} actionLabel="Revoke credential" targetId="timer-credential:revoke" pending={busy} error={confirmationError} restoreFocusFallbackRef={fallbackRef} onCancel={closeConfirmation} onConfirm={revokeCredential} />
    <DestructiveConfirmationDialog open={regenerateSource !== null} title={`Regenerate ${regenerateSource === null ? "" : profileLabel(regenerateSource.targetProfileId)} URL?`} scope={regenerateSource === null ? "Timer browser source" : profileLabel(regenerateSource.targetProfileId)} consequences="The current URL will stop working immediately. Update the Browser Source in OBS after regeneration." recovery={null} actionLabel="Regenerate URL" targetId={regenerateSource?.id ?? "none"} pending={busy} error={confirmationError} restoreFocusFallbackRef={fallbackRef} onCancel={closeConfirmation} onConfirm={confirmRegenerateSource} />
    <DestructiveConfirmationDialog open={moduleConfirmation !== null} title={`${moduleConfirmation ? "Enable" : "Disable"} Timers module?`} scope="Timers module" consequences={moduleConfirmation ? "Timer runs can appear in enabled browser and desktop overlay surfaces." : "Timer definitions and active runs remain available, but Timers stop rendering until the module is enabled again."} recovery={null} actionLabel="Confirm change" targetId={`module:${String(moduleConfirmation)}`} pending={busy} error={confirmationError} restoreFocusFallbackRef={fallbackRef} onCancel={closeConfirmation} onConfirm={confirmModuleEnablement} />
    <AssetPicker assetApi={assetApi} compatibleMediaTypes={pickerRole === "iconAssetId" ? ["image", "gif"] : ["audio"]} managementApi={managementApi} onCancel={() => setPickerRole(null)} onSelect={assetId => { if (pickerRole !== null) setDraft(current => ({ ...current, [pickerRole]: assetId })); setPickerRole(null); }} open={pickerRole !== null} selectedAssetId={pickerRole === null ? null : draft[pickerRole]} />
  </>;
}

function BrowserSources({ busy, expanded, refreshFailed, onCopy, onCreate, onRegenerate, onToggle, onToggleReveal, revealedSourceIds, sources }: {
  readonly refreshFailed: boolean; readonly busy: boolean; readonly expanded: boolean; readonly onCopy: (source: TimerBrowserSource) => void; readonly onCreate: (source: TimerBrowserSource) => void;
  readonly onRegenerate: (source: TimerBrowserSource) => void; readonly onToggle: () => void; readonly onToggleReveal: (source: TimerBrowserSource) => void;
  readonly revealedSourceIds: ReadonlySet<string>; readonly sources: readonly TimerBrowserSource[];
}) {
  const ready = sources.filter(source => source.status === "available").length; const needsSetup = sources.length - ready;
  return <BrowserSourcesPanel id="browser-sources" refreshFailed={refreshFailed} detailsId="timer-browser-source-details" expanded={expanded} onToggle={onToggle} readyCount={ready} needsSetupCount={needsSetup}>
    <div className="timer-browser-sources__list">{sources.map(source => { const label = profileLabel(source.targetProfileId); const dimensions = profileDimensions[source.targetProfileId]; const revealed = revealedSourceIds.has(source.id); return <BrowserSourceRow key={source.id} label={label} ready={source.status === "available"} telemetry={source.connectionState === "connected" ? "Listening now" : source.lastConnectedAt === null ? "Not listening. No connection recorded." : `Not listening. Last seen ${formatDateTime(source.lastConnectedAt)}`} metadata={<strong><bdi dir="ltr">{dimensions.width} x {dimensions.height}</bdi></strong>} guidance={<>Add a Browser Source in OBS at <bdi dir="ltr">{dimensions.width} x {dimensions.height}</bdi>, then paste this URL.</>} url={source.url === null ? <p>Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source URL`} readOnly value={source.url} /> : <code>{maskRouteKey(source.url)}</code>} actions={<>{source.status === "create-required" ? <Button disabled={busy} onClick={() => onCreate(source)}>Create {label} URL</Button> : null}{source.url === null ? null : <><Button aria-label={`${revealed ? "Hide" : "Reveal"} ${label} URL`} variant="default" onClick={() => onToggleReveal(source)}>{revealed ? "Hide" : "Reveal"}</Button><Button aria-label={`Copy ${label} URL`} variant="default" onClick={() => onCopy(source)}>Copy</Button></>}{source.status !== "create-required" ? <Button aria-label={`Regenerate ${label} URL`} color="red" variant="light" disabled={busy} onClick={() => onRegenerate(source)}>Regenerate</Button> : null}</>} />; })}</div>
  </BrowserSourcesPanel>;
}

function toInput(definition: TimerDefinition): TimerDefinitionInput { return { label: definition.label, durationMs: definition.durationMs, iconAssetId: definition.iconAssetId,
  startAudioAssetId: definition.startAudioAssetId, endAudioAssetId: definition.endAudioAssetId, outputs: definition.outputs, ...(definition.eventRules === undefined ? {} : { eventRules: definition.eventRules }) }; }
function profileLabel(profile: "landscape" | "vertical") { return profile === "landscape" ? "Landscape" : "Vertical"; }
function maskRouteKey(url: string) { return url.replace(/(\/live\/)[^?]+/u, "$1********"); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
