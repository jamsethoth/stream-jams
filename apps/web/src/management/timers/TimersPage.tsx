import { formatTimerRemaining, timerDefinitionInputSchema, timersOverlayModuleConfigSchema, type TimerDefinition, type TimerDefinitionInput, type TimerRunState, type TimersOverlayModuleConfig } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import { AssetPicker } from "../assets/AssetPicker.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { ManagementHttpError } from "../management-http-client.js";
import { TimerStackEditor } from "./TimerStackEditor.js";
import { defaultTimersApi, type TimerAutomationCredentialStatus, type TimerBrowserSource, type TimerCommand, type TimersApi } from "./timers-api.js";
import "./timers.css";

type AssetRole = "iconAssetId" | "startAudioAssetId" | "endAudioAssetId";
const emptyDraft: TimerDefinitionInput = { label: "", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
  outputs: { browserSource: true, deviceRouteIds: [] } };
const profileDimensions = { landscape: { width: 1920, height: 1080 }, vertical: { width: 1080, height: 1920 } } as const;

export function TimersPage({ assetApi, audioApi, managementApi, api = defaultTimersApi }: {
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
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const selected = definitions.find(item => item.id === selectedId) ?? null; const active = states.find(state => state.definitionId === selectedId) ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDefinitions, nextStates, moduleConfig, credentialStatus, audioStatus, nextBrowserSources] = await Promise.all([
        api.list(), api.listStates(), api.getModuleConfig(), api.getAutomationCredential(), audioApi.getStatus(), api.listBrowserSources()
      ]);
      setDefinitions(nextDefinitions); setStates(nextStates); setLayout(moduleConfig.config); setEnabled(moduleConfig.enabled); setCredential(credentialStatus);
      setRoutes(audioStatus.routes.map(({ route }) => ({ id: route.id, name: route.name }))); setBrowserSources(nextBrowserSources); setError("");
    } catch (reason) { setError(messageFor(reason)); } finally { setLoading(false); }
  }, [api, audioApi]);
  useEffect(() => { void load(); return () => setIssuedToken(null); }, [load]);
  useEffect(() => { if (editorOpen) setDraft(selected === null ? emptyDraft : toInput(selected)); }, [editorOpen, selected]);
  const stateById = useMemo(() => new Map(states.map(state => [state.definitionId, state])), [states]);

  function openCreate() { setSelectedId(null); setDraft(emptyDraft); setEditorOpen(true); }
  function openEdit(id: string) { setSelectedId(id); setEditorOpen(true); }
  function closeEditor() { setEditorOpen(false); setPickerRole(null); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const input = timerDefinitionInputSchema.parse(draft); const creating = selected === null;
      await (creating ? api.create(input) : api.update(selected.id, input));
      setEditorOpen(false); setSelectedId(null); await load(); setMessage(creating ? "Timer created." : "Timer saved. Changes apply to the next run.");
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function command(commandName: TimerCommand, id = selectedId) {
    if (id === null) return; setBusy(true);
    try { const result = await api.command(id, commandName); await load(); setMessage(result.changed ? `Timer ${commandName}ed.` : "Timer state did not change."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function remove() {
    if (selectedId === null || active !== null) return; setBusy(true);
    try { await api.remove(selectedId); setEditorOpen(false); setSelectedId(null); await load(); setMessage("Timer deleted."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function saveLayout() {
    if (layout === null) return; setBusy(true);
    try { const saved = await api.saveModuleConfig(enabled, timersOverlayModuleConfigSchema.parse(layout)); setLayout(saved.config); setMessage("Timer overlay layout saved."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function confirmModuleEnablement() {
    if (moduleConfirmation === null) return; setBusy(true);
    try {
      const nextEnabled = await api.setModuleEnabled(moduleConfirmation); setEnabled(nextEnabled);
      setMessage(`Timers module is now ${nextEnabled ? "enabled" : "disabled"}.`); setModuleConfirmation(null);
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function createBrowserSource(source: TimerBrowserSource) {
    setBusy(true);
    try { await api.createBrowserSource(source); setBrowserSources(await api.listBrowserSources()); setMessage(`${profileLabel(source.targetProfileId)} URL created.`); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function confirmRegenerateSource() {
    if (regenerateSource === null) return; setBusy(true);
    try {
      await api.regenerateBrowserSource(regenerateSource); setBrowserSources(await api.listBrowserSources());
      setMessage(`${profileLabel(regenerateSource.targetProfileId)} URL regenerated. Update OBS with the new URL.`); setRegenerateSource(null);
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function copyBrowserSource(source: TimerBrowserSource) {
    if (source.url === null) return;
    try { await navigator.clipboard.writeText(source.url); setMessage(`${profileLabel(source.targetProfileId)} URL copied.`); }
    catch (reason) { setError(messageFor(reason)); }
  }
  async function rotateCredential() {
    setBusy(true); try { const issued = await api.rotateAutomationCredential(); setCredential(issued); setIssuedToken(issued.token); setMessage("Automation credential created. Copy it now; it will not be shown again."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function revokeCredential() {
    if (!window.confirm("Revoke the timer automation credential? Existing Stream Deck actions will stop working.")) return;
    setBusy(true); try { await api.revokeAutomationCredential(); setCredential({ configured: false, createdAt: null, rotatedAt: null }); setIssuedToken(null); setMessage("Automation credential revoked."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }

  if (loading && layout === null) return <p className="management-empty" role="status">Loading timers…</p>;
  return <div className="timers-page">
    <div aria-live="polite" className="sr-only">{message}</div>{error === "" ? null : <div className="management-error-banner" role="alert"><strong>Timer action failed</strong><p>{error}</p></div>}
    <BrowserSources busy={busy} expanded={sourcesExpanded} onCopy={source => void copyBrowserSource(source)} onCreate={source => void createBrowserSource(source)}
      onRegenerate={setRegenerateSource} onToggle={() => setSourcesExpanded(value => !value)} onToggleReveal={source => setRevealedSourceIds(current => {
        const next = new Set(current); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next;
      })} revealedSourceIds={revealedSourceIds} sources={browserSources} />
    <section className="timers-inventory" aria-labelledby="timer-inventory-heading"><div className="timer-section-heading"><div><h2 id="timer-inventory-heading">Timers</h2><p>Create reusable countdowns and control their active runs.</p><StatusBadge label={enabled ? "Module enabled" : "Module disabled"} tone={enabled ? "positive" : "neutral"} /></div><div className="timer-row__actions"><button className="button button--secondary" disabled={busy} onClick={() => setModuleConfirmation(!enabled)} type="button">{enabled ? "Disable Timers module" : "Enable Timers module"}</button><button className="button button--primary" onClick={openCreate} type="button">New timer</button></div></div>
      {definitions.length === 0 ? <div className="timers-empty"><h3>No timers yet</h3><p>Create one for a recurring stream activity.</p><button onClick={openCreate} type="button">Create timer</button></div> : <div className="timers-list">{definitions.map(item => { const state = stateById.get(item.id); return <article aria-label={`${item.label} timer`} className="timer-row" key={item.id}><button className="timer-row__identity" onClick={() => openEdit(item.id)} type="button"><strong>{item.label}</strong><span>{formatTimerRemaining(item.durationMs)}</span></button><StatusBadge label={state?.status ?? "Idle"} tone={state?.status === "running" ? "positive" : state?.status === "completed" ? "warning" : "neutral"} /><div className="timer-row__actions"><button className="button button--secondary button--compact" onClick={() => openEdit(item.id)} type="button">Edit</button><button className="button button--compact" disabled={busy} onClick={() => void command(state?.status === "paused" ? "resume" : "start", item.id)} type="button">{state?.status === "paused" ? "Resume" : "Start"}</button></div></article>; })}</div>}
    </section>
    {layout === null ? null : <section className="timer-presentation" aria-labelledby="timer-presentation-heading"><div className="timer-section-heading"><div><h2 id="timer-presentation-heading">Overlay layout</h2><p>Position the timer stack independently for each output profile.</p></div></div><TimerStackEditor assetApi={assetApi} definitions={definitions} value={layout} onChange={setLayout} /><div className="timer-layout-save"><button disabled={busy} onClick={() => void saveLayout()} type="button">Save overlay layout</button></div></section>}
    <section className="timer-credential" aria-labelledby="timer-credential-heading"><div><p className="management-eyebrow">Stream Deck HTTP</p><h2 id="timer-credential-heading">Automation credential</h2><p>{credential?.configured ? "Configured. Rotating invalidates the previous credential immediately." : "Not configured."}</p></div>{issuedToken === null ? null : <div className="timer-token"><label>Copy this credential now<input readOnly value={issuedToken} /></label><button onClick={() => void navigator.clipboard?.writeText(issuedToken)} type="button">Copy</button><button className="button button--secondary" onClick={() => setIssuedToken(null)} type="button">Dismiss</button></div>}<div className="timer-credential__actions"><button disabled={busy} onClick={() => void rotateCredential()} type="button">{credential?.configured ? "Rotate credential" : "Create credential"}</button><button className="button button--danger-quiet" disabled={busy || !credential?.configured} onClick={() => void revokeCredential()} type="button">Revoke</button></div></section>
    <ModalSurface labelledBy="timer-editor-title" onCancel={closeEditor} open={editorOpen}><form className="timer-editor" onSubmit={save}><div className="timer-section-heading"><div><p className="management-eyebrow">Definition</p><h2 id="timer-editor-title">{selected === null ? "Create timer" : `Edit ${selected.label}`}</h2></div>{active === null ? null : <StatusBadge label={active.status} tone={active.status === "running" ? "positive" : "warning"} />}</div>
      {active === null ? null : <p className="timer-editor__notice">This run keeps its current name, duration, assets, and outputs. Saved edits apply next time.</p>}
      <label>Name<input required maxLength={120} value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} /></label>
      <label>Duration (seconds)<input required min="1" type="number" value={draft.durationMs / 1000} onChange={event => setDraft({ ...draft, durationMs: Math.round(Number(event.currentTarget.value) * 1000) })} /></label>
      <fieldset><legend>Assets</legend>{(["iconAssetId", "startAudioAssetId", "endAudioAssetId"] as const).map(role => <div className="timer-asset-row" key={role}><span>{role === "iconAssetId" ? "Icon" : role === "startAudioAssetId" ? "Start sound" : "End sound"}</span><code>{draft[role] ?? "None"}</code><button className="button button--secondary button--compact" onClick={() => setPickerRole(role)} type="button">Choose</button>{draft[role] === null ? null : <button className="button button--secondary button--compact" onClick={() => setDraft({ ...draft, [role]: null })} type="button">Clear</button>}</div>)}</fieldset>
      <fieldset className="timer-output-options"><legend>Audio outputs</legend><label className="timer-output-option"><input checked={draft.outputs.browserSource} onChange={event => setDraft({ ...draft, outputs: { ...draft.outputs, browserSource: event.currentTarget.checked } })} type="checkbox" /> Browser Source</label>{routes.map(route => <label className="timer-output-option" key={route.id}><input checked={draft.outputs.deviceRouteIds.includes(route.id)} onChange={() => setDraft({ ...draft, outputs: { ...draft.outputs, deviceRouteIds: draft.outputs.deviceRouteIds.includes(route.id) ? draft.outputs.deviceRouteIds.filter(id => id !== route.id) : [...draft.outputs.deviceRouteIds, route.id] } })} type="checkbox" /> {route.name}</label>)}</fieldset>
      <div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={closeEditor} type="button">Cancel</button>{selected === null ? null : <><button className="button button--secondary" disabled={busy || active?.status !== "running"} onClick={() => void command("pause")} type="button">Pause</button><button className="button button--secondary" disabled={busy || active?.status !== "paused"} onClick={() => void command("resume")} type="button">Resume</button><button className="button button--secondary" disabled={busy || active === null} onClick={() => void command("stop")} type="button">Stop</button><button className="button button--secondary" disabled={busy} onClick={() => void command("restart")} type="button">Restart</button><button className="button button--danger-quiet" disabled={busy || active !== null} onClick={() => void remove()} type="button">Delete</button></>}<button disabled={busy} type="submit">{selected === null ? "Create timer" : "Save timer"}</button></div>
    </form></ModalSurface>
    <ModalSurface labelledBy="timer-regenerate-title" onCancel={() => setRegenerateSource(null)} open={regenerateSource !== null}><div className="timer-confirmation"><h2 id="timer-regenerate-title">Regenerate {regenerateSource === null ? "" : profileLabel(regenerateSource.targetProfileId)} URL?</h2><p>The current URL will stop working immediately. Update the Browser Source in OBS after regeneration.</p><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => setRegenerateSource(null)} type="button">Cancel</button><button className="button button--danger" disabled={busy} onClick={() => void confirmRegenerateSource()} type="button">Regenerate URL</button></div></div></ModalSurface>
    <ModalSurface labelledBy="timer-module-confirm-title" onCancel={() => setModuleConfirmation(null)} open={moduleConfirmation !== null}>{moduleConfirmation === null ? null : <div className="timer-confirmation"><h2 id="timer-module-confirm-title">{moduleConfirmation ? "Enable" : "Disable"} Timers module?</h2><p>{moduleConfirmation ? "Timer runs can appear in enabled browser and desktop overlay surfaces." : "Timer definitions and active runs remain available, but Timers stop rendering until the module is enabled again."}</p><div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => setModuleConfirmation(null)} type="button">Cancel</button><button className="button button--primary" disabled={busy} onClick={() => void confirmModuleEnablement()} type="button">Confirm change</button></div></div>}</ModalSurface>
    <AssetPicker assetApi={assetApi} compatibleMediaTypes={pickerRole === "iconAssetId" ? ["image"] : ["audio"]} managementApi={managementApi} onCancel={() => setPickerRole(null)} onSelect={assetId => { if (pickerRole !== null) setDraft(current => ({ ...current, [pickerRole]: assetId })); setPickerRole(null); }} open={pickerRole !== null} selectedAssetId={pickerRole === null ? null : draft[pickerRole]} />
  </div>;
}

function BrowserSources({ busy, expanded, onCopy, onCreate, onRegenerate, onToggle, onToggleReveal, revealedSourceIds, sources }: {
  readonly busy: boolean; readonly expanded: boolean; readonly onCopy: (source: TimerBrowserSource) => void; readonly onCreate: (source: TimerBrowserSource) => void;
  readonly onRegenerate: (source: TimerBrowserSource) => void; readonly onToggle: () => void; readonly onToggleReveal: (source: TimerBrowserSource) => void;
  readonly revealedSourceIds: ReadonlySet<string>; readonly sources: readonly TimerBrowserSource[];
}) {
  const ready = sources.filter(source => source.status === "available").length; const needsSetup = sources.length - ready;
  return <section aria-label="Browser sources" className="timer-browser-sources"><div className="timer-browser-sources__row"><div className="timer-browser-sources__heading"><h2><button aria-controls="timer-browser-source-details" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} browser sources`} className="timer-browser-sources__toggle" onClick={onToggle} type="button"><span aria-hidden="true">{expanded ? "−" : "+"}</span><span>Browser sources</span></button></h2><p>One live URL per target profile.</p></div><div className="timer-browser-sources__summary">{ready > 0 ? <span className="timer-browser-sources__count timer-browser-sources__count--ready">{ready} ready</span> : null}{needsSetup > 0 ? <span className="timer-browser-sources__count timer-browser-sources__count--warning">{needsSetup} needs setup</span> : null}</div></div>
    {expanded ? <div className="timer-browser-sources__details" id="timer-browser-source-details"><div className="timer-browser-sources__list">{sources.map(source => { const label = profileLabel(source.targetProfileId); const dimensions = profileDimensions[source.targetProfileId]; const revealed = revealedSourceIds.has(source.id); return <article aria-label={`${label} browser source`} className="timer-browser-source" key={source.id}><div className="timer-browser-source__heading"><strong>{label}</strong><StatusBadge label={source.status === "available" ? "Ready" : "Needs setup"} tone={source.status === "available" ? "positive" : "warning"} /></div><p className="timer-browser-source__telemetry">{source.connectionState === "connected" ? "Listening now" : source.lastConnectedAt === null ? "Not listening. No connection recorded." : `Not listening. Last seen ${formatDateTime(source.lastConnectedAt)}`}</p><p className="timer-browser-source__dimensions"><strong>{dimensions.width} x {dimensions.height}</strong></p><p className="timer-browser-source__guidance">Add a Browser Source in OBS at {dimensions.width} x {dimensions.height}, then paste this URL.</p>{source.url === null ? <p className="timer-browser-source__missing">Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source URL`} readOnly value={source.url} /> : <code className="timer-browser-source__masked">{maskRouteKey(source.url)}</code>}<div className="timer-row__actions">{source.status === "create-required" ? <button disabled={busy} onClick={() => onCreate(source)} type="button">Create {label} URL</button> : null}{source.url === null ? null : <><button aria-label={`${revealed ? "Hide" : "Reveal"} ${label} URL`} className="button button--secondary" onClick={() => onToggleReveal(source)} type="button">{revealed ? "Hide" : "Reveal"}</button><button aria-label={`Copy ${label} URL`} className="button button--secondary" onClick={() => onCopy(source)} type="button">Copy</button></>}{source.status !== "create-required" ? <button aria-label={`Regenerate ${label} URL`} className="button button--danger" disabled={busy} onClick={() => onRegenerate(source)} type="button">Regenerate</button> : null}</div></article>; })}</div></div> : null}
  </section>;
}

function toInput(definition: TimerDefinition): TimerDefinitionInput { return { label: definition.label, durationMs: definition.durationMs, iconAssetId: definition.iconAssetId,
  startAudioAssetId: definition.startAudioAssetId, endAudioAssetId: definition.endAudioAssetId, outputs: definition.outputs }; }
function messageFor(reason: unknown): string { return reason instanceof ManagementHttpError || reason instanceof Error ? reason.message : "The timer request failed."; }
function profileLabel(profile: "landscape" | "vertical") { return profile === "landscape" ? "Landscape" : "Vertical"; }
function maskRouteKey(url: string) { return url.replace(/(\/live\/)[^?]+/u, "$1********"); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
